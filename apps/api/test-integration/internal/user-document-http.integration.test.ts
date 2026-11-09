import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { createInternalUserQueryResource } from "@api/composition/internal-user-query";
import { createInternalAuthenticationHandler } from "@api/middlewares/internal-client-authentication";
import { createInternalMiddlewares } from "@api/routes/internal/_middleware";
import { createUserHandlers } from "@api/routes/internal/user/user.handlers";
import { createUserRoute } from "@api/routes/internal/user/user.index";
import { createUserDocumentSearchAdapter } from "@api/services/user-document-search/user-document-search.adapter";
import createApp from "@iam/api-core/core/create-app";
import type { RebuildUserDocumentJobPayload, UserDocumentOutboxJobPayload } from "@iam/contracts";
import {
  ClientStatus,
  OrganizationLevel,
  OrganizationType,
  UserDocumentSchema,
  UserStatus,
  UserType,
} from "@iam/contracts";
import { userDocuments, users } from "@iam/db/schema";
import type { GenericClientRuntimeDto } from "@iam/domain/client";
import { createUnitOfWork } from "@iam/unit-of-work";
import {
  createInternalUserDocumentQueryRepository,
  createInternalUserDocumentQueryService,
  createUserDocumentSearchRepository,
  createUserDocumentSearchService,
  USER_DOCUMENT_SCHEMA_VERSION,
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

test("omitted filter returns the non-paginated identity selection", async () => {
  const empty = await request("/search-dsl", {});
  expect(empty.body.data).toEqual({ items: [], total: 0, page: null, pageSize: null });
  await pg.db.insert(userDocuments).values(publication(1));
  const result = await request("/search-dsl", {});
  expect(result.status).toBe(200);
  expect(result.body.data).toEqual({
    items: [{ subjectIdentifier: publication(1).subjectIdentifier, username: "user-1" }],
    total: 1,
    page: null,
    pageSize: null,
  });
  const disabled = await request("/search-dsl", { paginate: false });
  expect(disabled.body).toEqual(result.body);
});

test("explicit pagination returns the requested identity page and exact total", async () => {
  await pg.db.insert(userDocuments).values([publication(2), publication(1)]);
  const result = await request("/search-dsl", { paginate: true, page: 2, pageSize: 1 });
  expect(result.status).toBe(200);
  expect(result.body.data).toEqual({
    items: [{ subjectIdentifier: publication(2).subjectIdentifier, username: "user-2" }],
    total: 2,
    page: 2,
    pageSize: 1,
  });
});

test("pagination defaults and empty or beyond-last pages preserve the exact count", async () => {
  const empty = await request("/search-dsl", { paginate: true });
  expect(empty.status).toBe(200);
  expect(empty.body.data).toEqual({ items: [], total: 0, page: 1, pageSize: 50 });
  await pg.db.insert(userDocuments).values(Array.from({ length: 51 }, (_, i) => publication(i + 1)));
  const first = await request("/search-dsl", { paginate: true });
  expect(first.status).toBe(200);
  expect(first.body.data.items).toHaveLength(50);
  expect(first.body.data).toMatchObject({ total: 51, page: 1, pageSize: 50 });
  const last = await request("/search-dsl", { paginate: true, page: 2 });
  expect(last.body.data).toEqual({
    items: [{ subjectIdentifier: publication(51).subjectIdentifier, username: "user-51" }],
    total: 51,
    page: 2,
    pageSize: 50,
  });
  const deep = await request("/search-dsl", { paginate: true, page: Number.MAX_SAFE_INTEGER, pageSize: 1 });
  expect(deep.status).toBe(200);
  expect(deep.body.data).toEqual({ items: [], total: 51, page: Number.MAX_SAFE_INTEGER, pageSize: 1 });
  const beyond = await request("/search-dsl", { paginate: true, page: 3 });
  expect(beyond.body.data).toEqual({ items: [], total: 51, page: 3, pageSize: 50 });
  const absent = await request("/search-dsl", {
    paginate: true,
    page: 7,
    pageSize: 1,
    filter: { field: "username", op: "eq", value: "absent" },
  });
  expect(absent.body.data).toEqual({ items: [], total: 0, page: 7, pageSize: 1 });
});

test("pagination sorts the complete 501-user set before selecting a page", async () => {
  await pg.db.insert(userDocuments).values(
    Array.from({ length: 501 }, (_, i) => {
      const row = publication(501 - i);
      return { ...row, document: { ...row.document, name: String(501 - i).padStart(4, "0") } };
    }),
  );
  const maximum = await request("/search-dsl", { paginate: true, pageSize: 500 });
  expect(maximum.status).toBe(200);
  expect(maximum.body.data.items).toHaveLength(500);
  expect(maximum.body.data).toMatchObject({ total: 501, page: 1, pageSize: 500 });
  const sorted = await request("/search-dsl", {
    paginate: true,
    pageSize: 2,
    sort: [{ field: "name", direction: "desc" }],
    select: ["username"],
  });
  expect(sorted.status).toBe(200);
  expect(sorted.body.data).toEqual({
    items: [{ username: "user-501" }, { username: "user-500" }],
    total: 501,
    page: 1,
    pageSize: 2,
  });
  const last = await request("/search-dsl", { paginate: true, page: 2, pageSize: 500, select: ["username"] });
  expect(last.body.data).toEqual({ items: [{ username: "user-501" }], total: 501, page: 2, pageSize: 500 });
  for (const controls of [{}, { paginate: false }]) {
    const disabled = await request("/search-dsl", controls);
    expect(disabled.status).toBe(422);
    expect(disabled.body.data).toBeNull();
  }
});

test("rejects unsafe or wrongly typed pagination controls without coercion", async () => {
  for (const body of [
    ...["true", 1, null, [], {}].map((paginate) => ({ paginate })),
    ...["1", null, 0, -1, 1.1, Number.MAX_SAFE_INTEGER + 1, true].flatMap((value) => [
      { paginate: true, page: value },
      { paginate: true, pageSize: value },
    ]),
    { paginate: true, pageSize: 501 },
    { paginate: true, page: Number.MAX_SAFE_INTEGER, pageSize: 2 },
    { paginate: true, page: Number.MAX_SAFE_INTEGER },
    { page: 1 },
    { pageSize: 50 },
    { paginate: false, page: 1 },
    { paginate: false, pageSize: 50 },
  ]) {
    const result = await request("/search-dsl", body);
    expect(result.status).toBe(422);
    expect(result.body).toMatchObject({ code: "COMMON.VALIDATION_FAILED" });
  }
});

test("only the requested page is fully parsed, even when an unselected field is corrupt", async () => {
  await pg.db.insert(userDocuments).values([publication(1), publication(2)]);
  await pg.sql`UPDATE user_document SET document=jsonb_set(document,'{name}','123') WHERE user_id=2`;
  const first = await request("/search-dsl", {
    paginate: true,
    pageSize: 1,
    select: ["username"],
    filter: { field: "status", op: "eq", value: UserStatus.Enable },
  });
  expect(first.status).toBe(200);
  expect(first.body.data).toEqual({ items: [{ username: "user-1" }], total: 2, page: 1, pageSize: 1 });
  const second = await request("/search-dsl", { paginate: true, page: 2, pageSize: 1, select: ["username"] });
  expect(second.status).toBe(503);
  expect(second.body.data).toBeNull();
  const beyond = await request("/search-dsl", { paginate: true, page: 3, pageSize: 1 });
  expect(beyond.status).toBe(200);
  expect(beyond.body.data).toEqual({ items: [], total: 2, page: 3, pageSize: 1 });
});

test("sorts users by unselected root fields with bytewise strings, nulls last and hidden ID ties", async () => {
  const rows = [
    { id: 5, name: "a", mobile: null, status: UserStatus.Enable },
    { id: 3, name: "a", mobile: "10", status: UserStatus.Disable },
    { id: 2, name: "Z", mobile: "2", status: UserStatus.Pause },
    { id: 4, name: "b", mobile: "10", status: UserStatus.Enable },
    { id: 1, name: "a", mobile: "10", status: UserStatus.Enable },
  ];
  await pg.db.insert(userDocuments).values(
    rows.map(({ id, ...fields }) => {
      const row = publication(id);
      return { ...row, document: { ...row.document, ...fields } };
    }),
  );
  for (const [sort, expected] of [
    [[{ field: "mobile", direction: "asc" }], [1, 3, 4, 2, 5]],
    [[{ field: "mobile", direction: "desc" }], [2, 1, 3, 4, 5]],
    [[{ field: "name", direction: "asc" }], [2, 1, 3, 5, 4]],
    [[{ field: "name", direction: "desc" }], [4, 1, 3, 5, 2]],
    [
      [
        { field: "status", direction: "desc" },
        { field: "mobile", direction: "asc" },
        { field: "name", direction: "desc" },
      ],
      [3, 2, 4, 1, 5],
    ],
  ] as const) {
    const result = await request("/search-dsl", { sort, select: ["username"] });
    expect(result.status).toBe(200);
    expect(result.body.data.items).toEqual(expected.map((id) => ({ username: `user-${id}` })));
  }
});

test("rejects invalid user sort fields, directions and budgets through authenticated HTTP", async () => {
  for (const sort of [
    null,
    "name",
    [],
    [{ field: "name" }],
    [{ field: "name", direction: "ASC" }],
    [{ field: "name", direction: "asc", nulls: "first" }],
    Array.from({ length: 4 }, () => ({ field: "name", direction: "asc" })),
    ...[
      "id",
      "userId",
      "sourceVersion",
      "employments",
      "employments.isPrimary",
      "employments.roles",
      "employments.clientAuthorizations.clientCode",
      "name ",
      "__proto__",
      "name;DROP TABLE user_document",
    ].map((field) => [{ field, direction: "asc" }]),
  ]) {
    const result = await request("/search-dsl", { sort });
    expect(result.status).toBe(422);
  }
});

test("rejects malformed query controls and private or non-field selections through authenticated HTTP", async () => {
  for (const body of [
    { paginate: "false" },
    { paginate: null },
    { paginate: 0 },
    { page: 1 },
    { paginate: false, pageSize: 50 },
    { page: null },
    { filter: null },
    { filter: {} },
    { select: [] },
    { select: null },
    { select: "name" },
    { clientCode: "beta" },
    { sort: [] },
    ...[
      "*",
      "id",
      "sourceVersion",
      "employments.clientAuthorizations",
      "employments.clientAuthorizations.clientCode",
      "employments[0]",
      "employments.0.roles",
      "employments.roles[0:1]",
      "alias:name",
      "count(employments)",
      "name ",
      "name.__proto__",
    ].map((field) => ({ select: [field] })),
  ]) {
    const result = await request("/search-dsl", body);
    expect(result.status).toBe(422);
    expect(result.body).toMatchObject({ code: "COMMON.VALIDATION_FAILED" });
  }
});

test("select preserves all employments, paths, nulls and empty arrays after Client projection", async () => {
  const row = publication(1);
  const organization = {
    code: "CHILD",
    name: "Child",
    type: OrganizationType.Department,
    path: [
      { code: "ROOT", name: "Root", type: OrganizationType.Company, level: 1, distanceToTarget: 1 },
      { code: "CHILD", name: "Child", type: OrganizationType.Department, level: 2, distanceToTarget: 0 },
    ],
  };
  const employment = {
    isPrimary: true,
    organization,
    position: { code: "POS", name: "Position" },
    responsibilities: [],
    clientAuthorizations: [
      { clientCode: "alpha", roles: [{ code: "reader" }] },
      { clientCode: "beta", roles: [{ code: "hidden" }] },
    ],
  };
  await pg.db.insert(userDocuments).values({
    ...row,
    document: {
      ...row.document,
      employments: [
        employment,
        {
          ...employment,
          isPrimary: false,
          clientAuthorizations: [{ clientCode: "beta", roles: [{ code: "hidden" }] }],
        },
      ],
    },
  });
  const result = await request("/search-dsl", {
    filter: role("reader"),
    paginate: true,
    sort: [{ field: "name", direction: "desc" }],
    select: [
      "mobile",
      "employments.organization.path.code",
      "employments.roles",
      "employments.position.code",
      "employments.position",
      "employments.roles",
      "employments.responsibilities.type.code",
    ],
  });
  expect(result.status).toBe(200);
  expect(result.body.data).toEqual({
    items: [
      {
        mobile: null,
        employments: [
          {
            organization: { path: [{ code: "ROOT" }, { code: "CHILD" }] },
            roles: ["reader"],
            position: { code: "POS", name: "Position" },
            responsibilities: [],
          },
          {
            organization: { path: [{ code: "ROOT" }, { code: "CHILD" }] },
            roles: [],
            position: { code: "POS", name: "Position" },
            responsibilities: [],
          },
        ],
      },
    ],
    total: 1,
    page: 1,
    pageSize: 50,
  });
});

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
    expect(first.body.data.name).toBe(firstFacts?.profile.name);
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
      matches = await search({ field: "name", op: "eq", value: "Second published" }),
      currentFacts = await facts.read(subject);
    expect(current).toEqual({ accountState: "enabled", factsState: "current" });
    expect(detail.body.data).toEqual(matches.body.data.items[0]);
    expect(currentFacts).toMatchObject({ sourceVersion: "2", profile: { name: "Second published" } });
    expect(detail.body.data.name).toBe(currentFacts?.profile.name);
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
  expect(own.body.data.items).toHaveLength(1);
  expect(other.body.data.items).toEqual([]);
  expect(detail.body.data).toEqual(own.body.data.items[0]);
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
  for (const { secret, visible } of [
    { secret: "alpha", visible: "beta-looking" },
    { secret: "beta", visible: "alpha-looking" },
  ]) {
    const hidden = await request(
      "/search-dsl",
      {
        paginate: true,
        filter: role(secret === "alpha" ? "alpha-looking" : "beta-looking"),
        select: ["employments.roles"],
      },
      secret,
    );
    expect(hidden.status).toBe(200);
    expect(hidden.body.data).toEqual({ items: [], total: 0, page: 1, pageSize: 50 });
    const combined = await request(
      "/search-dsl",
      {
        paginate: true,
        filter: {
          and: [
            role(visible),
            { not: role(secret === "alpha" ? "alpha-looking" : "beta-looking") },
            { or: [role(visible), { field: "username", op: "eq", value: "absent" }] },
          ],
        },
        select: ["employments.roles"],
      },
      secret,
    );
    expect(combined.status).toBe(200);
    expect(combined.body.data).toEqual({
      items: [{ employments: [{ roles: [visible] }] }],
      total: 1,
      page: 1,
      pageSize: 50,
    });
  }
});

test("details and search share complete published facts across account statuses and nullable fields", async () => {
  await pg.db
    .insert(userDocuments)
    .values([publication(1, UserStatus.Enable), publication(2, UserStatus.Pause), publication(3, UserStatus.Disable)]);
  const result = await search({
    field: "status",
    op: "in",
    value: [UserStatus.Enable, UserStatus.Pause, UserStatus.Disable],
  });
  expect(result.status).toBe(200);
  expect(result.body.data.items.map((row: { username: string }) => row.username)).toEqual([
    "user-1",
    "user-2",
    "user-3",
  ]);
  for (const id of [1, 2, 3]) {
    const detail = await request(`/user-${id}`);
    expect(detail.body.data).toEqual(result.body.data.items[id - 1]);
    expect(detail.body.data.mobile).toBeNull();
    expect(detail.body.data.wxId).toBeNull();
  }
  const empty = await search({ field: "username", op: "eq", value: "absent" });
  expect(empty.body.data.items).toEqual([]);
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
    .values([first, { ...second, document: { ...second.document, username: "user-3" } }]);
  const duplicate = await request("/user-3");
  expect(duplicate.status).toBe(503);
  expect(duplicate.body).toMatchObject({ code: "USER_SEARCH_UNAVAILABLE", data: null });
});

test("a corrupt matched document fails the entire directory batch", async () => {
  await pg.db.insert(userDocuments).values([publication(1), publication(2)]);
  await pg.sql`UPDATE user_document SET document=jsonb_set(document,'{name}','123') WHERE user_id=2`;
  const result = await request("/search-dsl", { select: ["username"] });
  const detail = await request("/user-2");
  expect(result.status).toBe(503);
  expect(result.body.data).toBeNull();
  expect(detail.status).toBe(503);
});

test("returns exactly 500 complete documents in internal ID order and rejects the 501st", async () => {
  await pg.db.insert(userDocuments).values(Array.from({ length: 501 }, (_, i) => publication(501 - i)));
  const exact = await search({ field: "username", op: "ne", value: "user-501" });
  // The language exposes binary not rather than a separate inequality operator.
  expect(exact.status).toBe(422);
  const bounded = await search({ not: { field: "username", op: "eq", value: "user-501" } });
  expect(bounded.status).toBe(200);
  expect(bounded.body.data.items.map((row: { username: string }) => row.username)).toEqual(
    Array.from({ length: 500 }, (_, i) => `user-${i + 1}`),
  );
  expect(bounded.body.data).toMatchObject({ total: 500, page: null, pageSize: null });
  const excess = await request("/search-dsl", {});
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
      await search({ field: "username", op: "eq", value: "user-1" }),
      await request("/search-dsl", { paginate: true }),
      await request("/search-dsl", { paginate: true, page: Number.MAX_SAFE_INTEGER, pageSize: 1 }),
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
    schemaVersion: USER_DOCUMENT_SCHEMA_VERSION,
    sourceVersion: "1",
    publishedAt: now,
    document: {
      subjectIdentifier,
      username: `user-${id}`,
      name: `User ${id}`,
      mobile: null,
      wxId: null,
      userType: UserType.Formal,
      status,
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
  return await request("/search-dsl", { filter, select: Object.keys(UserDocumentSchema.shape) }, secret);
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
