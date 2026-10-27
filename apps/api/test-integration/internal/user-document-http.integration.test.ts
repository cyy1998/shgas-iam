import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { createInternalUserQueryResource } from "@api/composition/internal-user-query";
import { createInternalMiddlewares } from "@api/routes/internal/_middleware";
import { createUserHandlers } from "@api/routes/internal/user/user.handlers";
import { createUserRoute } from "@api/routes/internal/user/user.index";
import { createUserDocumentSearchAdapter } from "@api/services/user-document-search/user-document-search.adapter";
import createApp from "@iam/api-core/core/create-app";
import { createInternalAuthenticationHandler } from "@iam/api-core/middlewares";
import { createUnitOfWork } from "@iam/api-core/uow";
import type { RebuildUserDocumentJobPayload, UserDocumentOutboxJobPayload } from "@iam/contracts";
import { ClientStatus, OrganizationLevel, OrganizationType, UserStatus, UserType } from "@iam/contracts";
import { userDocuments, users } from "@iam/db/schema";
import type { GenericClientRuntimeDto } from "@iam/domain/client";
import {
  createInternalUserDocumentQueryRepository,
  createInternalUserDocumentQueryService,
  createUserDocumentSearchRepository,
  createUserDocumentSearchService,
} from "@iam/user-document";
import { createUserDocumentInvalidation } from "@iam/user-document/producer";
import {
  createSubjectFactsReader,
  createSubjectFactsRedisCache,
  createSubjectFactsRedisPublisher,
} from "@iam/user-document/subject-facts";
import {
  createCurrentUserDocumentProjectionBundle,
  createSubjectAccessAuthorityRepository,
  createUserDocumentUpdateProcessor,
} from "@iam/user-document/worker";
import { eq } from "drizzle-orm";
import Redis from "ioredis";
import pino from "pino";
import appConfig from "~api/app.config";
import { closeApiRedisConnection, ownApiTestExecutor, resetApiRedisTestDatabase } from "../support/fixture-lifecycle";
import { type ApiPostgresTestHarness, createApiPostgresTestHarness } from "../support/postgres-test-harness";

const now = new Date("2026-10-26T10:00:00Z");
let pg: ApiPostgresTestHarness;
let query: ReturnType<typeof createInternalUserQueryResource>;
let app: ReturnType<typeof createUserApp>;
beforeAll(async () => {
  pg = await createApiPostgresTestHarness();
  query = createInternalUserQueryResource({ databaseUrl: pg.databaseUrl });
  app = createUserApp();
});
beforeEach(async () => {
  await pg.reset();
  await pg.sql`TRUNCATE user_document, user_document_rebuild_state, user_document_outbox`;
});
afterAll(async () => {
  await query?.close();
  await pg?.close();
});
afterEach(resetApiRedisTestDatabase);

test("source commit, durable Outbox, formal processor, Redis Facts and authenticated HTTP converge to one document", async () => {
  const redisUrl = process.env.IAM_API_TEST_REDIS_URL;
  if (!redisUrl) throw new Error("IAM_API_TEST_REDIS_URL is required");
  const redis = new Redis(redisUrl, { maxRetriesPerRequest: 0, retryStrategy: () => null });
  const close = ownApiTestExecutor(() => closeApiRedisConnection(redis));
  const logger = { info() {}, warn() {}, error() {} };
  const outbox: UserDocumentOutboxJobPayload[] = [],
    rebuilds: RebuildUserDocumentJobPayload[] = [];
  const jobProducer = {
    async enqueueOutboxEntries(payloads: UserDocumentOutboxJobPayload[]) {
      outbox.push(...payloads);
      return { enqueued: payloads.length, jobIds: [] };
    },
    async enqueueRebuildJobs(payloads: RebuildUserDocumentJobPayload[]) {
      rebuilds.push(...payloads);
      return { enqueued: payloads.length, jobIds: [] };
    },
  };
  const clock = { nowDate: () => now };
  const uow = createUnitOfWork({
    db: pg.db,
    logger,
    createTxPorts: (db, lifecycle) => ({
      db,
      invalidation: createUserDocumentInvalidation({ db, lifecycle, jobProducer, clock }),
    }),
  });
  const publisher = createSubjectFactsRedisPublisher(redis),
    cache = createSubjectFactsRedisCache(redis);
  const processor = createUserDocumentUpdateProcessor({
    db: pg.db,
    projection: createCurrentUserDocumentProjectionBundle(),
    jobProducer,
    subjectFactsPublisher: publisher,
    subjectAccessRepair: { repairSubject: async () => ({ status: "stable" }) },
    clock,
    logger,
    batchSize: 10,
  });
  const authority = createSubjectAccessAuthorityRepository({ db: pg.db, subjectFactsPublisher: publisher });
  const facts = createSubjectFactsReader({ db: pg.db, cache });
  const subject = publication(1).subjectIdentifier;
  async function drain() {
    for (const job of outbox.splice(0)) await processor.processOutbox(job);
    for (const job of rebuilds.splice(0)) await processor.process(job);
  }
  try {
    await uow.transaction(async (tx) => {
      await tx.db
        .insert(users)
        .values({ id: 1, subjectIdentifier: subject, username: "user-1", name: "First published" });
      await tx.invalidation.recordChanges([{ kind: "user", userId: 1 }]);
    });
    const unpublished = await request("/user-1");
    expect(unpublished.status).toBe(404);
    await drain();
    const first = await request("/user-1"),
      firstFacts = await facts.read(subject);
    expect(first.status).toBe(200);
    expect(firstFacts).toMatchObject({ sourceVersion: "1", profile: { name: "First published" } });
    expect(first.body.data.user.name).toBe(firstFacts?.profile.name);
    await uow.transaction(async (tx) => {
      await tx.db.update(users).set({ name: "Second published" }).where(eq(users.id, 1));
      await tx.invalidation.recordChanges([{ kind: "user", userId: 1 }]);
    });
    const pending = await authority.resolve(subject),
      before = await request("/user-1");
    expect(pending).toEqual({ accountState: "enabled", factsState: "not_current" });
    expect(before.body.data).toEqual(first.body.data);
    await drain();
    const current = await authority.resolve(subject),
      detail = await request("/user-1"),
      matches = await search({ field: "user.name", op: "eq", value: "Second published" }),
      currentFacts = await facts.read(subject);
    expect(current).toEqual({ accountState: "enabled", factsState: "current" });
    expect(detail.body.data).toEqual(matches.body.data[0]);
    expect(currentFacts).toMatchObject({ sourceVersion: "2", profile: { name: "Second published" } });
    expect(detail.body.data.user.name).toBe(currentFacts?.profile.name);
  } finally {
    await close();
  }
});

test("authenticated Client controls both role matching and detail serialization", async () => {
  const row = publication(1);
  const organization = {
    code: "ORG",
    name: "Organization",
    type: OrganizationType.Department,
    path: [
      {
        code: "ORG",
        name: "Organization",
        type: OrganizationType.Department,
        level: OrganizationLevel.One,
        distanceToTarget: 0,
      },
    ],
  };
  const document = {
    ...row.document,
    employments: [
      {
        isPrimary: true,
        organization,
        position: { code: "POS", name: "Position" },
        responsibilities: [],
        clientAuthorizations: [
          { clientCode: "alpha", roles: [{ code: "beta-looking" }] },
          { clientCode: "beta", roles: [{ code: "alpha-looking" }] },
        ],
      },
    ],
  };
  await pg.db.insert(userDocuments).values({ ...row, document });
  const own = await search(role("beta-looking"), "alpha");
  const other = await search(role("alpha-looking"), "alpha");
  const detail = await request("/user-1", undefined, "alpha", "beta");
  expect(own.status).toBe(200);
  expect(own.body.data).toHaveLength(1);
  expect(other.body.data).toEqual([]);
  expect(detail.body.data).toEqual(own.body.data[0]);
  expect(detail.body.data.employments[0].roles).toEqual(["beta-looking"]);
  expect(JSON.stringify(detail.body)).not.toContain("clientAuthorizations");
  expect(JSON.stringify(detail.body)).not.toContain("sourceVersion");
  const opposite = await request("/user-1", undefined, "beta");
  expect(opposite.body.data.employments[0].roles).toEqual(["alpha-looking"]);
  const control = await request("/search-dsl", { filter: role("alpha-looking"), clientCode: "beta" });
  const internal = await search({
    exists: { path: "employments", where: { field: "clientAuthorizations.clientCode", op: "eq", value: "beta" } },
  });
  expect(control.status).toBe(422);
  expect(internal.status).toBe(422);
});

test("details and search share complete published facts across account statuses and nullable fields", async () => {
  await pg.db
    .insert(userDocuments)
    .values([publication(1, UserStatus.Enable), publication(2, UserStatus.Pause), publication(3, UserStatus.Disable)]);
  const result = await search({
    field: "user.status",
    op: "in",
    value: [UserStatus.Enable, UserStatus.Pause, UserStatus.Disable],
  });
  expect(result.status).toBe(200);
  expect(result.body.data.map((row: { user: { username: string } }) => row.user.username)).toEqual([
    "user-1",
    "user-2",
    "user-3",
  ]);
  for (const id of [1, 2, 3]) {
    const detail = await request(`/user-${id}`);
    expect(detail.body.data).toEqual(result.body.data[id - 1]);
    expect(detail.body.data.user.mobile).toBeNull();
    expect(detail.body.data.user.wxId).toBeNull();
  }
  const empty = await search({ field: "user.username", op: "eq", value: "absent" });
  expect(empty.body.data).toEqual([]);
});

test("missing, tombstone and obsolete schema are absent; duplicate published usernames fail closed", async () => {
  await pg.db.insert(userDocuments).values([
    { ...publication(1), document: null },
    { ...publication(2), schemaVersion: 0 },
  ]);
  for (const name of ["absent", "user-1", "user-2"]) {
    const absent = await request(`/${name}`);
    expect(absent.status).toBe(404);
  }
  const first = publication(3),
    second = publication(4);
  await pg.db
    .insert(userDocuments)
    .values([
      first,
      { ...second, document: { ...second.document, user: { ...second.document.user, username: "user-3" } } },
    ]);
  const duplicate = await request("/user-3");
  expect(duplicate.status).toBe(503);
  expect(duplicate.body).toMatchObject({ code: "USER_SEARCH_UNAVAILABLE", data: null });
});

test("a corrupt matched document fails the entire directory batch", async () => {
  await pg.db.insert(userDocuments).values([publication(1), publication(2)]);
  await pg.sql`UPDATE user_document SET document=jsonb_set(document,'{employments}','"corrupt"') WHERE user_id=2`;
  const result = await search({ field: "user.status", op: "eq", value: UserStatus.Enable });
  const detail = await request("/user-2");
  expect(result.status).toBe(503);
  expect(result.body.data).toBeNull();
  expect(detail.status).toBe(503);
});

test("returns exactly 500 complete documents in internal ID order and rejects the 501st", async () => {
  await pg.db.insert(userDocuments).values(Array.from({ length: 501 }, (_, i) => publication(501 - i)));
  const exact = await search({ field: "user.username", op: "ne", value: "user-501" });
  // The language exposes binary not rather than a separate inequality operator.
  expect(exact.status).toBe(422);
  const bounded = await search({ not: { field: "user.username", op: "eq", value: "user-501" } });
  expect(bounded.status).toBe(200);
  expect(bounded.body.data.map((row: { user: { username: string } }) => row.user.username)).toEqual(
    Array.from({ length: 500 }, (_, i) => `user-${i + 1}`),
  );
  const excess = await search({ field: "user.status", op: "eq", value: UserStatus.Enable });
  expect(excess.status).toBe(422);
  expect(excess.body).toMatchObject({ code: "USER_SEARCH_RESULT_TOO_LARGE", data: null });
});

test("real PostgreSQL timeouts are sanitized for search and detail", async () => {
  await pg.db.insert(userDocuments).values(publication(1));
  const locked = Promise.withResolvers<void>(),
    release = Promise.withResolvers<void>();
  const transaction = pg.sql.begin(async (tx) => {
    await tx`LOCK TABLE user_document IN ACCESS EXCLUSIVE MODE`;
    locked.resolve();
    await release.promise;
  });
  try {
    await locked.promise;
    for (const result of [
      await search({ field: "user.username", op: "eq", value: "user-1" }),
      await request("/user-1"),
    ]) {
      expect(result.status).toBe(503);
      expect(result.body).toMatchObject({ code: "USER_SEARCH_UNAVAILABLE", data: null });
      expect(JSON.stringify(result.body)).not.toContain("statement timeout");
    }
  } finally {
    release.resolve();
    await transaction;
  }
}, 15_000);

test("missing and invalid Client credentials cannot query the published directory", async () => {
  for (const secret of ["", "invalid"]) {
    const result = await request("/user-1", undefined, secret);
    expect(result.status).toBe(401);
  }
});

function publication(id: number, status = UserStatus.Enable) {
  const subjectIdentifier = `00000000-0000-4000-8000-${String(id).padStart(12, "0")}`;
  return {
    userId: id,
    subjectIdentifier,
    schemaVersion: 1,
    sourceVersion: "1",
    publishedAt: now,
    document: {
      user: {
        subjectIdentifier,
        username: `user-${id}`,
        name: `User ${id}`,
        mobile: null,
        wxId: null,
        userType: UserType.Formal,
        status,
      },
      employments: [],
    },
  };
}
function role(code: string) {
  return { exists: { path: "employments", where: { field: "roles", op: "containsAny", value: [code] } } };
}
function createUserApp() {
  const search = createUserDocumentSearchService({ documentRepository: createUserDocumentSearchRepository(query.db) });
  const handlers = createUserHandlers({
    registerPurveyorContact: { execute: async () => true },
    userDocumentSearch: createUserDocumentSearchAdapter(search),
    internalUserDocumentQuery: createInternalUserDocumentQueryService({
      documentRepository: createInternalUserDocumentQueryRepository(query.db),
    }),
  });
  return createApp(appConfig, {
    env: { NODE_ENV: "test" },
    logger: pino({ enabled: false }),
    routes: { "./src/routes/internal/user/user.index.ts": { default: createUserRoute(handlers) } },
    middlewares: {
      "./src/routes/internal/_middleware.ts": {
        default: createInternalMiddlewares({
          internalAuthenticationHandler: createInternalAuthenticationHandler({
            getClientBySecret: async (secret): Promise<GenericClientRuntimeDto | null> =>
              ["alpha", "beta"].includes(secret)
                ? {
                    id: secret === "alpha" ? 1 : 2,
                    clientCode: secret,
                    clientName: secret,
                    clientSecret: secret,
                    status: ClientStatus.Enable,
                    isDelete: false,
                    description: null,
                    extAttributes: {},
                    url: null,
                    createTime: now,
                    updateTime: now,
                  }
                : null,
          }),
        }),
      },
    },
  });
}
async function search(filter: unknown, secret = "alpha") {
  return await request("/search-dsl", { filter }, secret);
}
async function request(path: string, body?: unknown, secret = "alpha", claimedClient = secret) {
  const headers: Record<string, string> = { "content-type": "application/json", Client: claimedClient };
  if (secret) headers.apikey = secret;
  const response = await app.request(`http://localhost/internal/users${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: await response.json() };
}
