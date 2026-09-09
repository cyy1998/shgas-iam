import type { AdminClientTransactionPorts } from "@admin-api/services/client/client.port";
import type { ClientCustomSsoConfigureDto } from "@admin-api/services/client/client.type";
import type { AdminApiPostgresTestHarness } from "./postgres-test-harness";
import { createAdminApiRepositories } from "@admin-api/composition/repositories";
import { createAdminApiUnitOfWork } from "@admin-api/composition/tx";
import { createClientService } from "@admin-api/services/client/client.service";
import { mapUnitOfWork } from "@iam/api-core/uow";
import { ClientStatus, CustomSsoClientMode, CustomSsoClientState, SubjectClaim } from "@iam/contracts";
import { extractPostgresError } from "@iam/db/postgres-error";
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

function config(gateway = false): ClientCustomSsoConfigureDto {
  const common = {
    validRedirectUrls: ["https://portal.example.com/callback", "https://portal.example.com/home"],
    subjectClaims: [SubjectClaim.SubjectIdentifier, SubjectClaim.ProfileUsername],
  };
  return gateway
    ? { ...common, mode: CustomSsoClientMode.Gateway, orcas: { enabled: false } }
    : { ...common, mode: CustomSsoClientMode.Independent, callbackEndpoint: "https://portal.example.com/callback", logoutEndpoint: "https://portal.example.com/logout" };
}

function createCommand(
  decorate: (tx: AdminClientTransactionPorts) => AdminClientTransactionPorts = tx => tx,
  database = harness.db,
) {
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
    db: database,
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
    random: { oidcClientSecret: () => "unused", customSsoClientSecret: () => `one-time-secret-${++generation}` },
    uow: mapUnitOfWork(uow, tx => decorate({ clientRepository: tx.repositories.client, auditService: tx.auditService })),
  });
  return { service, invalidateClient, revoke, log };
}

async function seed(enabled = false, configured = true) {
  const [row] = await harness.db.insert(clients).values({
    clientCode: "portal",
    clientName: "Portal",
    clientSecret: "generic-secret",
    status: ClientStatus.Enable,
    extAttributes: {},
    customSsoEnabled: enabled,
    customSsoConfig: configured ? config() : null,
    customSsoSecretHash: configured ? "old-secret-hash" : null,
    customSsoConfigVersion: 10,
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

type Command = "configure" | "gateway" | "enable" | "disable" | "remove" | "rotate";
function invoke(service: ReturnType<typeof createClientService>, command: Command) {
  switch (command) {
    case "configure": return service.configureClientCustomSso("portal", { ...config(), validRedirectUrls: ["https://portal.example.com/changed"] });
    case "gateway": return service.configureClientCustomSso("portal", config(true));
    case "enable": return service.enableClientCustomSso("portal");
    case "disable": return service.disableClientCustomSso("portal");
    case "remove": return service.removeClientCustomSso("portal");
    case "rotate": return service.rotateClientCustomSsoSecret("portal");
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

describe("Custom SSO public commands with production PostgreSQL transactions", () => {
  test("normalized configuration no-op preserves epoch and sessions but audits intent and invalidates", async () => {
    const row = await seed(true);
    const { service, invalidateClient, revoke } = createCommand();
    const result = await service.configureClientCustomSso("portal", {
      ...config(),
      subjectClaims: [SubjectClaim.ProfileUsername, SubjectClaim.SubjectIdentifier],
      validRedirectUrls: [...config().validRedirectUrls].reverse(),
    });
    expect(result).toMatchObject({ changed: false, result: { client: { clientCode: "portal", customSsoConfigVersion: 10 } } });
    expect(result.result.customSsoSecret).toBeUndefined();
    const after = await facts();
    expect(after.clients).toEqual([row]);
    expect(after.audits).toMatchObject([{ action: "admin.client.custom_sso.configure", details: { changed: false } }]);
    expect(after.dirty).toEqual([]);
    expect(revoke).not.toHaveBeenCalled();
    expect(invalidateClient).toHaveBeenCalledTimes(1);
  });

  test("first Independent configuration and each explicit rotation deliver a fresh Secret exactly once", async () => {
    await seed(false, false);
    const { service, invalidateClient, revoke } = createCommand();
    const configured = await service.configureClientCustomSso("portal", config());
    const first = await service.rotateClientCustomSsoSecret("portal");
    const second = await service.rotateClientCustomSsoSecret("portal");
    expect(configured).toMatchObject({ changed: true, result: { customSsoSecret: "one-time-secret-1", client: { customSsoState: CustomSsoClientState.Disabled, hasCustomSsoSecret: true } } });
    expect(first).toMatchObject({ changed: true, result: { customSsoSecret: "one-time-secret-2" } });
    expect(second).toMatchObject({ changed: true, result: { customSsoSecret: "one-time-secret-3" } });
    const after = await facts();
    expect(after.clients[0]).toMatchObject({ customSsoSecretHash: "hash-one-time-secret-3", customSsoConfigVersion: 13 });
    expect(after.audits).toHaveLength(3);
    for (const audit of after.audits)
      expect(audit).toMatchObject({ details: { changed: true } });
    expect(JSON.stringify(after.audits)).not.toContain("one-time-secret");
    expect(JSON.stringify(second.result.client)).not.toContain("one-time-secret");
    const detail = await service.getClientDetailByCode("portal");
    expect(JSON.stringify(detail)).not.toContain("one-time-secret");
    expect(invalidateClient).toHaveBeenCalledTimes(3);
    expect(revoke).toHaveBeenCalledTimes(3);
    for (const [index, committedVersion] of [11, 12, 13].entries()) {
      expect(revoke).toHaveBeenNthCalledWith(index + 1, expect.objectContaining({
        clientCode: "portal",
        protocol: "custom-sso",
        committedVersion,
      }));
    }
  });

  test("lifecycle retries audit no-op without writing a new epoch or revoking again", async () => {
    await seed(true);
    const { service, invalidateClient, revoke } = createCommand();
    const enabled = await service.enableClientCustomSso("portal");
    const disabled = await service.disableClientCustomSso("portal");
    const repeated = await service.disableClientCustomSso("portal");
    const removed = await service.removeClientCustomSso("portal");
    const removedAgain = await service.removeClientCustomSso("portal");
    expect([enabled.changed, disabled.changed, repeated.changed, removed.changed, removedAgain.changed]).toEqual([false, true, false, true, false]);
    const after = await facts();
    expect(after.clients[0]).toMatchObject({ customSsoConfigVersion: 12, customSsoConfig: null, customSsoEnabled: false, customSsoSecretHash: null });
    expect(after.audits).toMatchObject([false, true, false, true, false].map(changed => ({ details: { changed } })));
    expect(invalidateClient).toHaveBeenCalledTimes(5);
    expect(revoke).toHaveBeenCalledTimes(2);
    expect(revoke).toHaveBeenNthCalledWith(1, expect.objectContaining({ protocol: "custom-sso", committedVersion: 11 }));
    expect(revoke).toHaveBeenNthCalledWith(2, expect.objectContaining({ protocol: "custom-sso", committedVersion: 12 }));
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
      expect(after.clients[0]).toMatchObject({ customSsoConfigVersion: 11, customSsoSecretHash: "hash-one-time-secret-1" });
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
      await seed(operation === "disable");
      const { service, invalidateClient, revoke } = createCommand();
      await harness.sql`create function customSso_test_zero_row() returns trigger language plpgsql as $$ begin return null; end $$`;
      await harness.sql`create trigger customSso_test_zero_row before update on client for each row execute function customSso_test_zero_row()`;
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
        await harness.sql`drop trigger customSso_test_zero_row on client`;
        await harness.sql`drop function customSso_test_zero_row()`;
      }
    });

    test(`${operation} audit failure rolls back business and epoch and skips propagation`, async () => {
      await seed(operation === "disable");
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

  test("Gateway saves preserve strict Secret pairing and same enabled configuration is a no-op", async () => {
    await seed();
    const { service, revoke, invalidateClient } = createCommand();
    const gateway = await service.configureClientCustomSso("portal", config(true));
    const enabled = await service.enableClientCustomSso("portal");
    const repeated = await service.configureClientCustomSso("portal", {
      ...config(true),
      validRedirectUrls: [...config(true).validRedirectUrls].reverse().concat(config(true).validRedirectUrls),
    });
    expect(gateway).toMatchObject({ changed: true, result: { client: { hasCustomSsoSecret: false } } });
    expect(gateway.result.customSsoSecret).toBeUndefined();
    expect(enabled.changed).toBe(true);
    expect(repeated.changed).toBe(false);
    const before = await facts();
    const error = await failure(() => service.rotateClientCustomSsoSecret("portal"));
    expect(error).toMatchObject({ httpStatus: 409 });
    const after = await facts();
    expect(after).toEqual(before);
    expect(after.clients[0]).toMatchObject({ customSsoEnabled: true, customSsoSecretHash: null, customSsoConfigVersion: 12 });
    expect(after.audits).toMatchObject([true, true, false].map(changed => ({ details: { changed } })));
    expect(after.dirty).toEqual([]);
    expect(revoke).toHaveBeenCalledTimes(2);
    expect(invalidateClient).toHaveBeenCalledTimes(3);
  });

  test("required propagation still fails after an audited no-op without rotating or advancing epoch", async () => {
    const row = await seed(true);
    const { service, invalidateClient, revoke } = createCommand();
    invalidateClient.mockImplementation(async () => {
      throw new Error("Snapshot unavailable");
    });
    const error = await failure(() => service.configureClientCustomSso("portal", config()));
    expect(error).toMatchObject({ code: "ADMIN_MUTATION_COMMITTED", httpStatus: 500 });
    const after = await facts();
    expect(after.clients).toEqual([row]);
    expect(after.audits).toMatchObject([{ details: { changed: false } }]);
    expect(after.dirty).toEqual([]);
    expect(revoke).not.toHaveBeenCalled();
  });

  test("best-effort revocation failure retains success and committed epoch", async () => {
    await seed();
    const { service, revoke, invalidateClient } = createCommand();
    revoke.mockImplementation(async () => {
      throw new Error("revocation unavailable");
    });
    const result = await service.rotateClientCustomSsoSecret("portal");
    expect(result).toMatchObject({ changed: true, result: { customSsoSecret: "one-time-secret-1" } });
    const after = await facts();
    expect(after.clients[0]).toMatchObject({ customSsoConfigVersion: 11, customSsoSecretHash: "hash-one-time-secret-1" });
    expect(after.audits).toMatchObject([{ details: { changed: true } }]);
    expect(invalidateClient).toHaveBeenCalledTimes(1);
  });

  test("Maintenance allows preparation while global Disable rejects new protocol enablement", async () => {
    await seed();
    await harness.sql`update client set status = ${ClientStatus.Maintenance}`;
    const { service } = createCommand();
    const configured = await invoke(service, "configure");
    const enabled = await service.enableClientCustomSso("portal");
    expect(configured.changed).toBe(true);
    expect(enabled).toMatchObject({ changed: true, result: { client: { status: ClientStatus.Maintenance, customSsoState: CustomSsoClientState.Enabled } } });
    await service.disableClientCustomSso("portal");
    await harness.sql`update client set status = ${ClientStatus.Disable}`;
    const before = await facts();
    const error = await failure(() => service.enableClientCustomSso("portal"));
    expect(error).toMatchObject({ httpStatus: 409 });
    const after = await facts();
    expect(after).toEqual(before);
    expect(after.clients[0]!.oidcConfigVersion).toBe(0);
  });

  test("already enabled intent is a no-op even while the global Client is disabled", async () => {
    await seed(true);
    await harness.sql`update client set status = ${ClientStatus.Disable}`;
    const before = await facts();
    const { service, invalidateClient, revoke } = createCommand();
    const result = await service.enableClientCustomSso("portal");
    expect(result).toMatchObject({ changed: false, result: { client: {
      status: ClientStatus.Disable,
      customSsoState: CustomSsoClientState.Enabled,
    } } });
    const after = await facts();
    expect(after.clients).toEqual(before.clients);
    expect(after.audits).toMatchObject([{ details: { changed: false } }]);
    expect(after.dirty).toEqual([]);
    expect(invalidateClient).toHaveBeenCalledTimes(1);
    expect(revoke).not.toHaveBeenCalled();
  });

  test("uncertain COMMIT acknowledgement preserves the original error and invalidates conservatively", async () => {
    await seed();
    const sentinel = new Error("COMMIT acknowledgement unavailable");
    const database = new Proxy(harness.db, {
      get(target, property, receiver) {
        if (property === "transaction") {
          return async (callback: Parameters<typeof target.transaction>[0]) => {
            await target.transaction(callback);
            throw sentinel;
          };
        }
        return Reflect.get(target, property, receiver);
      },
    });
    const { service, invalidateClient, revoke, log } = createCommand(tx => tx, database);
    const error = await failure(() => service.rotateClientCustomSsoSecret("portal"));
    expect(error).toBe(sentinel);
    expect(error).not.toMatchObject({ code: "ADMIN_MUTATION_COMMITTED" });
    expect(JSON.stringify(error)).not.toContain("one-time-secret");
    expect(JSON.stringify(log.mock.calls)).not.toContain("one-time-secret");
    const after = await facts();
    expect(after.clients[0]).toMatchObject({ customSsoConfigVersion: 11, customSsoSecretHash: "hash-one-time-secret-1" });
    expect(after.audits).toMatchObject([{ details: { changed: true } }]);
    expect(JSON.stringify(after.audits)).not.toContain("one-time-secret");
    expect(after.dirty).toEqual([]);
    expect(invalidateClient).toHaveBeenCalledTimes(1);
    expect(revoke).not.toHaveBeenCalled();
  });

  test("unknown PostgreSQL constraint failures stay internal and roll back every effect", async () => {
    await seed();
    await harness.sql`alter table client add constraint custom_sso_test_epoch_check check (custom_sso_config_version <= 10)`;
    try {
      const { service, invalidateClient, revoke } = createCommand();
      const before = await facts();
      const error = await failure(() => service.rotateClientCustomSsoSecret("portal"));
      expect(extractPostgresError(error)).toEqual({ code: "23514", constraint: "custom_sso_test_epoch_check" });
      expect(error).not.toMatchObject({ httpStatus: 409 });
      const after = await facts();
      expect(after).toEqual(before);
      expect(invalidateClient).not.toHaveBeenCalled();
      expect(revoke).not.toHaveBeenCalled();
    }
    finally {
      await harness.sql`alter table client drop constraint custom_sso_test_epoch_check`;
    }
  });

  const races: { first: Command; second: Command; enabled: boolean; rejects?: boolean; secondChanged?: boolean; expected: Record<string, unknown> }[] = [
    { first: "disable", second: "configure", enabled: true, expected: { customSsoEnabled: false, customSsoSecretHash: "old-secret-hash", customSsoConfigVersion: 12 } },
    { first: "configure", second: "disable", enabled: false, secondChanged: false, expected: { customSsoEnabled: false, customSsoSecretHash: "old-secret-hash", customSsoConfigVersion: 11 } },
    { first: "rotate", second: "configure", enabled: false, expected: { customSsoEnabled: false, customSsoSecretHash: "hash-one-time-secret-1", customSsoConfigVersion: 12 } },
    { first: "configure", second: "rotate", enabled: false, expected: { customSsoEnabled: false, customSsoSecretHash: "hash-one-time-secret-1", customSsoConfigVersion: 12 } },
    { first: "enable", second: "remove", enabled: false, rejects: true, expected: { customSsoEnabled: true, customSsoSecretHash: "old-secret-hash", customSsoConfigVersion: 11 } },
    { first: "remove", second: "enable", enabled: false, rejects: true, expected: { customSsoEnabled: false, customSsoConfig: null, customSsoSecretHash: null, customSsoConfigVersion: 11 } },
    { first: "gateway", second: "rotate", enabled: false, rejects: true, expected: { customSsoEnabled: false, customSsoConfig: { mode: CustomSsoClientMode.Gateway }, customSsoSecretHash: null, customSsoConfigVersion: 11 } },
    { first: "rotate", second: "gateway", enabled: false, expected: { customSsoEnabled: false, customSsoConfig: { mode: CustomSsoClientMode.Gateway }, customSsoSecretHash: null, customSsoConfigVersion: 12 } },
    { first: "remove", second: "rotate", enabled: false, rejects: true, expected: { customSsoEnabled: false, customSsoConfig: null, customSsoSecretHash: null, customSsoConfigVersion: 11 } },
    { first: "rotate", second: "remove", enabled: false, expected: { customSsoEnabled: false, customSsoConfig: null, customSsoSecretHash: null, customSsoConfigVersion: 12 } },
  ];
  for (const race of races) {
    test(`${race.second} waits for ${race.first} and validates the newly committed facts`, async () => {
      const row = await seed(race.enabled);
      const written = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      const first = createCommand(tx => ({ ...tx, clientRepository: {
        ...tx.clientRepository,
        updateClientCustomSsoByCode: async (code, patch) => {
          const result = await tx.clientRepository.updateClientCustomSsoByCode(code, patch);
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
      expect(results[0]).toMatchObject({ status: "fulfilled", value: { changed: true, result: { client: { clientCode: "portal", customSsoConfigVersion: 11 } } } });
      if (race.rejects) {
        expect(results[1]).toMatchObject({ status: "rejected", reason: { httpStatus: 409 } });
        expect(second.invalidateClient).not.toHaveBeenCalled();
      }
      else {
        expect(results[1]).toMatchObject({ status: "fulfilled", value: { changed: race.secondChanged ?? true, result: { client: { clientCode: "portal", customSsoConfigVersion: race.secondChanged === false ? 11 : 12 } } } });
        expect(second.invalidateClient).toHaveBeenCalledTimes(1);
      }
      const after = await facts();
      expect(after.clients[0]).toMatchObject({ ...race.expected, oidcConfigVersion: row.oidcConfigVersion });
      if (race.first === "configure" || race.second === "configure")
        expect(after.clients[0]!.customSsoConfig?.validRedirectUrls).toEqual(["https://portal.example.com/changed"]);
      expect(after.audits).toHaveLength(race.rejects ? 1 : 2);
      expect(after.audits).toMatchObject(
        (race.rejects ? [true] : [true, race.secondChanged ?? true]).map(changed => ({ details: { changed } })),
      );
      expect(after.dirty).toEqual([]);
      expect(first.invalidateClient).toHaveBeenCalledTimes(1);
    });
  }
});
