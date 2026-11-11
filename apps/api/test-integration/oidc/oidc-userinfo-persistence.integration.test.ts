import { afterEach, expect, test } from "bun:test";
import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import process from "node:process";
import {
  OidcScope,
  OrganizationLevel,
  OrganizationType,
  RoleAssignmentTargetType,
  RoleKind,
  RoleType,
} from "@iam/contracts";
import { relations } from "@iam/db/relations";
import {
  clients,
  employments,
  organizationClosures,
  organizations,
  positions,
  roleInclusions,
  roles,
  users,
} from "@iam/db/schema";
import { roleAssignments } from "@iam/db/schema/role-assignments";
import { createDocumentFactsCacheRecord } from "@iam/documents/user/document";
import { createSubjectFactsReader, createSubjectFactsRedisCache } from "@iam/documents/user/subject-facts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import Redis from "ioredis";
import { closeApiRedisConnection, ownApiTestExecutor, resetApiRedisTestDatabase } from "../support/fixture-lifecycle";
import { createApiPostgresTestHarness } from "../support/postgres-test-harness";
import { publishUserDocument } from "../support/user-document.fixture";
import { cleanupAfterFixtureFailure, closeFixtureResources } from "./oidc.fixture";
import { userInfoFixture } from "./oidc-userinfo.fixture";

afterEach(resetApiRedisTestDatabase);

test("UserInfo HTTP uses real published Facts cache, canonical PostgreSQL fallback and transient I/O boundaries", async () => {
  const redisUrl = process.env.IAM_API_TEST_REDIS_URL;
  if (!redisUrl) throw new Error("IAM_API_TEST_REDIS_URL is required");
  const resources: Array<() => unknown | Promise<unknown>> = [];
  const close = ownApiTestExecutor(() => closeFixtureResources(resources));
  try {
    const pg = await createApiPostgresTestHarness((close) => resources.push(close));
    const redis = new Redis(redisUrl, { maxRetriesPerRequest: 0, retryStrategy: () => null });
    resources.push(() => closeApiRedisConnection(redis));
    const cleanup = new Redis(redisUrl);
    const ownedKeys = new Set<string>();
    resources.push(() => closeApiRedisConnection(cleanup));
    const cache = createSubjectFactsRedisCache(
      {
        async get(key) {
          ownedKeys.add(key);
          return await redis.get(key);
        },
        eval: (...args) => redis.eval(...args),
      },
      { keyPrefix: `iam189-facts:${randomUUID()}:` },
    );
    const queries: string[] = [];
    const reader = createSubjectFactsReader({
      db: drizzle({
        client: pg.sql,
        relations,
        logger: {
          logQuery(query) {
            queries.push(query);
          },
        },
      }),
      cache,
    });
    const f = await userInfoFixture(reader);
    resources.push(() => f.close());
    const otherClientCode = "other-app";
    f.addClient(otherClientCode);
    const issued = await f.issue();
    const otherIssued = await f.issue("openid", otherClientCode);
    const [user] = await pg.db
      .insert(users)
      .values({
        subjectIdentifier: f.subjectIdentifier,
        username: "published",
        name: "已发布旧资料",
      })
      .returning({ id: users.id });
    const [organization] = await pg.db
      .insert(organizations)
      .values({
        orgCode: "org",
        orgName: "组织",
        orgType: OrganizationType.Department,
        level: OrganizationLevel.One,
        path: "org",
      })
      .returning({ id: organizations.id });
    const [position, secondaryPosition] = await pg.db
      .insert(positions)
      .values([
        { posCode: "position", posName: "岗位" },
        { posCode: "secondary", posName: "副岗" },
      ])
      .returning({ id: positions.id });
    const [client, otherClient] = await pg.db
      .insert(clients)
      .values([
        { clientCode: f.clientId, clientName: "UserInfo", clientSecret: "test-only", extAttributes: {} },
        { clientCode: otherClientCode, clientName: "Other app", clientSecret: "other-test-only", extAttributes: {} },
      ])
      .returning({ id: clients.id });
    if (!user || !organization || !position || !secondaryPosition || !client || !otherClient)
      throw new Error("UserInfo source fixture is missing");
    await pg.db
      .insert(organizationClosures)
      .values({ ancestorId: organization.id, descendantId: organization.id, depth: 0 });
    const [employment] = await pg.db
      .insert(employments)
      .values([
        { userId: user.id, orgId: organization.id, posId: position.id, isPrimary: true },
        { userId: user.id, orgId: organization.id, posId: secondaryPosition.id, isPrimary: false },
      ])
      .returning({ id: employments.id });
    const [role] = await pg.db
      .insert(roles)
      .values({
        roleCode: "published-role",
        roleName: "Published Role",
        clientId: client.id,
      })
      .returning({ id: roles.id });
    if (!employment || !role) throw new Error("UserInfo role fixture is missing");
    await pg.db
      .insert(roleAssignments)
      .values({ roleId: role.id, targetType: RoleAssignmentTargetType.Employment, targetId: employment.id });
    await publishUserDocument(pg.db, user.id);
    const first = await f.me(issued.access_token);
    expect(first.status).toBe(200);
    const firstPayload = await first.json();
    expect(firstPayload).toMatchObject({
      sub: f.subjectIdentifier,
      name: "已发布旧资料",
      "iam:authorization": {
        roles: ["published-role"],
        employments: [
          { position: { code: "position" }, roles: ["published-role"] },
          { position: { code: "secondary" }, roles: [] },
        ],
      },
    });
    expect(firstPayload["iam:employments"][0].organization).toEqual({
      code: "org",
      name: "组织",
      type: OrganizationType.Department,
      path: [{ code: "org", name: "组织", type: OrganizationType.Department, level: 1, distanceToTarget: 0 }],
    });
    expect(queries).toHaveLength(1);
    queries.length = 0;
    await pg.db.update(users).set({ name: "较新发布资料" }).where(eq(users.id, user.id));
    await pg.db.delete(roleAssignments).where(eq(roleAssignments.roleId, role.id));
    const [nextRole, otherRole, bridge, reviewer, shared] = await pg.db
      .insert(roles)
      .values([
        { roleCode: "app-role", roleName: "Current App Role", clientId: client.id },
        { roleCode: "other-role", roleName: "Other App Role", clientId: otherClient.id, roleKind: RoleKind.Composite },
        {
          roleCode: "other-bridge",
          roleName: "Other App Bridge",
          clientId: otherClient.id,
          roleKind: RoleKind.Composite,
        },
        { roleCode: "global:reviewer", roleName: "Reviewer", roleType: RoleType.Global },
        { roleCode: "global:shared", roleName: "Shared Role", roleType: RoleType.Global },
      ])
      .returning({ id: roles.id });
    if (!nextRole || !otherRole || !bridge || !reviewer || !shared)
      throw new Error("UserInfo updated roles are missing");
    await pg.db.insert(roleInclusions).values([
      { containerRoleId: otherRole.id, memberRoleId: bridge.id },
      { containerRoleId: bridge.id, memberRoleId: nextRole.id },
      { containerRoleId: bridge.id, memberRoleId: reviewer.id },
    ]);
    await pg.db.insert(roleAssignments).values([
      { roleId: otherRole.id, targetType: RoleAssignmentTargetType.Employment, targetId: employment.id },
      { roleId: shared.id, targetType: RoleAssignmentTargetType.Organization, targetId: organization.id },
    ]);
    const published = await publishUserDocument(pg.db, user.id, "2");
    const warm = await f.me(issued.access_token);
    expect(await warm.json()).toMatchObject({
      name: "已发布旧资料",
      "iam:authorization": { roles: ["published-role"] },
    });
    expect(queries).toHaveLength(0);
    expect(ownedKeys.size).toBe(1);
    const updated = {
      name: "较新发布资料",
      "iam:authorization": {
        roles: ["app-role", "global:reviewer", "global:shared"],
        employments: [
          { position: { code: "position" }, roles: ["app-role", "global:reviewer", "global:shared"] },
          { position: { code: "secondary" }, roles: ["global:shared"] },
        ],
      },
    };
    await cache.publish(createDocumentFactsCacheRecord(published));
    const refreshed = await f.me(issued.access_token);
    expect(refreshed.status).toBe(200);
    expect(await refreshed.json()).toMatchObject(updated);
    const otherInfo = await f.me(otherIssued.access_token);
    expect(otherInfo.status).toBe(200);
    expect(await otherInfo.json()).toMatchObject({
      "iam:authorization": {
        roles: ["global:reviewer", "global:shared", "other-bridge", "other-role"],
        employments: [
          { position: { code: "position" }, roles: ["global:reviewer", "global:shared", "other-bridge", "other-role"] },
          { position: { code: "secondary" }, roles: ["global:shared"] },
        ],
      },
    });
    expect(queries).toHaveLength(0);

    const freshToken = await f.issue("openid profile iam:authorization");
    expect(freshToken.access_token).toMatch(/^oa_[\w-]{43}$/u);
    expect(freshToken).not.toHaveProperty("iam:authorization");
    expect(freshToken).not.toHaveProperty("roles");
    const claims = JSON.parse(Buffer.from(freshToken.id_token.split(".")[1]!, "base64url").toString());
    expect(claims).toMatchObject({ sub: f.subjectIdentifier, name: "较新发布资料" });
    expect(claims).not.toHaveProperty("iam:authorization");
    expect(claims).not.toHaveProperty("roles");

    await f.scopes([OidcScope.OpenId, OidcScope.Profile]);
    const trimmed = await f.me(issued.access_token);
    expect(trimmed.status).toBe(200);
    expect(await trimmed.json()).toEqual({
      sub: f.subjectIdentifier,
      preferred_username: "published",
      name: "较新发布资料",
    });
    await f.scopes([OidcScope.OpenId, OidcScope.Profile, OidcScope.IamAuthorization]);
    const key = [...ownedKeys][0]!;
    await cleanup.set(key, "{broken");
    const repaired = await f.me(issued.access_token);
    expect(repaired.status).toBe(200);
    expect(await repaired.json()).toMatchObject(updated);
    expect(queries).toHaveLength(1);
    queries.length = 0;
    await cleanup.del(key);
    await pg.sql`UPDATE user_document SET document = '{}'::jsonb WHERE user_id = ${user.id}`;
    const corrupt = await f.me(issued.access_token);
    expect(corrupt.status).toBe(503);
    expect(await corrupt.json()).toMatchObject({ error: "temporarily_unavailable" });
    expect(queries).toHaveLength(1);
    await pg.sql`DELETE FROM user_document WHERE user_id = ${user.id}`;
    const missing = await f.me(issued.access_token);
    expect(missing.status).toBe(503);
    await f.scopes([OidcScope.OpenId]);
    queries.length = 0;
    const onlySub = await f.me(issued.access_token);
    expect(await onlySub.json()).toEqual({ sub: f.subjectIdentifier });
    expect(queries).toHaveLength(0);
    await f.scopes([OidcScope.OpenId, OidcScope.Profile]);
    redis.disconnect();
    const redisFailure = await f.me(issued.access_token);
    expect(redisFailure.status).toBe(503);
    expect(queries).toHaveLength(0);
    await redis.connect();
    await pg.sql.end();
    const pgFailure = await f.me(issued.access_token);
    expect(pgFailure.status).toBe(503);
    expect(await pgFailure.json()).toMatchObject({ error: "temporarily_unavailable" });
    expect(await f.oidcState.readToken(issued.access_token)).not.toBeNull();
  } catch (failure) {
    await cleanupAfterFixtureFailure(failure, close);
  }
  await close();
});
