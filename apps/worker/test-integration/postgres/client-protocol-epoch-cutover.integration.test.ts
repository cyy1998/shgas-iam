import type { WorkerPostgresTestHarness } from "./postgres-test-harness";
import { createUnitOfWork } from "@iam/api-core/uow";
import { ClientStatus, CustomSsoClientMode, OidcClientType, OidcScope, OidcTokenEndpointAuthMethod, SubjectClaim } from "@iam/contracts";
import { clients } from "@iam/db/schema";
import { ClientProtocolCutoverManifestSchema } from "@iam/domain/client";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { createClientProtocolEpochCutover } from "../../src/commands/client-protocol-epoch-cutover";
import { createClientProtocolEpochCutoverRepository } from "../../src/commands/client-protocol-epoch-cutover.repository";
import { createWorkerPostgresTestHarness } from "./postgres-test-harness";

const testLogger = {
  warn: () => undefined,
  error: () => undefined,
};

let harness: WorkerPostgresTestHarness | undefined;

beforeAll(async () => {
  harness = await createWorkerPostgresTestHarness();
});

beforeEach(async () => {
  await harness!.reset();
});

afterAll(async () => {
  await harness?.close();
  harness = undefined;
});

describe("Client Protocol epoch cutover PostgreSQL contract", () => {
  test("covers every configured client and advances each protocol exactly once across partial retry", async () => {
    await harness!.db.insert(clients).values([{
      clientCode: "portal",
      clientName: "Portal",
      clientSecret: "legacy-secret",
      status: ClientStatus.Maintenance,
      extAttributes: {},
      customSsoEnabled: true,
      customSsoConfig: {
        mode: CustomSsoClientMode.Gateway,
        validRedirectUrls: ["https://portal.example.com/sso/*"],
        subjectClaimCatalogVersion: 2,
        subjectClaims: [SubjectClaim.SubjectIdentifier],
        orcas: { enabled: false },
      },
      customSsoConfigVersion: 3,
      oidcEnabled: true,
      oidcConfig: {
        clientType: OidcClientType.Public,
        redirectUris: ["https://portal.example.com/oidc/callback"],
        postLogoutRedirectUris: [],
        allowedScopes: [OidcScope.OpenId],
        tokenEndpointAuthMethod: OidcTokenEndpointAuthMethod.None,
      },
      oidcConfigVersion: 8,
    }, {
      clientCode: "deleted",
      clientName: "Deleted",
      clientSecret: "legacy-secret",
      isDelete: true,
      extAttributes: {},
      customSsoConfig: {
        mode: CustomSsoClientMode.Gateway,
        validRedirectUrls: ["https://deleted.example.com/sso/*"],
        subjectClaimCatalogVersion: 2,
        subjectClaims: [SubjectClaim.SubjectIdentifier],
        orcas: { enabled: false },
      },
      customSsoConfigVersion: 1,
    }]);
    const cutover = createClientProtocolEpochCutover({
      runtimeCache: createRuntimeCache(),
      uow: createUnitOfWork({
        db: harness!.db,
        logger: testLogger,
        createTxPorts: tx => ({
          clients: createClientProtocolEpochCutoverRepository(tx),
        }),
      }),
    });
    const manifest = ClientProtocolCutoverManifestSchema.parse({
      version: 2,
      clients: [{
        clientCode: "portal",
        customSso: { expectedEpoch: 3, ownerStatus: "confirmed", targetCatalogVersion: 2 },
        oidc: { expectedEpoch: 7, ownerStatus: "confirmed" },
      }],
    });

    const report = await cutover.apply(manifest);
    expect(report).toMatchObject({
      status: "passed",
      counts: { clients: 1, protocols: 2 },
    });

    const [record] = await harness!.db.select({
      customSsoEpoch: clients.customSsoConfigVersion,
      oidcEpoch: clients.oidcConfigVersion,
    }).from(clients).where(eq(clients.clientCode, "portal"));
    expect(record).toEqual({ customSsoEpoch: 4, oidcEpoch: 8 });
  });

  test("upgrades an approved Catalog V1 configuration and advances its epoch exactly once", async () => {
    await insertLegacyCustomSsoClient("legacy", 3);
    const invalidatedClients: string[] = [];
    let invalidationShouldFail = true;
    const runtimeCache = createRuntimeCache(invalidatedClients);
    const beginMutation = runtimeCache.beginMutation;
    runtimeCache.beginMutation = async (clientCode) => {
      const coordination = await beginMutation(clientCode);
      return {
        ...coordination,
        complete: async () => {
          if (invalidationShouldFail) {
            invalidationShouldFail = false;
            throw new Error("runtime invalidation unavailable");
          }
          await coordination.complete();
        },
      };
    };
    const cutover = createClientProtocolEpochCutover({
      runtimeCache,
      uow: createUnitOfWork({
        db: harness!.db,
        logger: testLogger,
        createTxPorts: tx => ({
          clients: createClientProtocolEpochCutoverRepository(tx),
        }),
      }),
    });
    const manifest = ClientProtocolCutoverManifestSchema.parse({
      version: 2,
      clients: [{
        clientCode: "legacy",
        customSso: { expectedEpoch: 3, ownerStatus: "confirmed", targetCatalogVersion: 2 },
        oidc: null,
      }],
    });

    const firstFailure = await cutover.apply(manifest).catch(error => error);
    expect(firstFailure).toBeInstanceOf(Error);
    const [committedRecord] = await harness!.db.select({
      customSsoConfig: clients.customSsoConfig,
      customSsoEpoch: clients.customSsoConfigVersion,
    }).from(clients).where(eq(clients.clientCode, "legacy"));
    expect(committedRecord).toEqual({
      customSsoConfig: {
        mode: CustomSsoClientMode.Gateway,
        validRedirectUrls: ["https://legacy.example.com/sso/*"],
        subjectClaimCatalogVersion: 2,
        subjectClaims: [SubjectClaim.SubjectIdentifier],
        orcas: { enabled: false },
      },
      customSsoEpoch: 4,
    });

    const report = await cutover.apply(manifest);
    expect(report).toMatchObject({
      status: "passed",
      counts: { clients: 1, protocols: 1, advancedEpochs: 1 },
    });
    const [retriedRecord] = await harness!.db.select({
      customSsoEpoch: clients.customSsoConfigVersion,
    }).from(clients).where(eq(clients.clientCode, "legacy"));
    expect(retriedRecord).toEqual({ customSsoEpoch: 4 });
    expect(invalidatedClients).toEqual(["legacy"]);
  });

  test("keeps an already-applied Catalog V2 target unchanged and retries cache invalidation", async () => {
    const originalUpdateTime = new Date("2026-08-01T00:00:00.000Z");
    await harness!.db.insert(clients).values({
      clientCode: "applied",
      clientName: "Applied",
      clientSecret: "legacy-secret",
      extAttributes: {},
      updateTime: originalUpdateTime,
      customSsoEnabled: true,
      customSsoConfig: {
        mode: CustomSsoClientMode.Gateway,
        validRedirectUrls: ["https://applied.example.com/sso/*"],
        subjectClaimCatalogVersion: 2,
        subjectClaims: [SubjectClaim.SubjectIdentifier],
        orcas: { enabled: false },
      },
      customSsoConfigVersion: 4,
    });
    const invalidatedClients: string[] = [];
    const cutover = createClientProtocolEpochCutover({
      runtimeCache: createRuntimeCache(invalidatedClients),
      uow: createUnitOfWork({
        db: harness!.db,
        logger: testLogger,
        createTxPorts: tx => ({
          clients: createClientProtocolEpochCutoverRepository(tx),
        }),
      }),
    });
    const manifest = ClientProtocolCutoverManifestSchema.parse({
      version: 2,
      clients: [{
        clientCode: "applied",
        customSso: { expectedEpoch: 3, ownerStatus: "confirmed", targetCatalogVersion: 2 },
        oidc: null,
      }],
    });

    const report = await cutover.apply(manifest);

    expect(report).toMatchObject({
      status: "passed",
      counts: { clients: 1, protocols: 1, pendingEpochs: 0, advancedEpochs: 1 },
    });
    const [record] = await harness!.db.select({
      customSsoEpoch: clients.customSsoConfigVersion,
      updateTime: clients.updateTime,
    }).from(clients).where(eq(clients.clientCode, "applied"));
    expect(record).toEqual({
      customSsoEpoch: 4,
      updateTime: originalUpdateTime,
    });
    expect(invalidatedClients).toEqual(["applied"]);
  });

  test("rejects an expected-plus-one epoch that still has a Catalog V1 configuration", async () => {
    await insertLegacyCustomSsoClient("bypassed", 4);
    const invalidatedClients: string[] = [];
    const cutover = createClientProtocolEpochCutover({
      runtimeCache: createRuntimeCache(invalidatedClients),
      uow: createUnitOfWork({
        db: harness!.db,
        logger: testLogger,
        createTxPorts: tx => ({
          clients: createClientProtocolEpochCutoverRepository(tx),
        }),
      }),
    });
    const manifest = ClientProtocolCutoverManifestSchema.parse({
      version: 2,
      clients: [{
        clientCode: "bypassed",
        customSso: { expectedEpoch: 3, ownerStatus: "confirmed", targetCatalogVersion: 2 },
        oidc: null,
      }],
    });

    let failure: unknown;
    try {
      await cutover.apply(manifest);
    }
    catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe(
      "Client Protocol epoch batch was not applied completely",
    );

    const [record] = await harness!.sql<{ catalogVersion: number; customSsoEpoch: number }[]>`
      SELECT
        (custom_sso_config->>'subjectClaimCatalogVersion')::integer AS "catalogVersion",
        custom_sso_config_version AS "customSsoEpoch"
      FROM client
      WHERE client_code = 'bypassed'
    `;
    expect(record).toEqual({ catalogVersion: 1, customSsoEpoch: 4 });
    expect(invalidatedClients).toEqual([]);
  });

  test("does not partially mutate when any epoch fence changed concurrently", async () => {
    await harness!.db.insert(clients).values({
      clientCode: "portal",
      clientName: "Portal",
      clientSecret: "legacy-secret",
      extAttributes: {},
      customSsoConfig: {
        mode: CustomSsoClientMode.Gateway,
        validRedirectUrls: ["https://portal.example.com/sso/*"],
        subjectClaimCatalogVersion: 2,
        subjectClaims: [SubjectClaim.SubjectIdentifier],
        orcas: { enabled: false },
      },
      customSsoConfigVersion: 3,
      oidcConfig: {
        clientType: OidcClientType.Public,
        redirectUris: ["https://portal.example.com/oidc/callback"],
        postLogoutRedirectUris: [],
        allowedScopes: [OidcScope.OpenId],
        tokenEndpointAuthMethod: OidcTokenEndpointAuthMethod.None,
      },
      oidcConfigVersion: 9,
    });
    let failure: unknown;
    try {
      await harness!.db.transaction(async (tx) => {
        const repository = createClientProtocolEpochCutoverRepository(tx);
        await repository.advanceEpochs([{
          clientCode: "portal",
          customSsoExpectedEpoch: 3,
          oidcExpectedEpoch: 7,
        }], async () => undefined);
      });
    }
    catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe(
      "Client Protocol epoch batch was not applied completely",
    );

    const [record] = await harness!.db.select({
      customSsoEpoch: clients.customSsoConfigVersion,
      oidcEpoch: clients.oidcConfigVersion,
    }).from(clients).where(eq(clients.clientCode, "portal"));
    expect(record).toEqual({ customSsoEpoch: 3, oidcEpoch: 9 });
  });
});

function createRuntimeCache(completedClients: string[] = []) {
  return {
    async beginMutation(clientCode: string) {
      return {
        abort: async () => undefined,
        complete: async () => {
          completedClients.push(clientCode);
        },
        heartbeat: {
          assertOwned: async () => undefined,
          stopAndSettle: async <T>(settle: () => Promise<T>) => await settle(),
        },
      };
    },
  };
}

async function insertLegacyCustomSsoClient(clientCode: string, epoch: number) {
  await harness!.sql.unsafe(`
    ALTER TABLE client
      DROP CONSTRAINT client_custom_sso_state_check,
      ADD CONSTRAINT client_custom_sso_state_check CHECK (
        custom_sso_config IS NULL
        OR custom_sso_config->>'subjectClaimCatalogVersion' = '1'
      )
  `);
  const migration = new URL(
    "../../../../packages/db/src/migrations/20260821080203_tearful_microchip/migration.sql",
    import.meta.url,
  );
  try {
    await harness!.sql`
      INSERT INTO client (
        client_code,
        client_name,
        client_secret,
        ext_attributes,
        custom_sso_enabled,
        custom_sso_config,
        custom_sso_config_version
      ) VALUES (
        ${clientCode},
        'Legacy',
        'legacy-secret',
        '{}'::jsonb,
        true,
        ${JSON.stringify({
          mode: CustomSsoClientMode.Gateway,
          validRedirectUrls: [`https://${clientCode}.example.com/sso/*`],
          subjectClaimCatalogVersion: 1,
          subjectClaims: [SubjectClaim.SubjectIdentifier],
          orcas: { enabled: false },
        })}::jsonb,
        ${epoch}
      )
    `;
  }
  finally {
    await harness!.sql.file(migration, { cache: false });
  }
}
