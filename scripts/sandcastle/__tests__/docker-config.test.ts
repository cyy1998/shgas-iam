import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { checkDockerConfig, closeDockerConfig, prepareDockerConfig } from "../docker-config.ts";

test("Docker configuration is optional and never reads ambient host credentials", async () => {
  const configured = await checkDockerConfig(tmpdir(), {});
  const config = await prepareDockerConfig(randomUUID(), tmpdir(), {});
  await config.close();
  expect(configured).toBe(false);
  expect(config.mounts).toEqual([]);
});

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
