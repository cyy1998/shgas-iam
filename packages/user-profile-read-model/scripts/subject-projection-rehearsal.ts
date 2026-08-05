import type { db as database } from "@iam/db";
import type { SubjectFactsCacheRecordV1 } from "../src/subject-facts-cache";
import type { SubjectFactsReaderObservation } from "../src/subject-facts-reader";
import type {
  RedisTestHarness,
  RedisTestScope,
} from "../test-integration/redis/redis-test-harness";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import process from "node:process";
import { runWithOwnedTestResources } from "@iam/api-core/testing/external-test-resources";
import {
  assertCanonicalRehearsalSubjectClaimSeed,
  CUSTOM_SSO_REHEARSAL_SUBJECT_CLAIM_SEEDS,
} from "@iam/client-subject-projection/testing";
import { createSubjectFactsReader } from "../src/subject-facts";
import {
  createSubjectProjectionCutoverRepository,
  createSubjectProjectionCutoverVerifier,
} from "../src/worker";
import { createPostgresTestHarness } from "../test-integration/postgres/postgres-test-harness";
import { createRedisTestHarness } from "../test-integration/redis/redis-test-harness";

const SYNTHETIC_USER_COUNT = 10_002;
const SYNTHETIC_CLIENTS_PER_MODE = 6;
const COLD_SAMPLE_SIZE = 250;
const WARM_SAMPLE_SIZE = 1_000;
const FRESHNESS_SAMPLE_SIZE = 250;
const SINGLE_FLIGHT_READERS = 32;
const REBUILT_AT = "2026-08-02T00:00:00.000Z";
const REQUIRED_RESOURCE_ENV_NAMES = [
  "IAM_USER_PROFILE_TEST_DATABASE_URL",
  "IAM_USER_PROFILE_TEST_REDIS_URL",
] as const;

export async function runSubjectProjectionRehearsal() {
  const missingResourceEnvNames = REQUIRED_RESOURCE_ENV_NAMES.filter(
    envName => !process.env[envName],
  );
  if (missingResourceEnvNames.length > 0) {
    throw new Error(
      `Subject Projection rehearsal requires caller-provided dedicated resources: ${missingResourceEnvNames.join(", ")}; no fallback is allowed`,
    );
  }

  const report = await runWithOwnedTestResources(async ({ registerCleanup }) => {
    const postgresHarness = await createPostgresTestHarness();
    registerCleanup(async () => await postgresHarness.close());
    const redisHarness: RedisTestHarness = await createRedisTestHarness();
    registerCleanup(async () => await redisHarness.close());
    const redisScope: RedisTestScope = await redisHarness.createScope();
    registerCleanup(async () => await redisScope.close());

    await seedSyntheticDataset(postgresHarness);
    const dataset = await inspectDataset(postgresHarness);
    assert.deepEqual(dataset, {
      clients: SYNTHETIC_CLIENTS_PER_MODE * 2,
      gatewayClients: SYNTHETIC_CLIENTS_PER_MODE,
      independentClients: SYNTHETIC_CLIENTS_PER_MODE,
      profiles: SYNTHETIC_USER_COUNT,
      users: SYNTHETIC_USER_COUNT,
    });

    let observations: SubjectFactsReaderObservation[] = [];
    const reader = createSubjectFactsReader({
      db: postgresHarness.db,
      cache: redisScope.firstCache,
      observability: {
        record(observation) {
          observations.push(observation);
        },
      },
    });

    const coldSubjects = syntheticSubjects(1, COLD_SAMPLE_SIZE);
    const coldStartedAt = performance.now();
    const coldFacts = await mapInBatches(
      coldSubjects,
      25,
      async subjectIdentifier => await reader.read(subjectIdentifier),
    );
    const coldDurationMs = performance.now() - coldStartedAt;
    assert.ok(coldFacts.every(facts => facts !== null));
    const coldObservations = observations;
    assert.equal(
      observationsFor(coldObservations, "cache-read", "miss").length,
      COLD_SAMPLE_SIZE,
    );
    assert.equal(
      observationsFor(coldObservations, "profile-load", "ready").length,
      COLD_SAMPLE_SIZE,
    );

    observations = [];
    const coldFreshnessStartedAt = performance.now();
    const coldFreshness = await mapInBatches(
      coldSubjects.slice(0, FRESHNESS_SAMPLE_SIZE),
      25,
      async subjectIdentifier => await reader.check({
        subjectIdentifier,
        sourceDirtyVersion: "1",
      }),
    );
    const coldFreshnessDurationMs = performance.now() - coldFreshnessStartedAt;
    assert.ok(coldFreshness.every(result => result.status === "fresh"));
    const coldFreshnessObservations = observations;

    observations = [];
    const singleFlightSubject = syntheticSubjectIdentifier(
      SYNTHETIC_USER_COUNT,
    );
    const singleFlightFacts = await Promise.all(
      Array.from(
        { length: SINGLE_FLIGHT_READERS },
        async () => await reader.read(singleFlightSubject),
      ),
    );
    assert.ok(singleFlightFacts.every(facts => facts !== null));
    assert.equal(observationsFor(observations, "profile-load", "ready").length, 1);
    const singleFlightWaits = observationsFor(
      observations,
      "single-flight-wait",
      "joined",
    );
    assert.ok(singleFlightWaits.length > 0);

    const prewarmStartedAt = performance.now();
    let prewarmPublished = 0;
    for (let firstUserId = 1; firstUserId <= SYNTHETIC_USER_COUNT; firstUserId += 250) {
      const records = Array.from(
        {
          length: Math.min(
            250,
            SYNTHETIC_USER_COUNT - firstUserId + 1,
          ),
        },
        (_, index) => syntheticFactsRecord(firstUserId + index),
      );
      const result = await redisScope.batchPublisher.publishMany(records);
      prewarmPublished += result.published;
    }
    const prewarmDurationMs = performance.now() - prewarmStartedAt;
    assert.equal(prewarmPublished, SYNTHETIC_USER_COUNT);

    const verificationStartedAt = performance.now();
    const verifier = createSubjectProjectionCutoverVerifier({
      projection: createSubjectProjectionCutoverRepository(
        postgresHarness.db as typeof database,
      ),
      subjectFacts: redisScope.inspector,
      subjectAccess: {
        async inspectMany(subjectIdentifiers) {
          return subjectIdentifiers.map((subjectIdentifier) => {
            const userId = Number(subjectIdentifier.slice(-12));
            return {
              status: "valid" as const,
              record: {
                version: 1 as const,
                subjectIdentifier,
                state: userId % 10 === 0 ? "disabled" as const : "enabled" as const,
                transitionId: "10000000-0000-4000-8000-000000000001",
                updatedAt: REBUILT_AT,
              },
            };
          });
        },
      },
      clients: {
        async verifyManifest() {
          const current = await inspectDataset(postgresHarness);
          return current.clients === SYNTHETIC_CLIENTS_PER_MODE * 2
            ? { failures: [] }
            : {
                failures: [{
                  clientCode: "synthetic-client-fixtures",
                  reason: "count-mismatch",
                }],
              };
        },
      },
      clock: { nowDate: () => new Date(REBUILT_AT) },
    });
    const verification = await verifier.verify({
      version: 1,
      batchSize: 500,
      manifest: { cutoverId: "synthetic-ticket12-2026-08-02" },
    });
    const verificationDurationMs = performance.now() - verificationStartedAt;
    assert.equal(verification.status, "passed");
    assert.deepEqual(verification.counts, {
      users: SYNTHETIC_USER_COUNT,
      profiles: SYNTHETIC_USER_COUNT,
      verifiedUsers: SYNTHETIC_USER_COUNT,
    });
    assert.deepEqual(verification.failures, []);

    observations = [];
    const warmSubjects = syntheticSubjects(1, WARM_SAMPLE_SIZE);
    const warmStartedAt = performance.now();
    const warmFacts = await mapInBatches(
      warmSubjects,
      100,
      async subjectIdentifier => await reader.read(subjectIdentifier),
    );
    const warmDurationMs = performance.now() - warmStartedAt;
    assert.ok(warmFacts.every(facts => facts !== null));
    const warmObservations = observations;
    assert.equal(
      observationsFor(warmObservations, "cache-read", "hit").length,
      WARM_SAMPLE_SIZE,
    );
    assert.equal(observationsFor(warmObservations, "profile-load").length, 0);

    observations = [];
    const warmFreshnessStartedAt = performance.now();
    const warmFreshness = await mapInBatches(
      warmSubjects.slice(0, FRESHNESS_SAMPLE_SIZE),
      25,
      async subjectIdentifier => await reader.check({
        subjectIdentifier,
        sourceDirtyVersion: "1",
      }),
    );
    const warmFreshnessDurationMs = performance.now() - warmFreshnessStartedAt;
    assert.ok(warmFreshness.every(result => result.status === "fresh"));
    const warmFreshnessObservations = observations;

    observations = [];
    assert.equal(await reader.read(syntheticSubjectIdentifier(
      SYNTHETIC_USER_COUNT + 1,
    )), null);
    assert.equal(
      observationsFor(observations, "profile-load", "not-ready").length,
      1,
    );

    return {
      event: "subject_projection.synthetic_rehearsal.completed",
      dataset,
      phases: {
        beforePrewarm: {
          requests: COLD_SAMPLE_SIZE,
          cacheHitRatio: cacheHitRatio(coldObservations),
          redisP95Ms: observationP95(coldObservations, "cache-read"),
          profileDbP95Ms: observationP95(coldObservations, "profile-load"),
          dirtyDbP95Ms: observationP95(
            coldFreshnessObservations,
            "dirty-load",
          ),
          requestWindowMs: rounded(coldDurationMs),
          freshnessWindowMs: rounded(coldFreshnessDurationMs),
        },
        prewarm: {
          records: prewarmPublished,
          durationMs: rounded(prewarmDurationMs),
        },
        verify: {
          status: verification.status,
          counts: verification.counts,
          failureCount: verification.failures.length,
          durationMs: rounded(verificationDurationMs),
        },
        afterPrewarm: {
          requests: WARM_SAMPLE_SIZE,
          cacheHitRatio: cacheHitRatio(warmObservations),
          redisP95Ms: observationP95(warmObservations, "cache-read"),
          profileLoads: observationsFor(warmObservations, "profile-load").length,
          dirtyDbP95Ms: observationP95(
            warmFreshnessObservations,
            "dirty-load",
          ),
          requestWindowMs: rounded(warmDurationMs),
          freshnessWindowMs: rounded(warmFreshnessDurationMs),
        },
        singleFlight: {
          readers: SINGLE_FLIGHT_READERS,
          profileLoads: 1,
          joinedWaiters: singleFlightWaits.length,
          waitP95Ms: percentile95(singleFlightWaits.map(item => item.durationMs)),
        },
        controlledProjectionNotReady: {
          faultProbeRate: "1/1",
          steadyWarmRate: `0/${WARM_SAMPLE_SIZE}`,
        },
      },
    } satisfies Record<string, unknown>;
  });

  process.stdout.write(`${JSON.stringify({
    ...report,
    cleanup: {
      postgresSchemaRemoved: true,
      redisNamespaceRemoved: true,
    },
  })}\n`);
}

if (import.meta.main) {
  try {
    await runSubjectProjectionRehearsal();
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}

async function seedSyntheticDataset(
  harness: Awaited<ReturnType<typeof createPostgresTestHarness>>,
) {
  const gatewaySubjectClaims = JSON.stringify(
    CUSTOM_SSO_REHEARSAL_SUBJECT_CLAIM_SEEDS.gateway,
  );
  const independentSubjectClaims = JSON.stringify(
    CUSTOM_SSO_REHEARSAL_SUBJECT_CLAIM_SEEDS.independent,
  );
  await harness.sql`
    INSERT INTO "user" (
      id,
      subject_identifier,
      username,
      name,
      status,
      is_delete
    )
    SELECT
      generated.user_id,
      ('00000000-0000-4000-8000-' || lpad(generated.user_id::text, 12, '0'))::uuid,
      'synthetic-user-' || generated.user_id,
      'Synthetic User ' || generated.user_id,
      CASE WHEN generated.user_id % 10 = 0 THEN 3 ELSE 1 END,
      generated.user_id % 20 = 0
    FROM generate_series(1, ${SYNTHETIC_USER_COUNT}) AS generated(user_id)
  `;
  await harness.sql`
    INSERT INTO user_profile (
      user_id,
      subject_identifier,
      username,
      name,
      status,
      is_delete,
      search_visible,
      profile_schema_version,
      source_dirty_version,
      detail,
      search_doc,
      subject_facts,
      rebuilt_at
    )
    SELECT
      subject.id,
      subject.subject_identifier,
      subject.username,
      subject.name,
      subject.status,
      subject.is_delete,
      subject.status = 1 AND NOT subject.is_delete,
      1,
      1,
      jsonb_build_object(
        'id', subject.id,
        'username', subject.username,
        'name', subject.name,
        'mobile', NULL,
        'wxId', NULL,
        'userType', '正式员工',
        'orderNum', subject.id,
        'status', subject.status,
        'isDelete', subject.is_delete,
        'createTime', ${REBUILT_AT}::text,
        'updateTime', ${REBUILT_AT}::text,
        'employments', '[]'::jsonb,
        'roles', '[]'::jsonb,
        'privileges', '[]'::jsonb
      ),
      jsonb_build_object(
        'user', jsonb_build_object(
          'id', subject.id,
          'username', subject.username,
          'name', subject.name,
          'mobile', NULL,
          'wxId', NULL,
          'userType', '正式员工',
          'status', subject.status
        ),
        'employments', '[]'::jsonb
      ),
      jsonb_build_object('employments', '[]'::jsonb),
      ${REBUILT_AT}::timestamp
    FROM "user" AS subject
  `;
  await harness.sql`
    INSERT INTO user_profile_dirty (
      user_id,
      dirty_version,
      status,
      reason_codes,
      dirty_at,
      processed_at
    )
    SELECT
      subject.id,
      1,
      'processed',
      '[]'::jsonb,
      ${REBUILT_AT}::timestamp,
      ${REBUILT_AT}::timestamp
    FROM "user" AS subject
  `;
  await harness.sql`
    INSERT INTO client (
      client_code,
      client_name,
      client_secret,
      status,
      is_delete,
      ext_attributes,
      custom_sso_enabled,
      custom_sso_config,
      custom_sso_secret_hash,
      custom_sso_config_version
    )
    SELECT
      'synthetic-gateway-' || generated.client_id,
      'Synthetic Gateway ' || generated.client_id,
      'synthetic-not-used',
      1,
      false,
      '{}'::jsonb,
      true,
      jsonb_build_object(
        'mode', 'gateway',
        'validRedirectUrls', jsonb_build_array(
          'https://gateway-' || generated.client_id || '.example.test/callback'
        ),
        'subjectClaimCatalogVersion', 1,
        'subjectClaims', ${gatewaySubjectClaims}::jsonb,
        'orcas', jsonb_build_object(
          'enabled', generated.client_id % 2 = 0
        )
      ),
      NULL,
      1
    FROM generate_series(1, ${SYNTHETIC_CLIENTS_PER_MODE})
      AS generated(client_id)
  `;
  await harness.sql`
    INSERT INTO client (
      client_code,
      client_name,
      client_secret,
      status,
      is_delete,
      ext_attributes,
      custom_sso_enabled,
      custom_sso_config,
      custom_sso_secret_hash,
      custom_sso_config_version
    )
    SELECT
      'synthetic-independent-' || generated.client_id,
      'Synthetic Independent ' || generated.client_id,
      'synthetic-not-used',
      1,
      false,
      '{}'::jsonb,
      true,
      jsonb_build_object(
        'mode', 'independent',
        'validRedirectUrls', jsonb_build_array(
          'https://independent-' || generated.client_id || '.example.test/callback'
        ),
        'subjectClaimCatalogVersion', 1,
        'subjectClaims', ${independentSubjectClaims}::jsonb,
        'callbackEndpoint',
          'https://independent-' || generated.client_id || '.example.test/sso/callback',
        'logoutEndpoint',
          'https://independent-' || generated.client_id || '.example.test/sso/logout'
      ),
      'synthetic-bcrypt-hash-not-used',
      1
    FROM generate_series(1, ${SYNTHETIC_CLIENTS_PER_MODE})
      AS generated(client_id)
  `;
}

async function inspectDataset(
  harness: Awaited<ReturnType<typeof createPostgresTestHarness>>,
) {
  const configurations = await harness.sql<{
    mode: string;
    subjectClaims: unknown;
  }[]>`
    SELECT
      custom_sso_config->>'mode' AS mode,
      custom_sso_config->'subjectClaims' AS "subjectClaims"
    FROM client
    ORDER BY client_code
  `;
  for (const configuration of configurations) {
    if (configuration.mode !== "gateway" && configuration.mode !== "independent")
      throw new Error("synthetic rehearsal client mode is invalid");
    assertCanonicalRehearsalSubjectClaimSeed(
      configuration.mode,
      configuration.subjectClaims,
    );
  }
  const [counts] = await harness.sql<{
    clients: number;
    gatewayClients: number;
    independentClients: number;
    profiles: number;
    users: number;
  }[]>`
    SELECT
      (SELECT count(*)::integer FROM client) AS clients,
      (
        SELECT count(*)::integer
        FROM client
        WHERE custom_sso_config->>'mode' = 'gateway'
      ) AS "gatewayClients",
      (
        SELECT count(*)::integer
        FROM client
        WHERE custom_sso_config->>'mode' = 'independent'
      ) AS "independentClients",
      (SELECT count(*)::integer FROM user_profile) AS profiles,
      (SELECT count(*)::integer FROM "user") AS users
  `;
  if (counts === undefined)
    throw new Error("synthetic rehearsal dataset count query returned no row");
  return counts;
}

function syntheticSubjects(firstUserId: number, count: number) {
  return Array.from(
    { length: count },
    (_, index) => syntheticSubjectIdentifier(firstUserId + index),
  );
}

function syntheticSubjectIdentifier(userId: number) {
  return `00000000-0000-4000-8000-${userId.toString().padStart(12, "0")}`;
}

function syntheticFactsRecord(userId: number): SubjectFactsCacheRecordV1 {
  return {
    schemaVersion: 1,
    sourceDirtyVersion: "1",
    publishedAt: REBUILT_AT,
    subjectIdentifier: syntheticSubjectIdentifier(userId),
    profile: {
      username: `synthetic-user-${userId}`,
      name: `Synthetic User ${userId}`,
      phone: null,
    },
    facts: { employments: [] },
  };
}

async function mapInBatches<TInput, TOutput>(
  inputs: readonly TInput[],
  batchSize: number,
  operation: (input: TInput) => Promise<TOutput>,
) {
  const outputs: TOutput[] = [];
  for (let offset = 0; offset < inputs.length; offset += batchSize) {
    outputs.push(...await Promise.all(
      inputs.slice(offset, offset + batchSize).map(operation),
    ));
  }
  return outputs;
}

function observationsFor<TOperation extends SubjectFactsReaderObservation["operation"]>(
  observations: readonly SubjectFactsReaderObservation[],
  operation: TOperation,
  outcome?: Extract<
    SubjectFactsReaderObservation,
    { operation: TOperation }
  >["outcome"],
) {
  return observations.filter(observation =>
    observation.operation === operation
    && (outcome === undefined || observation.outcome === outcome)) as Array<
    Extract<SubjectFactsReaderObservation, { operation: TOperation }>
  >;
}

function cacheHitRatio(observations: readonly SubjectFactsReaderObservation[]) {
  const cacheReads = observationsFor(observations, "cache-read");
  const hits = cacheReads.filter(observation => observation.outcome === "hit").length;
  return cacheReads.length === 0 ? 0 : rounded(hits / cacheReads.length);
}

function observationP95<TOperation extends SubjectFactsReaderObservation["operation"]>(
  observations: readonly SubjectFactsReaderObservation[],
  operation: TOperation,
) {
  return percentile95(
    observationsFor(observations, operation).map(item => item.durationMs),
  );
}

function percentile95(values: readonly number[]) {
  if (values.length === 0)
    return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(sorted.length * 0.95) - 1);
  return rounded(sorted[index]!);
}

function rounded(value: number) {
  return Math.round(value * 1_000) / 1_000;
}
