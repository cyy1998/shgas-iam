import { describe, expect, test } from "bun:test";

type PackageManifest = {
  scripts?: Record<string, string>;
};

describe("maintenance command package scripts", () => {
  test("publishes only version-independent User Profile commands and preserves Client Protocol commands", async () => {
    const workerManifest = await Bun.file(
      new URL("../../package.json", import.meta.url),
    ).json() as PackageManifest;
    const oidcManifest = await Bun.file(
      new URL("../../../oidc-provider/package.json", import.meta.url),
    ).json() as PackageManifest;

    expect(workerManifest.scripts).toMatchObject({
      "user-profile:backfill": "bun run src/commands/user-profile/user-profile-backfill.ts",
      "user-profile:repair": "bun run src/commands/user-profile/user-profile-repair.ts",
      "user-profile:verify-postgres": "bun run src/commands/user-profile/user-profile-readiness.ts verify-postgres",
      "user-profile:verify-redis": "bun run src/commands/user-profile/user-profile-readiness.ts verify-redis",
      "client-protocol:epochs": "bun run src/commands/client-protocol/client-protocol-epoch-maintenance.ts",
      "client-runtime:repair": "bun run src/commands/client-runtime/client-runtime-repair.ts",
      "client-runtime:verify": "bun run src/commands/client-runtime/client-runtime-verify.ts",
    });
    expect(Object.keys(workerManifest.scripts ?? {})).not.toEqual(
      expect.arrayContaining([
        "profile-v2:backfill",
        "profile-v2:verify-postgres",
        "profile-v2:verify-redis",
      ]),
    );
    expect(oidcManifest.scripts?.["client-protocol:artifacts"]).toBe(
      "node --env-file-if-exists=.env --import tsx scripts/client-protocol-artifact-maintenance.ts",
    );
  });
});
