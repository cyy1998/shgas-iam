import type { AdminClientTransactionPorts } from "@admin-api/services/client/client.port";
import type { ClientOidcConfigureDto } from "@admin-api/services/client/client.type";
import type { AdminApiPostgresTestHarness } from "./postgres-test-harness";
import { createAdminApiRepositories } from "@admin-api/composition/repositories";
import { createAdminApiUnitOfWork } from "@admin-api/composition/tx";
import { createClientService } from "@admin-api/services/client/client.service";
import { mapUnitOfWork } from "@iam/api-core/uow";
import { ClientStatus, OidcClientType, OidcScope, OidcTokenEndpointAuthMethod } from "@iam/contracts";
import { auditLogs, clients, userProfileDirty } from "@iam/db/schema";
import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { createAdminApiPostgresTestHarness } from "./postgres-test-harness";

let harness: AdminApiPostgresTestHarness;
beforeAll(async () => {
  harness = await createAdminApiPostgresTestHarness();
});
beforeEach(async () => {
  await harness.reset();
  await harness.sql`truncate table client restart identity cascade`;
});
afterAll(async () => {
  await harness?.close();
});

function config(isPublic = false): ClientOidcConfigureDto {
  const common = {
    redirectUris: ["https://portal.example.com/callback"],
    postLogoutRedirectUris: ["https://portal.example.com/logout"],
    allowedScopes: [OidcScope.OpenId, OidcScope.Profile],
  };
  return isPublic
    ? { ...common, clientType: OidcClientType.Public, tokenEndpointAuthMethod: OidcTokenEndpointAuthMethod.None }
    : { ...common, clientType: OidcClientType.Confidential, tokenEndpointAuthMethod: OidcTokenEndpointAuthMethod.ClientSecretBasic };
}

function createCommand(decorate: (tx: AdminClientTransactionPorts) => AdminClientTransactionPorts = tx => tx) {
  const log = mock(() => undefined);
  const invalidateClient = mock(async (_code: string) => undefined);
  const revoke = mock(async () => ({
    principalSessions: { revoked: 0, alreadyRevoked: 0, missing: 0, excluded: 0 },
    bindings: { revoked: 0, alreadyRevoked: 0, missing: 0, excluded: 0 },
    credentials: { revoked: 0, alreadyRevoked: 0, missing: 0, excluded: 0 },
    artifacts: { revoked: 0, alreadyRevoked: 0, missing: 0, excluded: 0 },
    cleanup: { attempted: 0, succeeded: 0, failed: 0, failures: [] },
  }));
  let generation = 0;
  const uow = createAdminApiUnitOfWork({
    db: harness.db,
    logger: { error: log, warn: log },
    clock: { nowDate: () => new Date("2026-09-08T00:00:00Z") },
    userProfileJobProducer: { enqueueRebuildJobs: async () => ({ enqueued: 0, jobIds: [] }) },
  });
  const service = createClientService({
    clientRepository: createAdminApiRepositories(harness.db).client,
    clientCache: { invalidateClient: async () => undefined, invalidateUpdatedClient: async () => undefined },
    clientRuntimeInvalidation: { invalidateClient },
    clientMutationLogger: { error: log },
    sessionRevocation: { revokeClientAllProtocols: revoke, revokeClientProtocol: revoke },
    passwordHasher: { hashSecret: async secret => `hash-${secret}` },
    random: { customSsoClientSecret: () => "unused", oidcClientSecret: () => `one-time-secret-${++generation}` },
    uow: mapUnitOfWork(uow, tx => decorate({ clientRepository: tx.repositories.client, auditService: tx.auditService })),
  });
  return { service, invalidateClient, revoke, log };
}

async function seed(enabled = true, configured = true) {
  const [row] = await harness.db.insert(clients).values({
    clientCode: "portal",
    clientName: "Portal",
    clientSecret: "generic-secret",
    status: ClientStatus.Enable,
    extAttributes: {},
    oidcEnabled: enabled,
    oidcConfig: configured ? config() : null,
    oidcSecretHash: configured ? "old-secret-hash" : null,
    oidcConfigVersion: 10,
  }).returning();
  return row!;
}

async function facts() {
  return {
    clients: await harness.db.select().from(clients).orderBy(clients.id),
    audits: await harness.db.select().from(auditLogs).orderBy(auditLogs.id),
    dirty: await harness.db.select().from(userProfileDirty),
  };
}

async function failure(operation: () => Promise<unknown>) {
  try {
    await operation();
  }
  catch (error) {
    return error;
  }
  throw new Error("Expected command failure");
}

type Command = "configure" | "public" | "enable" | "disable" | "remove" | "rotate";
function invoke(service: ReturnType<typeof createClientService>, command: Command) {
  switch (command) {
    case "configure": return service.configureClientOidc("portal", { ...config(), redirectUris: ["https://portal.example.com/changed"] });
    case "public": return service.configureClientOidc("portal", config(true));
    case "enable": return service.enableClientOidc("portal");
    case "disable": return service.disableClientOidc("portal");
    case "remove": return service.removeClientOidc("portal");
    case "rotate": return service.rotateClientOidcSecret("portal");
  }
}

async function waitForBlockedClient() {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const rows = await harness.sql<{ blocked: boolean }[]>`
      select exists (
        select 1 from pg_stat_activity
        where wait_event_type = 'Lock' and query like '%"client"%'
          and application_name = current_setting('application_name') and pid <> pg_backend_pid()
      ) as blocked
    `;
    if (rows[0]!.blocked)
      return;
  }
  throw new Error("Second independent transaction did not wait for Client row lock");
}

describe("OIDC public commands with production PostgreSQL transactions", () => {
  test("normalized configuration no-op preserves epoch and sessions but audits intent and invalidates", async () => {
    const row = await seed();
    const { service, invalidateClient, revoke } = createCommand();
    const result = await service.configureClientOidc("portal", {
      ...config(),
      allowedScopes: [OidcScope.Profile, OidcScope.OpenId],
    });
    expect(result).toMatchObject({ changed: false, result: { client: { clientCode: "portal", oidcConfigVersion: 10 } } });
    expect(result.result.clientSecret).toBeUndefined();
    const after = await facts();
    expect(after.clients).toEqual([row]);
    expect(after.audits).toMatchObject([{ action: "admin.client.oidc.configure", details: { changed: false } }]);
    expect(after.dirty).toEqual([]);
    expect(revoke).not.toHaveBeenCalled();
    expect(invalidateClient).toHaveBeenCalledTimes(1);
  });

  test("first confidential configuration and each explicit rotation deliver a fresh Secret exactly once", async () => {
    await seed(false, false);
    const { service, invalidateClient, revoke } = createCommand();
    const configured = await service.configureClientOidc("portal", config());
    const first = await service.rotateClientOidcSecret("portal");
    const second = await service.rotateClientOidcSecret("portal");
    expect(configured).toMatchObject({ changed: true, result: { clientSecret: "one-time-secret-1", client: { oidcEnabled: false, hasOidcSecret: true } } });
    expect(first).toMatchObject({ changed: true, result: { clientSecret: "one-time-secret-2" } });
    expect(second).toMatchObject({ changed: true, result: { clientSecret: "one-time-secret-3" } });
    const after = await facts();
    expect(after.clients[0]).toMatchObject({ oidcSecretHash: "hash-one-time-secret-3", oidcConfigVersion: 13 });
    expect(after.audits).toHaveLength(3);
    for (const audit of after.audits)
      expect(audit).toMatchObject({ details: { changed: true } });
    expect(JSON.stringify(after.audits)).not.toContain("one-time-secret");
    expect(JSON.stringify(second.result.client)).not.toContain("one-time-secret");
    const detail = await service.getClientDetailByCode("portal");
    expect(JSON.stringify(detail)).not.toContain("one-time-secret");
    expect(invalidateClient).toHaveBeenCalledTimes(3);
    expect(revoke).toHaveBeenCalledTimes(3);
  });

  test("lifecycle retries audit no-op without writing a new epoch or revoking again", async () => {
    await seed();
    const { service, invalidateClient, revoke } = createCommand();
    const enabled = await service.enableClientOidc("portal");
    const disabled = await service.disableClientOidc("portal");
    const repeated = await service.disableClientOidc("portal");
    const removed = await service.removeClientOidc("portal");
    const removedAgain = await service.removeClientOidc("portal");
    expect([enabled.changed, disabled.changed, repeated.changed, removed.changed, removedAgain.changed]).toEqual([false, true, false, true, false]);
    const after = await facts();
    expect(after.clients[0]).toMatchObject({ oidcConfigVersion: 12, oidcConfig: null, oidcEnabled: false, oidcSecretHash: null });
    expect(after.audits).toMatchObject([false, true, false, true, false].map(changed => ({ details: { changed } })));
    expect(invalidateClient).toHaveBeenCalledTimes(5);
    expect(revoke).toHaveBeenCalledTimes(2);
  });

  for (const operation of ["configure", "rotate"] as const) {
    test(`${operation} committed delivery failure never exposes generated Secret and leaves committed facts`, async () => {
      await seed(false, operation === "rotate");
      const { service, invalidateClient, log } = createCommand();
      invalidateClient.mockImplementation(async () => {
        throw new Error("Snapshot unavailable");
      });
      const error = await failure(() => invoke(service, operation));
      expect(error).toMatchObject({ code: "ADMIN_MUTATION_COMMITTED", httpStatus: 500 });
      expect(JSON.stringify(error)).not.toContain("one-time-secret");
      expect(JSON.stringify(log.mock.calls)).not.toContain("one-time-secret");
      const after = await facts();
      expect(after.clients[0]).toMatchObject({ oidcConfigVersion: 11, oidcSecretHash: "hash-one-time-secret-1" });
      expect(after.audits).toMatchObject([{ details: { changed: true } }]);
      expect(JSON.stringify(after.audits)).not.toContain("one-time-secret");
    });
  }

  for (const operation of ["configure", "enable", "disable", "remove", "rotate"] as const) {
    test(`${operation} missing target returns 404 without side effects`, async () => {
      const { service, invalidateClient, revoke } = createCommand();
      const error = await failure(() => invoke(service, operation));
      expect(error).toMatchObject({ httpStatus: 404 });
      const after = await facts();
      expect(after).toEqual({ clients: [], audits: [], dirty: [] });
      expect(invalidateClient).not.toHaveBeenCalled();
      expect(revoke).not.toHaveBeenCalled();
    });

    test(`${operation} zero returned rows fails closed and cannot create success audit`, async () => {
      await seed(operation !== "enable" && operation !== "remove");
      const { service, invalidateClient, revoke } = createCommand();
      await harness.sql`create function oidc_test_zero_row() returns trigger language plpgsql as $$ begin return null; end $$`;
      await harness.sql`create trigger oidc_test_zero_row before update on client for each row execute function oidc_test_zero_row()`;
      try {
        const before = await facts();
        const error = await failure(() => invoke(service, operation));
        expect(error).toBeInstanceOf(Error);
        const after = await facts();
        expect(after).toEqual(before);
        expect(invalidateClient).not.toHaveBeenCalled();
        expect(revoke).not.toHaveBeenCalled();
      }
      finally {
        await harness.sql`drop trigger oidc_test_zero_row on client`;
        await harness.sql`drop function oidc_test_zero_row()`;
      }
    });

    test(`${operation} audit failure rolls back business and epoch and skips propagation`, async () => {
      await seed(operation !== "enable" && operation !== "remove");
      const sentinel = new Error("audit unavailable");
      const { service, invalidateClient, revoke } = createCommand(tx => ({ ...tx, auditService: {
        ...tx.auditService,
        recordAuditLog: async (event) => {
          await tx.auditService.recordAuditLog(event);
          throw sentinel;
        },
      } }));
      const before = await facts();
      const error = await failure(() => invoke(service, operation));
      expect(error).toBe(sentinel);
      const after = await facts();
      expect(after).toEqual(before);
      expect(invalidateClient).not.toHaveBeenCalled();
      expect(revoke).not.toHaveBeenCalled();
    });
  }

  const races: { first: Command; second: Command; enabled: boolean; rejects?: boolean; expected: Record<string, unknown> }[] = [
    { first: "disable", second: "configure", enabled: true, expected: { oidcEnabled: false, oidcSecretHash: "old-secret-hash", oidcConfigVersion: 12 } },
    { first: "rotate", second: "configure", enabled: true, expected: { oidcEnabled: true, oidcSecretHash: "hash-one-time-secret-1", oidcConfigVersion: 12 } },
    { first: "enable", second: "remove", enabled: false, rejects: true, expected: { oidcEnabled: true, oidcSecretHash: "old-secret-hash", oidcConfigVersion: 11 } },
    { first: "remove", second: "enable", enabled: false, rejects: true, expected: { oidcEnabled: false, oidcConfig: null, oidcSecretHash: null, oidcConfigVersion: 11 } },
    { first: "public", second: "rotate", enabled: true, rejects: true, expected: { oidcEnabled: true, oidcConfig: { clientType: OidcClientType.Public }, oidcSecretHash: null, oidcConfigVersion: 11 } },
    { first: "remove", second: "rotate", enabled: false, rejects: true, expected: { oidcEnabled: false, oidcConfig: null, oidcSecretHash: null, oidcConfigVersion: 11 } },
    { first: "configure", second: "disable", enabled: true, expected: { oidcEnabled: false, oidcSecretHash: "old-secret-hash", oidcConfigVersion: 12 } },
    { first: "configure", second: "rotate", enabled: true, expected: { oidcEnabled: true, oidcSecretHash: "hash-one-time-secret-1", oidcConfigVersion: 12 } },
    { first: "rotate", second: "public", enabled: true, expected: { oidcEnabled: true, oidcConfig: { clientType: OidcClientType.Public }, oidcSecretHash: null, oidcConfigVersion: 12 } },
    { first: "rotate", second: "remove", enabled: false, expected: { oidcEnabled: false, oidcConfig: null, oidcSecretHash: null, oidcConfigVersion: 12 } },
  ];
  for (const race of races) {
    test(`${race.second} waits for ${race.first} and validates the newly committed facts`, async () => {
      const row = await seed(race.enabled);
      const written = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      const first = createCommand(tx => ({ ...tx, clientRepository: {
        ...tx.clientRepository,
        updateClientOidcByCode: async (code, patch) => {
          const result = await tx.clientRepository.updateClientOidcByCode(code, patch);
          written.resolve();
          await release.promise;
          return result;
        },
      } }));
      const second = createCommand();
      const firstPending = invoke(first.service, race.first);
      await Promise.race([written.promise, firstPending]);
      const secondPending = invoke(second.service, race.second);
      const settled = Promise.allSettled([firstPending, secondPending]);
      try {
        await waitForBlockedClient();
      }
      finally {
        release.resolve();
        await settled;
      }
      const results = await settled;
      expect(results[0]).toMatchObject({ status: "fulfilled", value: { changed: true, result: { client: { clientCode: "portal", oidcConfigVersion: 11 } } } });
      if (race.rejects) {
        expect(results[1]).toMatchObject({ status: "rejected", reason: { httpStatus: 409 } });
        expect(second.invalidateClient).not.toHaveBeenCalled();
      }
      else {
        expect(results[1]).toMatchObject({ status: "fulfilled", value: { changed: true, result: { client: { clientCode: "portal", oidcConfigVersion: 12 } } } });
        expect(second.invalidateClient).toHaveBeenCalledTimes(1);
      }
      const after = await facts();
      expect(after.clients[0]).toMatchObject({ ...race.expected, customSsoConfigVersion: row.customSsoConfigVersion });
      if (race.first === "configure" || race.second === "configure")
        expect(after.clients[0]!.oidcConfig?.redirectUris).toEqual(["https://portal.example.com/changed"]);
      expect(after.audits).toHaveLength(race.rejects ? 1 : 2);
      for (const audit of after.audits)
        expect(audit).toMatchObject({ details: { changed: true } });
      expect(after.dirty).toEqual([]);
      expect(first.invalidateClient).toHaveBeenCalledTimes(1);
    });
  }
});
