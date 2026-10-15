import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkDockerConfig, closeDockerConfig, prepareDockerConfig } from "../sandcastle/docker-config.ts";
import { formatResourceFailure } from "../test-resources/managed-resources.mjs";

test("explicit single-registry Docker configuration gets private readonly executor copies", async () => {
  const sourceDirectory = await mkdtemp(join(tmpdir(), "iam-docker-config-test-"));
  const source = join(sourceDirectory, "config.json");
  const contents = JSON.stringify({ auths: { "docker.xuanyuan.run": { auth: "dGVzdDp0ZXN0" } } });
  await writeFile(source, contents);
  const env = { SANDCASTLE_DOCKER_CONFIG_FILE: source };
  const first = await prepareDockerConfig(randomUUID(), sourceDirectory, env);
  const second = await prepareDockerConfig(randomUUID(), sourceDirectory, env);
  try {
    const firstMount = first.mounts[0]!;
    const secondMount = second.mounts[0]!;
    const staged = await readFile(firstMount.hostPath, "utf8");
    expect(firstMount.sandboxPath).toBe("/home/agent/.docker/config.json");
    expect(firstMount.readonly).toBe(true);
    expect(firstMount.hostPath).not.toBe(secondMount.hostPath);
    expect(staged).toBe(contents);
    await first.close();
    let missing = false;
    try {
      await access(firstMount.hostPath);
    } catch {
      missing = true;
    }
    const retained = await readFile(secondMount.hostPath, "utf8");
    const original = await readFile(source, "utf8");
    expect(missing).toBe(true);
    expect(retained).toBe(contents);
    expect(original).toBe(contents);
  } finally {
    await first.close();
    await second.close();
    await rm(sourceDirectory, { recursive: true, force: true });
  }
});

test("Docker configuration is optional and never reads ambient host credentials", async () => {
  const configured = await checkDockerConfig(tmpdir(), {});
  const config = await prepareDockerConfig(randomUUID(), tmpdir(), {});
  await config.close();
  expect(configured).toBe(false);
  expect(config.mounts).toEqual([]);
});

test("preflight accepts a caller file relative to the target repository", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "iam-docker-config-relative-"));
  await writeFile(join(cwd, "config.json"), JSON.stringify({ auths: { "docker.xuanyuan.run": { auth: "test" } } }));
  try {
    const configured = await checkDockerConfig(cwd, { SANDCASTLE_DOCKER_CONFIG_FILE: "config.json" });
    expect(configured).toBe(true);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test.each(["private-marker-missing-file", "."])(
  "preflight rejects unreadable or non-file sources (%#)",
  async (source) => {
    let failure: unknown;
    try {
      await checkDockerConfig(tmpdir(), { SANDCASTLE_DOCKER_CONFIG_FILE: source });
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(Error);
    expect(formatResourceFailure(failure)).not.toContain("private-marker");
  },
);

test.each(["------------------------------------", "../../another-directory"])(
  "configuration recovery rejects invalid executor IDs (%#)",
  async (runId) => {
    let failure: unknown;
    try {
      await closeDockerConfig(runId);
    } catch (error) {
      failure = error;
    }
    expect(String(failure)).toContain("Invalid Docker configuration executor ID");
  },
);

test.each([
  '{"auths":{"docker.xuanyuan.run":{"auth":"private-marker"}},',
  JSON.stringify({ auths: { "docker.xuanyuan.run": { auth: "private-marker" } }, credsStore: "desktop" }),
  JSON.stringify({ auths: { "docker.xuanyuan.run": { auth: "private-marker" } }, credHelpers: {} }),
  JSON.stringify({ auths: { "docker.xuanyuan.run": { auth: "private-marker" } }, credentialHelpers: {} }),
  JSON.stringify({ auths: { "other.registry": { auth: "private-marker" } } }),
  JSON.stringify({ auths: { "docker.xuanyuan.run": { auth: "private-marker" }, "other.registry": {} } }),
  JSON.stringify({ auths: { "docker.xuanyuan.run": { auth: "" } } }),
  JSON.stringify({ auths: { "docker.xuanyuan.run": { auth: "private-marker" } }, proxies: {} }),
  "null",
])("rejects unsupported Docker configuration without exposing its contents (%#)", async (contents) => {
  const sourceDirectory = await mkdtemp(join(tmpdir(), "iam-docker-config-invalid-"));
  const source = join(sourceDirectory, "config.json");
  await writeFile(source, contents);
  let failure: unknown;
  try {
    const config = await prepareDockerConfig(randomUUID(), sourceDirectory, { SANDCASTLE_DOCKER_CONFIG_FILE: source });
    await config.close();
  } catch (error) {
    failure = error;
  } finally {
    await rm(sourceDirectory, { recursive: true, force: true });
  }
  expect(failure).toBeInstanceOf(Error);
  expect(formatResourceFailure(failure)).not.toContain("private-marker");
});
