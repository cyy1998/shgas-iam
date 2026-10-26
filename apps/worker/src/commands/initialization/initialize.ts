import { isDeepStrictEqual, parseArgs } from "node:util";
import { completeInitializationAccess } from "./initialization-access";
import { InitializationInputSchema, resolveInitializationSecrets } from "./initialization-input";

export async function main() {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    strict: true,
    options: { input: { type: "string" } },
  });
  if (positionals.length !== 1 || !["source", "access"].includes(positionals[0]!) || !values.input)
    throw new Error("用法：initialize.ts source|access --input <正式非 secret JSON>");
  const input = InitializationInputSchema.parse(await Bun.file(values.input).json());
  const secrets = resolveInitializationSecrets(process.env);
  const { parseWorkerEnv } = await import("@worker/env");
  const env = parseWorkerEnv(process.env);
  const { logger } = await import("@worker/lib/logger");
  const { createWorkerCommandComposition } = await import("@worker/composition");
  const { createWorkerSubjectAccess } = await import("@worker/composition/subject-access");
  const composition = await createWorkerCommandComposition({ env, logger });
  try {
    const { default: db } = await import("@iam/db");
    const { initializeSourceFacts, verifyInitializationSource } = await import("./initialization-source");
    if (positionals[0] === "source") {
      const source = await initializeSourceFacts(db, input, secrets);
      const userProfile = await composition.userProfile.maintenance.backfillAllUsers({
        batchSize: env.userProfile.backfillBatchSize,
      });
      const organization = await composition.organizationSearch.processor.backfillAllOrganizations({
        batchSize: env.organizationSearch.backfillBatchSize,
      });
      logger.info(
        { ...source, userProfile, organization, publication: "not-verified" },
        "IAM initialization source committed; existing Workers own publication",
      );
      return;
    }
    const source = await verifyInitializationSource(db, input, secrets);
    const { userProfiles } = await import("@iam/db/schema");
    const { eq } = await import("drizzle-orm");
    const {
      createSubjectFactsCacheRecord,
      createSubjectFactsRedisInspector,
      parseUserProfileDetailDocument,
      PublishedProfileSchema,
    } = await import("@iam/user-profile-read-model");
    const { createCurrentUserProfilePostgresReadiness, createCurrentUserProfileRedisAccessReadiness } = await import(
      "@iam/user-profile-read-model/worker"
    );
    const { bootstrap } = createWorkerSubjectAccess(composition.runtime);
    const readinessInput = {
      db,
      clock: composition.runtime.clock,
      config: { buildBatchSize: env.userProfile.rebuildBatchSize },
    };
    const postgres = createCurrentUserProfilePostgresReadiness(readinessInput);
    const access = createCurrentUserProfileRedisAccessReadiness({
      ...readinessInput,
      subjectFactsRedis: composition.runtime.redis,
      subjectAccessBootstrap: bootstrap,
    });
    const batch = { batchSize: env.userProfile.backfillBatchSize };
    const result = await completeInitializationAccess({
      verifyPostgres: () => postgres.verify(batch),
      async factsArePublished() {
        const [profile] = await db
          .select({
            userId: userProfiles.userId,
            subjectIdentifier: userProfiles.subjectIdentifier,
            username: userProfiles.username,
            name: userProfiles.name,
            mobile: userProfiles.mobile,
            wxId: userProfiles.wxId,
            status: userProfiles.status,
            isDelete: userProfiles.isDelete,
            searchVisible: userProfiles.searchVisible,
            profileSchemaVersion: userProfiles.profileSchemaVersion,
            sourceDirtyVersion: userProfiles.sourceDirtyVersion,
            detail: userProfiles.detail,
            searchDoc: userProfiles.searchDoc,
            subjectFacts: userProfiles.subjectFacts,
            rebuiltAt: userProfiles.rebuiltAt,
          })
          .from(userProfiles)
          .where(eq(userProfiles.userId, source.userId));
        if (!profile || profile.subjectIdentifier !== source.subjectIdentifier) return false;
        const parsed = PublishedProfileSchema.parse({
          ...profile,
          detail: parseUserProfileDetailDocument(profile.detail),
        });
        const [facts] = await createSubjectFactsRedisInspector(composition.runtime.redis).inspectMany([
          source.subjectIdentifier,
        ]);
        return (
          facts?.status === "valid" &&
          isDeepStrictEqual(facts.record, createSubjectFactsCacheRecord(parsed, parsed.rebuiltAt))
        );
      },
      seedAccess: () =>
        bootstrap.seedMany(
          [{ subjectIdentifier: source.subjectIdentifier, state: "enabled" }],
          composition.runtime.clock.nowDate(),
        ),
      verifyAccess: () => access.verify(batch),
    });
    logger.info({ ...source, ...result, access: "verified" }, "IAM initialization access completed");
  } finally {
    await composition.shutdown("command:initialize");
  }
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    const code =
      error instanceof Error && /^initialization-[a-z-]+$/.test(error.message)
        ? error.message
        : "initialization-failed";
    console.error(JSON.stringify({ code }));
    process.exitCode = 1;
  }
}
