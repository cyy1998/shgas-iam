import type { SubjectProjectionCutoverManifest } from "../commands/subject-projection-cutover.manifest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CustomSsoClientMode, SubjectClaim } from "@iam/contracts";
import { describe, expect, mock, test } from "bun:test";
import {
  createSecretFileDelivery,
  runSubjectProjectionBackfillCommand,
  runSubjectProjectionVerifyCommand,
} from "../commands/subject-projection-cutover";
import { SubjectProjectionCutoverManifestSchema } from "../commands/subject-projection-cutover.manifest";

const manifest = SubjectProjectionCutoverManifestSchema.parse({
  version: 1,
  cutoverId: "subject-projection-v1",
  clients: [{
    clientCode: "independent",
    targetEnabled: true,
    config: {
      mode: CustomSsoClientMode.Independent,
      validRedirectUrls: ["https://app.example.com/callback"],
      subjectClaimCatalogVersion: 1,
      subjectClaims: [SubjectClaim.SubjectIdentifier],
      callbackEndpoint: "https://app.example.com/callback",
      logoutEndpoint: "https://app.example.com/logout",
    },
    secretDelivery: { status: "pending" },
  }],
});

describe("Subject Projection cutover command", () => {
  test("delivers generated secrets before applying resumable batches and returns only safe progress", async () => {
    const delivered: Array<{ clientCode: string; secret: string }> = [];
    const applyManifest = mock(async (
      _manifest: SubjectProjectionCutoverManifest,
      options: { deliverGeneratedSecrets: (secrets: typeof delivered) => Promise<void> },
    ) => {
      await options.deliverGeneratedSecrets([{
        clientCode: "independent",
        secret: "iam_sso_one_time_secret",
      }]);
      return {
        generatedSecrets: [{ clientCode: "independent", secret: "iam_sso_one_time_secret" }],
        blockers: [{ clientCode: "independent", reason: "secret-delivery-unconfirmed" as const }],
      };
    });
    const backfillBatch = mock(async ({ afterUserId }: { afterUserId: number }) => afterUserId === 0
      ? {
          version: 1 as const,
          afterUserId: 0,
          nextAfterUserId: 2,
          complete: false,
          scanned: 2,
          rebuilt: 2,
          reused: 0,
          facts: { published: 2, retainedNewer: 0 },
          barriers: { seeded: 2, retainedExisting: 0 },
        }
      : {
          version: 1 as const,
          afterUserId: 2,
          nextAfterUserId: 3,
          complete: true,
          scanned: 1,
          rebuilt: 0,
          reused: 1,
          facts: { published: 0, retainedNewer: 1 },
          barriers: { seeded: 0, retainedExisting: 1 },
        });
    const info = mock(() => {});
    const error = mock(() => {});

    const result = await runSubjectProjectionBackfillCommand({
      clients: { applyManifest },
      backfill: { backfillBatch },
      secretDelivery: {
        async writeOnce(secrets) {
          delivered.push(...secrets);
        },
      },
      logger: { info, error },
    }, { manifest, batchSize: 2, afterUserId: 0 });

    expect(delivered).toEqual([{
      clientCode: "independent",
      secret: "iam_sso_one_time_secret",
    }]);
    expect(backfillBatch).toHaveBeenNthCalledWith(1, {
      version: 1,
      afterUserId: 0,
      batchSize: 2,
    });
    expect(backfillBatch).toHaveBeenNthCalledWith(2, {
      version: 1,
      afterUserId: 2,
      batchSize: 2,
    });
    expect(result).toEqual({
      version: 1,
      cutoverId: "subject-projection-v1",
      startAfterUserId: 0,
      nextAfterUserId: 3,
      batches: 2,
      scanned: 3,
      rebuilt: 2,
      reused: 1,
      generatedSecretClientCodes: ["independent"],
      blockers: [{ clientCode: "independent", reason: "secret-delivery-unconfirmed" }],
    });
    expect(JSON.stringify(result)).not.toContain("iam_sso_one_time_secret");
    expect(error).not.toHaveBeenCalled();
  });

  test("logs the last safe cursor without serializing the thrown batch error", async () => {
    const info = mock(() => {});
    const error = mock(() => {});
    const unsafe = new Error("subject facts payload: secret-in-error");
    const run = runSubjectProjectionBackfillCommand({
      clients: {
        applyManifest: mock(async () => ({ generatedSecrets: [], blockers: [] })),
      },
      backfill: { backfillBatch: mock(async () => { throw unsafe; }) },
      secretDelivery: { writeOnce: mock(async () => {}) },
      logger: { info, error },
    }, { manifest, batchSize: 50, afterUserId: 42 });

    await expect(run).rejects.toBe(unsafe);
    expect(error).toHaveBeenCalledWith({
      version: 1,
      batch: 1,
      safeAfterUserId: 42,
    }, "Subject Projection cutover batch failed");
    expect(JSON.stringify(error.mock.calls)).not.toContain("secret-in-error");
  });

  test("logs the safe pre-backfill boundary when client application fails", async () => {
    const info = mock(() => {});
    const error = mock(() => {});
    const unsafe = new Error("generated secret: must-not-be-logged");
    const backfillBatch = mock(async () => {
      throw new Error("backfill must not start");
    });
    let caught: unknown;
    try {
      await runSubjectProjectionBackfillCommand({
        clients: {
          applyManifest: mock(async () => {
            throw unsafe;
          }),
        },
        backfill: { backfillBatch },
        secretDelivery: { writeOnce: mock(async () => {}) },
        logger: { info, error },
      }, { manifest, batchSize: 50, afterUserId: 42 });
    }
    catch (cause) {
      caught = cause;
    }

    expect(caught).toBe(unsafe);
    expect(error).toHaveBeenCalledWith({
      version: 1,
      cutoverId: "subject-projection-v1",
      safeAfterUserId: 42,
    }, "Subject Projection client manifest failed");
    expect(JSON.stringify(error.mock.calls)).not.toContain("must-not-be-logged");
    expect(backfillBatch).not.toHaveBeenCalled();
  });

  test("returns and logs the independent read-only verification report", async () => {
    const report = {
      version: 1 as const,
      cutoverId: "subject-projection-v1",
      verifiedAt: "2026-08-01T05:00:00.000Z",
      status: "failed" as const,
      counts: { users: 3, profiles: 2, verifiedUsers: 3 },
      failures: [{ code: "profile-count-mismatch", count: 1, samples: ["user:3"] }],
    };
    const info = mock(() => {});
    const result = await runSubjectProjectionVerifyCommand({
      verifier: { verify: mock(async () => report) },
      logger: { info },
    }, { manifest, batchSize: 100 });

    expect(result).toEqual(report);
    expect(info).toHaveBeenNthCalledWith(1, {
      version: 1,
      cutoverId: "subject-projection-v1",
      batchSize: 100,
    }, "Subject Projection cutover verification started");
    expect(info).toHaveBeenCalledWith(report, "Subject Projection cutover verification completed");
  });

  test("writes generated secrets to a new file exactly once", async () => {
    const directory = await mkdtemp(join(tmpdir(), "iam-subject-projection-"));
    const outputPath = join(directory, "generated-secrets.json");
    try {
      const delivery = createSecretFileDelivery({
        outputPath,
        manifest,
        clock: { nowDate: () => new Date("2026-08-01T05:00:00.000Z") },
      });
      await delivery.writeOnce([{
        clientCode: "independent",
        secret: "iam_sso_one_time_secret",
      }]);
      expect(JSON.parse(await readFile(outputPath, "utf8"))).toEqual({
        version: 1,
        cutoverId: "subject-projection-v1",
        generatedAt: "2026-08-01T05:00:00.000Z",
        secrets: [{
          clientCode: "independent",
          secret: "iam_sso_one_time_secret",
        }],
      });

      const secondDelivery = createSecretFileDelivery({
        outputPath,
        manifest,
        clock: { nowDate: () => new Date("2026-08-01T05:00:01.000Z") },
      });
      let existingFileError: unknown;
      try {
        await secondDelivery.writeOnce([{
          clientCode: "independent",
          secret: "must-not-overwrite",
        }]);
      }
      catch (error) {
        existingFileError = error;
      }
      expect(existingFileError).toMatchObject({ code: "EEXIST" });
      expect(await readFile(outputPath, "utf8")).toContain("iam_sso_one_time_secret");
      expect(await readFile(outputPath, "utf8")).not.toContain("must-not-overwrite");
    }
    finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
