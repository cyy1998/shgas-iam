import { afterEach, describe, expect, it } from "bun:test";
import { runValidate } from "../commands";

const originalManifestEnv = process.env.APISIX_MANIFEST_ENV;

afterEach(() => {
  if (originalManifestEnv === undefined) {
    delete process.env.APISIX_MANIFEST_ENV;
  } else {
    process.env.APISIX_MANIFEST_ENV = originalManifestEnv;
  }
});

describe("apisix sync commands", () => {
  it("rejects missing manifest scope", async () => {
    delete process.env.APISIX_MANIFEST_ENV;

    await expect(runValidate()).rejects.toThrow("Provide --env <env:app> or APISIX_MANIFEST_ENV");
  });
  it("rejects env-only scope", async () => {
    await expect(runValidate({ env: "dev" })).rejects.toThrow("Scope must use <env>:<app> format");
  });
  it("rejects invalid scope segments", async () => {
    await expect(runValidate({ env: "Dev:iam" })).rejects.toThrow(
      "env and app may only use lowercase letters, digits, and hyphens",
    );
  });
});
