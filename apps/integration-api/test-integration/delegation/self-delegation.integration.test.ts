import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import {
  ClientStatus,
  OrganizationLevel,
  OrganizationStatus,
  OrganizationType,
  ClientDelegationStatus as Status,
  UserStatus,
} from "@iam/contracts";
import { clients, organizationClosures, organizations, users } from "@iam/db/schema";
import { createExclusiveRedisTestHarness } from "@iam/test-support/external-test-resources";
import { createIntegrationApiApp } from "@integration-api/app";
import { eq } from "drizzle-orm";
import pino from "pino";

import {
  createIntegrationPostgresTestHarness,
  type IntegrationPostgresTestHarness,
  testEnvironment,
} from "../support/resources.fixture";
import { createSessionFixture } from "../support/session.fixture";

const aliceSubject = "00000000-0000-4000-8000-000000000001";
const bobSubject = "00000000-0000-4000-8000-000000000002";
let harness: IntegrationPostgresTestHarness;
let api: Awaited<ReturnType<typeof createIntegrationApiApp>>;
let sessionFixture: ReturnType<typeof createSessionFixture>;
const bearerBySubject = new Map<string, string>();
const redisHarness = createExclusiveRedisTestHarness({
  environment: process.env,
  name: "IAM_INTEGRATION_API_TEST_REDIS_URL",
});
beforeAll(async () => {
  harness = await createIntegrationPostgresTestHarness();
});
afterAll(async () => {
  await harness?.close();
});
afterEach(async () => {
  await api?.close();
  await redisHarness.reset();
});
beforeEach(async () => {
  bearerBySubject.clear();
  await harness.reset();
  const env = testEnvironment(harness.databaseUrl);
  api = await createIntegrationApiApp({ env, logger: pino({ enabled: false }) });
  const { first: redis } = await redisHarness.openPair();
  sessionFixture = createSessionFixture(redis, env);
  await harness.db.insert(users).values([
    { username: "alice", name: "Alice", subjectIdentifier: aliceSubject, password: "secret", mobile: "13800000000" },
    { username: "bob", name: "Bob", subjectIdentifier: bobSubject },
    { username: "carol", name: "Carol" },
  ]);
  await harness.db
    .insert(clients)
    .values({ clientCode: "expenses", clientName: "报销系统", clientSecret: "private-secret", extAttributes: {} });
  await harness.db.insert(organizations).values({
    orgCode: "FINANCE",
    orgName: "财务部",
    path: "FINANCE",
    level: OrganizationLevel.One,
    orgType: OrganizationType.Department,
  });
  await harness.db.insert(organizationClosures).values({ ancestorId: 1, descendantId: 1, depth: 0 });
});
async function request(path: string, body: unknown, options: { subject?: string; method?: string } = {}) {
  const subject = options.subject ?? aliceSubject;
  let token = bearerBySubject.get(subject);
  if (token === undefined) {
    token = (await sessionFixture.issueRoot(subject)).bearer;
    bearerBySubject.set(subject, token);
  }
  const response = await api.app.request(`/delegations${path}`, {
    method: options.method ?? "POST",
    headers: { "Content-Type": "application/json", Client: "iam", Authorization: token },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}
function input(extra: Record<string, unknown> = {}) {
  return {
    clientId: 1,
    delegateeUsername: "bob",
    orgCode: "FINANCE",
    startTime: "2026-10-20T00:00:00Z",
    endTime: "2026-10-30T00:00:00Z",
    ...extra,
  };
}
test("creates a Client Delegation only for the trusted subject without role or department prerequisites", async () => {
  const created = await request("", input());
  expect(created.status).toBe(200);
  expect(created.body.data.result).toMatchObject({ delegatorUsername: "alice", delegateeUsername: "bob", clientId: 1 });
  const outgoing = await request("/search", { direction: "outgoing" });
  expect(outgoing.body.data).toHaveLength(1);
  const bobOutgoing = await request("/search", { direction: "outgoing" }, { subject: bobSubject });
  expect(bobOutgoing.body.data).toEqual([]);
  const bobIncoming = await request("/search", { direction: "incoming" }, { subject: bobSubject });
  expect(bobIncoming.body.data.map((record: { id: number }) => record.id)).toEqual([created.body.data.result.id]);
});
test("only the delegator can change a record; receiving it does not permit management", async () => {
  const created = await request("", input());
  const id = created.body.data.result.id;
  const receiverPatch = await request(`/${id}`, { status: Status.Pause }, { method: "PATCH", subject: bobSubject });
  expect(receiverPatch.status).toBe(404);
  expect(receiverPatch.body.code).toBe("CLIENT_DELEGATION.NOT_FOUND");
  const ownerPatch = await request(`/${id}`, { status: Status.Pause, description: "出差期间" }, { method: "PATCH" });
  expect(ownerPatch.status).toBe(200);
  expect(ownerPatch.body.data).toMatchObject({
    changed: true,
    result: { status: Status.Pause, description: "出差期间" },
  });
});
test("selection directories expose only enabled safe identities and exclude the current account", async () => {
  await harness.db
    .update(users)
    .set({ password: "secret-password", mobile: "13900000000", wxId: "private-wx" })
    .where(eq(users.username, "bob"));
  await harness.db.insert(users).values([
    { username: "paused", name: "Paused", status: UserStatus.Pause },
    { username: "deleted", name: "Deleted", isDelete: true },
  ]);
  await harness.db.insert(clients).values({
    clientCode: "paused",
    clientName: "Paused",
    clientSecret: "private",
    status: ClientStatus.Maintenance,
    extAttributes: {},
  });
  await harness.db.insert(organizations).values({
    orgCode: "CLOSED",
    orgName: "Closed",
    path: "CLOSED",
    level: OrganizationLevel.One,
    orgType: OrganizationType.Department,
    status: OrganizationStatus.Disable,
  });
  const people = await request("/choices/users", undefined, { method: "GET" });
  expect(people.status).toBe(200);
  expect(people.body.data).toEqual([
    { id: 2, username: "bob", name: "Bob" },
    { id: 3, username: "carol", name: "Carol" },
  ]);
  const applications = await request("/choices/clients", undefined, { method: "GET" });
  expect(applications.body.data).toEqual([{ id: 1, clientCode: "expenses", clientName: "报销系统" }]);
  const scopes = await request("/choices/organizations", undefined, { method: "GET" });
  expect(scopes.body.data).toEqual([{ id: 1, orgCode: "FINANCE", orgName: "财务部" }]);
  const searched = await request("/choices/users?search=car", undefined, { method: "GET" });
  expect(searched.body.data).toEqual([{ id: 3, username: "carol", name: "Carol" }]);
});
test.each([
  { delegatorUsername: "carol" },
  { delegatorUserId: 3 },
  { subjectIdentifier: bobSubject },
  { privilegeCodes: ["read"] },
])("rejects caller-controlled identity and retired fields without creating a record: %j", async (extra) => {
  const rejected = await request("", input(extra));
  expect(rejected.status).toBe(422);
  const outgoing = await request("/search", { direction: "outgoing" });
  expect(outgoing.body.data).toEqual([]);
});
test("query filters cannot expand the authenticated user's own or received scope", async () => {
  await request("", input());
  await request("", input({ delegateeUsername: "carol" }), { subject: bobSubject });
  const forgedOwner = await request("/search", { direction: "outgoing", delegatorUsernames: ["bob"] });
  expect(forgedOwner.body.data).toEqual([]);
  const forgedReceiver = await request("/search", { direction: "incoming", delegateeUsernames: ["carol"] });
  expect(forgedReceiver.body.data).toEqual([]);
});
test("a permitted operation only resolves identity and does not add a second account-state rejection", async () => {
  await request("", input());
  await harness.db.update(users).set({ status: UserStatus.Disable }).where(eq(users.subjectIdentifier, aliceSubject));
  const outgoing = await request("/search", { direction: "outgoing" });
  expect(outgoing.status).toBe(200);
  expect(outgoing.body.data).toHaveLength(1);
});
test("missing trusted identity fails closed instead of falling back to request identities", async () => {
  const result = await request(
    "/search",
    { direction: "outgoing", delegatorUsernames: ["alice"] },
    { subject: "00000000-0000-4000-8000-000000000099" },
  );
  expect(result.status).toBe(401);
});
test("updating cannot replace any binding even for the current delegator", async () => {
  const created = await request("", input());
  const updated = await request(`/${created.body.data.result.id}`, { delegateeUsername: "carol" }, { method: "PATCH" });
  expect(updated.status).toBe(422);
  const outgoing = await request("/search", { direction: "outgoing" });
  expect(outgoing.body.data[0].delegateeUsername).toBe("bob");
});
test("documents personal delegation input and authenticated session requirements", async () => {
  const response = await api.app.request("/doc");
  expect(response.status).toBe(200);
  const document = await response.json();
  expect(document.paths["/delegations"].post.security).toEqual([
    { IamRootSessionAuthorization: [] },
    { IamRootSessionCookie: [] },
  ]);
  expect(
    document.paths["/delegations"].post.requestBody.content["application/json"].schema.properties,
  ).not.toHaveProperty("delegatorUsername");
});
