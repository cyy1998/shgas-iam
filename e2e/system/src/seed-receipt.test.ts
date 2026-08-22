import { mkdir, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { persistSeedReceipt } from "./seed-receipt.ts";

describe("seed receipt", () => {
  test("persists only safe stage metadata and public scenario references", async () => {
    const directory = await mkdtemp(join(tmpdir(), "iam-e2e-seed-receipt-"));
    const path = join(directory, "seed-receipt.json");
    try {
      await persistSeedReceipt(path, {
        version: 1,
        stage: "seed",
        status: "applied",
        completedAt: "2026-08-06T12:30:00.000Z",
        scenario: {
          version: 1,
          runId: "run-receipt-01",
          canonicalOrigin: "http://127.0.0.1:43123",
          adminSubjectIdentifier: "3b766c91-1daa-4c09-89e4-ea87ad123456",
          adminUsername: "e2e-admin-run-receipt-01",
          organizationCode: "e2e-org-run-receipt-01",
          responsibilityTargetOrganizationCode:
            "e2e-resp-target-run-receipt-01",
          positionCode: "e2e-pos-run-receipt-01",
          responsibilityHolderPositionCode: "e2e-resp-pos-run-receipt-01",
          adminRoleCode: "e2e-role-run-receipt-01",
          adminClientCode: "e2e-admin-run-receipt-01",
          adminRedirectUri: "http://127.0.0.1:43123/iam-admin/*",
          customSsoClientCode: "e2e-custom-run-receipt-01",
          customSsoRedirectUri: "http://127.0.0.1:43123/e2e/custom-sso/*",
          internalClientCode: "e2e-internal-run-receipt-01",
          oidcClientCode: "e2e-oidc-run-receipt-01",
          oidcRedirectUri: "http://127.0.0.1:43123/e2e/oidc/callback",
          oidcPostLogoutRedirectUri: "http://127.0.0.1:43123/e2e/oidc/logged-out",
        },
      });

      const content = await readFile(path, "utf8");
      expect(JSON.parse(content)).toEqual(expect.objectContaining({
        stage: "seed",
        status: "applied",
      }));
      expect(content).not.toMatch(/password|token|secret/iu);
    }
    finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  test("removes the exclusive temporary file when final replacement fails", async () => {
    const directory = await mkdtemp(join(tmpdir(), "iam-e2e-seed-receipt-failure-"));
    const occupiedPath = join(directory, "occupied");
    try {
      await mkdir(occupiedPath);
      await expect(persistSeedReceipt(occupiedPath, {
        version: 1,
        stage: "seed",
        status: "attempted",
        attemptedAt: "2026-08-06T12:30:00.000Z",
      })).rejects.toBeInstanceOf(Error);

      expect(await readdir(directory)).toEqual(["occupied"]);
    }
    finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});
