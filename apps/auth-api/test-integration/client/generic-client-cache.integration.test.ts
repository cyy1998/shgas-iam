import { afterEach, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { createGenericClientCache } from "@iam/client-snapshot/generic-cache";
import { ClientStatus } from "@iam/contracts";
import { createGenericClientRepository } from "@iam/db/client-snapshot";
import { clients } from "@iam/db/schema";
import { GenericClientRuntimeDtoSchema, toGenericClientRuntimeDto } from "@iam/domain/client";
import { requireExternalTestUrl, runWithOwnedTestResources } from "@iam/test-support/external-test-resources";
import Redis from "ioredis";
import {
  closeAuthApiRedisConnection,
  ownAuthApiTestExecutor,
  resetAuthApiRedisTestDatabase,
} from "../support/fixture-lifecycle";
import { createAuthApiPostgresTestHarness } from "../support/postgres-test-harness";

afterEach(resetAuthApiRedisTestDatabase);

test("the API reader warms both Redis aliases with only the generic Client DTO", async () => {
  await runWithOwnedTestResources(async ({ registerCleanup }) => {
    const pg = await createAuthApiPostgresTestHarness(registerCleanup);
    const redis = new Redis(
      requireExternalTestUrl({
        environment: process.env,
        lane: "API Integration",
        name: "IAM_TEST_REDIS_URL",
      }),
      { lazyConnect: true, maxRetriesPerRequest: 0, retryStrategy: () => null },
    );
    registerCleanup(ownAuthApiTestExecutor(() => closeAuthApiRedisConnection(redis)));
    await redis.connect();

    const clientCode = `portal-${randomUUID()}`;
    const clientSecret = "internal-secret";
    const [row] = await pg.db
      .insert(clients)
      .values({
        clientCode,
        clientName: "Portal",
        clientSecret,
        extAttributes: { private: "private-attributes" },
        ssoSecret: "private-sso-secret",
        ssoCredentialId: randomUUID(),
        ssoSecretUpdatedAt: new Date().toISOString(),
      })
      .returning();
    if (!row) throw new Error("Client fixture insert returned no row");

    const reader = createGenericClientCache({
      redis,
      schema: GenericClientRuntimeDtoSchema,
      source: createGenericClientRepository(pg.db, toGenericClientRuntimeDto),
    });
    const byCode = await reader.getClientByCode(clientCode);
    const bySecret = await reader.getClientBySecret(clientSecret);
    const entries = await redis.mget(`cache:client:code:${clientCode}`, `cache:client:secret:${clientSecret}`);
    const expected = {
      id: row.id,
      clientCode,
      clientName: "Portal",
      clientSecret,
      status: ClientStatus.Enable,
      url: null,
      description: null,
      isDelete: false,
      createTime: row.createTime,
      updateTime: row.updateTime,
      extAttributes: {},
    };

    expect(byCode).toEqual(expected);
    expect(bySecret).toEqual(expected);
    expect(entries.map((value) => value && JSON.parse(value))).toEqual([
      JSON.parse(JSON.stringify(expected)),
      JSON.parse(JSON.stringify(expected)),
    ]);
  });
});
