import { expect, test } from "bun:test";
import { appendFile, cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { SQL } from "bun";
import Redis from "ioredis";
import { prepareE2EDatabaseTemplate } from "../../src/database-template.ts";
import { withHybridMiddleware } from "../../src/hybrid-middleware.ts";
import { fingerprintTemplateInputs, readTemplateSourceFingerprint } from "../../src/template-fingerprint.ts";

const repositoryRoot = resolve(import.meta.dir, "../../../..");

test("changes the template source fingerprint when the User Document contract or Worker projection changes", async () => {
  const root = await mkdtemp(join(tmpdir(), "iam-template-inputs-"));
  try {
    await cp(join(repositoryRoot, "packages"), join(root, "packages"), {
      recursive: true,
      filter: (path) => !/[\\/](?:node_modules|dist|\.turbo|test-results)(?:[\\/]|$)/u.test(path),
    });
    await mkdir(join(root, "apps"), { recursive: true });
    await cp(join(repositoryRoot, "apps/worker"), join(root, "apps/worker"), {
      recursive: true,
      filter: (path) => !/[\\/](?:node_modules|dist|\.turbo|test-results)(?:[\\/]|$)/u.test(path),
    });
    await mkdir(join(root, "e2e/system"), { recursive: true });
    await cp(join(repositoryRoot, "e2e/system/src"), join(root, "e2e/system/src"), { recursive: true });
    await cp(join(repositoryRoot, "pnpm-lock.yaml"), join(root, "pnpm-lock.yaml"));
    const before = await readTemplateSourceFingerprint(root);
    await appendFile(join(root, "apps/worker/src/index.ts"), "\n// New Worker projection input\n");
    const worker = await readTemplateSourceFingerprint(root);
    expect(worker).not.toBe(before);
    await appendFile(join(root, "packages/documents/src/user/document.ts"), "\n// New User Document schema input\n");
    const document = await readTemplateSourceFingerprint(root);
    expect(document).not.toBe(worker);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);

test("creates and reuses a published seed template, restores PG and Redis, and replaces old fingerprints", async () => {
  await withHybridMiddleware({ repositoryRoot, fresh: true }, async (middleware) => {
    const options = {
      repositoryRoot,
      middleware,
      canonicalOrigin: `http://external.iam.localhost:${middleware.ports.http}`,
      internalOrigin: `http://internal.iam.localhost:${middleware.ports.http}`,
      adminPassword: "iam-e2e-admin-password-local-only",
      artifactDirectory: join(repositoryRoot, "e2e/system/test-results", middleware.project),
    };
    const baseline = await prepareE2EDatabaseTemplate(options);
    expect(baseline.name).toMatch(/^iam_e2e_tpl_[a-f0-9]{48}$/);
    await baseline.reset();
    const reused = await prepareE2EDatabaseTemplate(options);
    expect(reused.name).toBe(baseline.name);
    expect(reused.references).toEqual(baseline.references);

    const redis = new Redis(middleware.redisUrl);
    const otherRedisUrl = new URL(middleware.redisUrl);
    otherRedisUrl.pathname = "/1";
    const otherRedis = new Redis(otherRedisUrl.href);
    const maintenanceUrl = new URL(middleware.databaseUrl);
    maintenanceUrl.pathname = "/postgres";
    const maintenance = new SQL({ url: maintenanceUrl.href, max: 1 });
    try {
      const dirtyDatabase = new SQL({ url: middleware.databaseUrl, max: 1 });
      try {
        await dirtyDatabase.unsafe("CREATE TABLE e2e_dirty (value text)");
        await redis.set("e2e:dirty", "stale");
        await otherRedis.set("e2e:other-db", "preserved");
        const failure = await baseline.reset().catch((error: unknown) => error);
        expect(failure).toMatchObject({ message: expect.stringContaining("being accessed") });
        const dirtyRedis = await redis.get("e2e:dirty");
        expect(dirtyRedis).toBe("stale");
      } finally {
        await dirtyDatabase.close();
      }

      await baseline.reset();
      const restoredDatabase = new SQL({ url: middleware.databaseUrl, max: 1 });
      try {
        const [dirty] = await restoredDatabase`SELECT to_regclass('e2e_dirty') AS relation`;
        expect(dirty.relation).toBeNull();
        const dirtyRedis = await redis.get("e2e:dirty");
        const otherValue = await otherRedis.get("e2e:other-db");
        expect(dirtyRedis).toBeNull();
        expect(otherValue).toBe("preserved");
      } finally {
        await restoredDatabase.close();
      }

      const failedBuild = await prepareE2EDatabaseTemplate({ ...options, adminPassword: "short" }).catch(
        (error: unknown) => error,
      );
      expect(failedBuild).toMatchObject({ message: expect.stringContaining("credential is too short") });
      const recovered = await baseline.reset();
      expect(recovered.adminSubjectIdentifier).toBe(baseline.references.adminSubjectIdentifier);

      const replacement = await prepareE2EDatabaseTemplate({
        ...options,
        sourceFingerprint: fingerprintTemplateInputs([{ path: "seed.ts", content: "new seed revision" }]),
      });
      expect(replacement.name).not.toBe(baseline.name);
      await replacement.reset();
      const oldReset = await baseline.reset().catch((error: unknown) => error);
      expect(oldReset).toMatchObject({ message: expect.stringContaining("prepare the current baseline") });
      const catalogs = await maintenance`SELECT datname FROM pg_database WHERE datname LIKE 'iam_e2e_tpl_%'`;
      expect(catalogs.map((row: { datname: string }) => row.datname)).toEqual([replacement.name]);
    } finally {
      await maintenance.close();
      redis.disconnect(false);
      otherRedis.disconnect(false);
    }
  });
}, 260_000);
