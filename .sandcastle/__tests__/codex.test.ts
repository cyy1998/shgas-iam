import { expect, test } from "bun:test";
import { chmod, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { stringify } from "smol-toml";
import {
  checkCodexAuth,
  dockerRegistryAuthMount,
  loadCodexAgents,
  loadCodexRoles,
  parseCodexRole,
  stageCodexAuth,
} from "../codex.ts";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

test("loads the 5 AFK TOML roles and builds 6 AgentSlots reusing identical providers", async () => {
  const roles = await loadCodexRoles(repoRoot);
  expect(Object.keys(roles).sort()).toEqual([
    "implementer_deep",
    "implementer_light",
    "implementer_standard",
    "spec_reviewer",
    "standards_reviewer",
  ]);

  const slots = await loadCodexAgents({
    cwd: repoRoot,
    env: {
      CODEX_AUTH: "api-key",
      CODEX_API_KEY: "fixture-api-key",
      CODEX_HOME: "/tmp/codex-home-fixture",
    },
  });

  expect(Object.keys(slots).sort()).toEqual([
    "implementDeep",
    "implementLight",
    "implementStandard",
    "repair",
    "reviewSpec",
    "reviewStandards",
  ]);

  const expectedPairs = [
    [slots.implementLight, roles.implementer_light],
    [slots.implementStandard, roles.implementer_standard],
    [slots.implementDeep, roles.implementer_deep],
    [slots.reviewStandards, roles.standards_reviewer],
    [slots.reviewSpec, roles.spec_reviewer],
    [slots.repair, roles.implementer_deep],
  ] as const;

  for (const [slot, role] of expectedPairs) {
    expect(slot.instructions).toBe(role.instructions);
    expect(slot.provider.name).toBe("codex");
    expect(slot.provider.env).toEqual({ CODEX_API_KEY: "fixture-api-key" });
    const { command } = slot.provider.buildPrintCommand({ prompt: "Fixture", dangerouslySkipPermissions: true });
    expect(command).toContain(role.model);
    expect(command).toContain(`model_reasoning_effort="${role.effort}"`);
  }

  expect(slots.repair.provider).toBe(slots.implementDeep.provider);
  expect(slots.reviewStandards.provider).toBe(slots.reviewSpec.provider);
  expect(slots.implementLight.provider).not.toBe(slots.implementStandard.provider);
});

const validRole = {
  name: "implementer_standard",
  model: "fixture-model",
  model_reasoning_effort: "high",
  description: "Fixture implementer",
  developer_instructions: "Implement the ticket",
};

test.each([
  { name: "wrong_name" },
  { model: " " },
  { model_reasoning_effort: "unrecognized" },
  { description: " " },
  { developer_instructions: "" },
])("rejects invalid role metadata %j", (invalid) => {
  expect(() => parseCodexRole(stringify({ ...validRole, ...invalid }), "implementer_standard")).toThrow(
    /无效的 AFK 角色配置/,
  );
});

test.each(["standards_reviewer", "spec_reviewer"] as const)(
  "enforces sandbox_mode = read-only for reviewer role %s",
  (name) => {
    const writable = stringify({ ...validRole, name, sandbox_mode: "workspace-write" });
    const missing = stringify({ ...validRole, name });
    expect(() => parseCodexRole(writable, name)).toThrow(/必须为 read-only/);
    expect(() => parseCodexRole(missing, name)).toThrow(/必须为 read-only/);
  },
);

test("loadCodexAgents uses empty provider env in chatgpt mode and rejects missing API key in api-key mode", async () => {
  const slots = await loadCodexAgents({
    cwd: repoRoot,
    env: { CODEX_AUTH: "chatgpt", CODEX_API_KEY: "ignored-in-chatgpt-mode" },
  });
  expect(slots.implementStandard.provider.env).toEqual({});
  expect(slots.reviewSpec.provider.env).toEqual({});

  let missingKeyError: unknown;
  try {
    await loadCodexAgents({ cwd: repoRoot, env: { CODEX_AUTH: "api-key", CODEX_API_KEY: "  " } });
  } catch (error) {
    missingKeyError = error;
  }
  expect(missingKeyError).toBeInstanceOf(Error);
  expect(String(missingKeyError)).toContain("CODEX_API_KEY");
});

test("stageCodexAuth stages auth.json privately, writes back refreshed tokens atomically, and cleans up", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "sandcastle-codex-auth-"));
  let stagedDir: string | undefined;
  try {
    const source = join(cwd, "auth.json");
    await writeFile(source, '{"tokens":"original"}', { mode: 0o600 });
    await chmod(source, 0o640);

    await checkCodexAuth({ cwd, env: { CODEX_AUTH_FILE: source } });

    const staged = await stageCodexAuth({ cwd, env: { CODEX_AUTH_FILE: source }, sandboxHome: "/agent/.codex" });
    expect(staged.mode).toBe("chatgpt");
    expect(staged.env).toEqual({ CODEX_HOME: "/agent/.codex" });
    expect(staged.mounts).toHaveLength(1);
    stagedDir = staged.mounts[0]?.hostPath;
    if (!stagedDir) throw new Error("Expected staged mount directory");
    expect(staged.mounts[0]?.sandboxPath).toBe("/agent/.codex");
    expect(staged.mounts[0]?.readonly).toBeUndefined();

    const stagedFile = join(stagedDir, "auth.json");
    const stagedStat = await stat(stagedFile);
    expect(stagedStat.mode & 0o777).toBe(0o600);

    const updated = '{"tokens":"refreshed"}';
    await writeFile(stagedFile, updated);
    await staged.close();

    const writtenBack = await readFile(source, "utf8");
    const sourceStat = await stat(source);
    expect(writtenBack).toBe(updated);
    expect(sourceStat.mode & 0o777).toBe(0o640);

    let stagedGoneError: unknown;
    try {
      await stat(stagedDir);
    } catch (error) {
      stagedGoneError = error;
    }
    expect(stagedGoneError).toMatchObject({ code: "ENOENT" });
    stagedDir = undefined;
  } finally {
    if (stagedDir) await rm(stagedDir, { recursive: true, force: true });
    await rm(cwd, { recursive: true, force: true });
  }
});

test("stageCodexAuth degrades concurrent writeback conflict to a warning, retains staged dir, and preserves newer source", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "sandcastle-codex-conflict-"));
  let stagedDir: string | undefined;
  try {
    const source = join(cwd, "auth.json");
    await writeFile(source, '{"tokens":"initial"}', { mode: 0o600 });

    const warnings: string[] = [];
    const staged = await stageCodexAuth({
      cwd,
      source,
      warn: (message) => warnings.push(message),
    });
    stagedDir = staged.mounts[0]?.hostPath;
    if (!stagedDir) throw new Error("Expected staged mount directory");

    await writeFile(join(stagedDir, "auth.json"), '{"tokens":"session-a-refresh"}');
    const newerHost = '{"tokens":"session-b-newer-refresh"}';
    await writeFile(source, newerHost);

    let closeError: unknown;
    try {
      await staged.close();
    } catch (error) {
      closeError = error;
    }
    expect(closeError).toBeUndefined();

    const preservedHost = await readFile(source, "utf8");
    const retainedStaged = await readFile(join(stagedDir, "auth.json"), "utf8");
    expect(preservedHost).toBe(newerHost);
    expect(retainedStaged).toBe('{"tokens":"session-a-refresh"}');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain(stagedDir);
  } finally {
    if (stagedDir) await rm(stagedDir, { recursive: true, force: true });
    await rm(cwd, { recursive: true, force: true });
  }
});

test("stageCodexAuth handles api-key mode and rejects missing or symlinked auth.json in chatgpt mode", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "sandcastle-codex-modes-"));
  try {
    const apiKeyAuth = await stageCodexAuth({
      cwd,
      env: { CODEX_AUTH: "api-key", CODEX_API_KEY: "sk-fixture" },
    });
    expect(apiKeyAuth.mode).toBe("api-key");
    expect(apiKeyAuth.env).toEqual({ CODEX_API_KEY: "sk-fixture" });
    expect(apiKeyAuth.mounts).toEqual([]);
    await apiKeyAuth.close();

    await checkCodexAuth({ cwd, env: { CODEX_AUTH: "api-key", CODEX_API_KEY: "sk-fixture" } });

    let missingKeyError: unknown;
    try {
      await stageCodexAuth({ cwd, env: { CODEX_AUTH: "api-key" } });
    } catch (error) {
      missingKeyError = error;
    }
    expect(missingKeyError).toBeInstanceOf(Error);

    let missingFileError: unknown;
    try {
      await stageCodexAuth({ cwd, source: join(cwd, "missing.json") });
    } catch (error) {
      missingFileError = error;
    }
    expect(missingFileError).toBeInstanceOf(Error);
    expect(String(missingFileError)).toContain("auth.json");

    const realAuth = join(cwd, "real-auth.json");
    const linkedAuth = join(cwd, "link-auth.json");
    await writeFile(realAuth, '{"tokens":"real"}');
    await symlink(realAuth, linkedAuth);

    let symlinkError: unknown;
    try {
      await stageCodexAuth({ cwd, source: linkedAuth });
    } catch (error) {
      symlinkError = error;
    }
    expect(symlinkError).toBeInstanceOf(Error);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("dockerRegistryAuthMount directly bind-mounts the source file readonly without staging or schema validation", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "sandcastle-docker-mount-"));
  try {
    const unconfigured = await dockerRegistryAuthMount({ cwd, env: {} });
    expect(unconfigured).toBeUndefined();

    const source = join(cwd, "custom-docker-config.json");
    await writeFile(source, '{"auths":{"any.registry.local":{"auth":"token"}},"credsStore":"desktop"}');

    const mount = await dockerRegistryAuthMount({
      cwd,
      env: { SANDCASTLE_DOCKER_CONFIG_FILE: "custom-docker-config.json" },
    });
    expect(mount).toEqual({
      hostPath: source,
      sandboxPath: "/home/agent/.docker/config.json",
      readonly: true,
    });

    let missingError: unknown;
    try {
      await dockerRegistryAuthMount({ cwd, source: join(cwd, "missing-config.json") });
    } catch (error) {
      missingError = error;
    }
    expect(missingError).toBeInstanceOf(Error);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
