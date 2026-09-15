import { randomUUID } from "node:crypto";
import process from "node:process";
import { OidcScope, OrganizationType, UserStatus } from "@iam/contracts";
import { relations } from "@iam/db/relations";
import { createSubjectFactsReader, createSubjectFactsRedisCache } from "@iam/user-profile-read-model/subject-facts";
import { expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/postgres-js";
import Redis from "ioredis";
import { createApiPostgresTestHarness } from "../postgres/postgres-test-harness";
import { userInfoFixture } from "../redis/oidc-userinfo.fixture";
import { closeFixtureResources } from "../redis/oidc.fixture";

test("UserInfo HTTP uses real published Facts cache, narrow PostgreSQL fallback and transient I/O boundaries", async () => {
  const redisUrl = process.env.IAM_API_TEST_REDIS_URL;
  if (!redisUrl)
    throw new Error("IAM_API_TEST_REDIS_URL is required");
  const resources: Array<() => unknown | Promise<unknown>> = [];
  try {
    const pg = await createApiPostgresTestHarness();
    resources.push(() => pg.close());
    const redis = new Redis(redisUrl, { maxRetriesPerRequest: 0, retryStrategy: () => null });
    resources.push(() => redis.disconnect());
    const cleanup = new Redis(redisUrl);
    const ownedKeys = new Set<string>();
    resources.push(async () => {
      try {
        if (ownedKeys.size)
          await cleanup.del(...ownedKeys);
      }
      finally { cleanup.disconnect(); }
    });
    const cache = createSubjectFactsRedisCache({
      async get(key) {
        ownedKeys.add(key);
        return await redis.get(key);
      },
      eval: (...args) => redis.eval(...args),
    }, { keyPrefix: `iam189-facts:${randomUUID()}:` });
    const queries: string[] = [];
    const reader = createSubjectFactsReader({ db: drizzle({ client: pg.sql, relations, logger: { logQuery(query) {
      queries.push(query);
    } } }), cache });
    const f = await userInfoFixture(reader);
    resources.push(() => f.close());
    const issued = await f.issue();
    const facts = { employments: [{
      isPrimary: true,
      organization: { code: "org", name: "组织", type: OrganizationType.Department, path: [{ code: "org", name: "组织", type: OrganizationType.Department }] },
      position: { code: "position", name: "岗位" },
      responsibilities: [],
      clientAuthorizations: [{ clientCode: f.clientId, roles: [{ code: "published-role", privileges: ["published:read"] }] }],
    }] };
    await pg.sql`INSERT INTO user_profile (user_id, subject_identifier, username, name, status, is_delete, search_visible, profile_schema_version, source_dirty_version, detail, search_doc, subject_facts, rebuilt_at)
      VALUES (1, ${f.subjectIdentifier}, 'published', '已发布旧资料', ${UserStatus.Enable}, false, true, 3, 1, '{}'::jsonb, '{}'::jsonb, ${JSON.stringify(facts)}::jsonb, now())`;
    const first = await f.me(issued.access_token);
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ "sub": f.subjectIdentifier, "name": "已发布旧资料", "iam:authorization": { roles: ["published-role"], privileges: ["published:read"] } });
    expect(queries).toHaveLength(1);
    // Exact production SQL proves the accepted narrow read, independent from invalid Detail/Search and absent Dirty.
    expect(queries[0]).toBe("select \"subject_identifier\", \"username\", \"name\", \"mobile\", \"profile_schema_version\", \"source_dirty_version\", \"subject_facts\", \"rebuilt_at\" from \"user_profile\" where \"user_profile\".\"subject_identifier\" = $1 limit $2");
    queries.length = 0;
    await pg.sql`UPDATE user_profile SET name = '较新发布资料', source_dirty_version = 2, subject_facts = '{"employments":[]}'::jsonb WHERE user_id = 1`;
    const warm = await f.me(issued.access_token);
    expect(await warm.json()).toMatchObject({ "name": "已发布旧资料", "iam:authorization": { roles: ["published-role"], privileges: ["published:read"] } });
    expect(queries).toHaveLength(0);
    expect(ownedKeys.size).toBe(1);
    const key = [...ownedKeys][0]!;
    await cleanup.set(key, "{broken");
    const repaired = await f.me(issued.access_token);
    expect(repaired.status).toBe(200);
    expect(await repaired.json()).toMatchObject({ "name": "较新发布资料", "iam:authorization": { roles: [], privileges: [] } });
    expect(queries).toHaveLength(1);
    queries.length = 0;
    await cleanup.del(key);
    await pg.sql`UPDATE user_profile SET subject_facts = '{}'::jsonb WHERE user_id = 1`;
    const corrupt = await f.me(issued.access_token);
    expect(corrupt.status).toBe(503);
    expect(await corrupt.json()).toMatchObject({ error: "temporarily_unavailable" });
    expect(queries).toHaveLength(1);
    await pg.sql`DELETE FROM user_profile WHERE user_id = 1`;
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
  }
  finally { await closeFixtureResources(resources); }
});
