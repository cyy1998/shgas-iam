import type { ClientSsoTransactionPorts } from "@admin-api/services/client-sso/client-sso.port";
import type { ClientSsoConfig } from "@iam/contracts";
import type { DbClient } from "@iam/db";
import type { AdminApiPostgresTestHarness } from "./postgres-test-harness";
import { createClientSsoManagement } from "@admin-api/composition/services/client-sso-management";
import { createClientSsoAdapter } from "@admin-api/routes/admin/client-sso/client-sso.adapter";
import { createAuditRepository } from "@admin-api/services/audit/audit.repository";
import { createAdminAuditService } from "@admin-api/services/audit/audit.service";
import { createClientSsoRepository } from "@admin-api/services/client-sso/client-sso.repository";
import { createClientSsoService } from "@admin-api/services/client-sso/client-sso.service";
import {
  ClientCreateDtoSchema,
  ClientInputDtoSchema,
  ClientUpdateDtoSchema,
  toAdminClientRecord,
} from "@admin-api/services/client/client.schema";
import { createErrorHandler } from "@iam/api-core/middlewares";
import { createUnitOfWork } from "@iam/api-core/uow";
import { ApiErrorCode, ClientSsoCallbackType, ClientSsoProtocol, ClientStatus, OidcClientType, OidcScope } from "@iam/contracts";
import { auditLogs, clients, roles } from "@iam/db/schema";
import { toClientAdminDetailDto } from "@iam/domain/client";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { afterAll, beforeAll, beforeEach, expect, mock, test } from "bun:test";
import { Hono } from "hono";
import { addTestAdminAuthorizationMiddleware } from "../helpers/admin-authorization";
import { createAdminApiPostgresTestHarness } from "./postgres-test-harness";

let harness: AdminApiPostgresTestHarness;
beforeAll(async () => {
  harness = await createAdminApiPostgresTestHarness();
});
beforeEach(async () => {
  await harness.reset();
  await harness.sql`truncate table client, role restart identity cascade`;
});
afterAll(async () => {
  await harness?.close();
});
const logger = { error: mock(() => undefined), warn: mock(() => undefined) };
const oidc = {
  protocol: ClientSsoProtocol.Oidc,
  clientType: OidcClientType.Confidential,
  redirectUris: ["https://rp.example/cb"],
  postLogoutRedirectUris: [],
  allowedScopes: [OidcScope.OpenId],
} satisfies ClientSsoConfig;
const custom = {
  protocol: ClientSsoProtocol.CustomSso,
  callbackType: ClientSsoCallbackType.Business,
  callbackEndpoint: "https://rp.example/cb",
  validRedirectUrls: ["https://rp.example/*"],
  subjectClaims: ["subjectIdentifier"],
} satisfies ClientSsoConfig;

async function seed() {
  const [row] = await harness.db
    .insert(clients)
    .values({
      clientCode: "portal",
      clientName: "Portal",
      clientSecret: "internal-stable",
      status: ClientStatus.Enable,
      extAttributes: {},
    })
    .returning();
  await harness.db.insert(roles).values({
    clientId: row!.id,
    roleCode: "portal:reader",
    roleName: "Reader",
  });
  return row!;
}
async function facts() {
  return {
    clients: await harness.db.select().from(clients),
    audits: await harness.db.select().from(auditLogs),
  };
}
async function failure(fn: () => Promise<unknown>) {
  try {
    await fn();
  }
  catch (error) {
    return error;
  }
  throw new Error("Expected failure");
}
function system() {
  const invalidateClient = mock(async (_code: string) => undefined);
  return {
    ...createClientSsoManagement({
      db: harness.db,
      logger,

      invalidation: { invalidateClient },
    }),
    invalidateClient,
  };
}
function http(candidate: ReturnType<typeof createClientSsoAdapter>, rolesForActor = ["iam:admin"]) {
  const app = new Hono();
  addTestAdminAuthorizationMiddleware(app, rolesForActor);
  app.onError(createErrorHandler({ ...logger, info: mock(() => undefined) }));
  app.route("/admin", candidate.rest);
  app.all("/rpc/client-sso/*", c =>
    fetchRequestHandler({
      endpoint: "/rpc/client-sso",
      req: c.req.raw,
      router: candidate.trpc,
      createContext: () => ({ hono: c }),
    }));
  return app;
}
async function request(
  app: ReturnType<typeof http>,
  transport: "rest" | "trpc",
  operation: "save" | "selectProtocol" | "setEnabled",
  data: unknown,
) {
  const restPath = {
    save: "save",
    selectProtocol: "protocol",
    setEnabled: "enabled",
  }[operation];
  const response = await app.request(
    transport === "rest" ? `/admin/clients-sso/portal/${restPath}` : `/rpc/client-sso/${operation}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(transport === "rest" ? data : { clientCode: "portal", data }),
    },
  );
  return { status: response.status, body: await response.json() };
}

for (const transport of ["rest", "trpc"] as const) {
  test(`${transport} ordinary profile no-op omits audit but explicit same-status intent is audited without rewriting the row`, async () => {
    await seed();
    const candidate = system();
    const app = http(candidate);
    const before = await facts();
    const profile = await request(app, transport, "save", { clientName: "Portal" });
    expect(profile.status).toBe(200);
    expect(JSON.stringify(profile.body)).toContain("\"changed\":false");
    const afterProfile = await facts();
    expect(afterProfile).toEqual(before);

    const status = await request(app, transport, "save", { status: ClientStatus.Enable });
    expect(status.status).toBe(200);
    expect(JSON.stringify(status.body)).toContain("\"changed\":false");
    const afterStatus = await facts();
    expect(afterStatus.clients).toEqual(before.clients);
    expect(afterStatus.audits).toHaveLength(1);
    expect(afterStatus.audits[0]).toMatchObject({
      action: "admin.client.update",
      details: { changed: false, status: ClientStatus.Enable, changedFields: ["status"] },
    });
    expect(candidate.invalidateClient).toHaveBeenCalledTimes(2);
  });

  test(`${transport} candidate selects/enables/switches with PG transactions and preserves business identity/current credential`, async () => {
    const original = await seed();
    const candidate = system();
    const app = http(candidate);
    const none = await candidate.service.detail("portal");
    expect(none).toMatchObject({
      ssoConfig: null,
      ssoEnabled: false,
      hasSsoSecret: false,
    });
    const denied = await request(app, transport, "setEnabled", {
      enabled: true,
    });
    expect(denied.status).toBe(400);
    const selected = await request(app, transport, "selectProtocol", {
      config: oidc,
    });
    expect(selected.status).toBe(200);
    const configured = await facts();
    expect(configured.clients[0]!.ssoSecret).not.toBe(original.ssoSecret);
    expect(configured.clients[0]!.ssoSecret).toBeString();
    const enabled = await request(app, transport, "setEnabled", {
      enabled: true,
    });
    expect(enabled.status).toBe(200);
    const switched = await request(app, transport, "selectProtocol", {
      config: custom,
    });
    expect(switched.status).toBe(200);
    const saved = await request(app, transport, "save", {
      clientName: "Renamed",
      status: ClientStatus.Maintenance,
    });
    expect(saved.status).toBe(200);
    const after = await facts();
    const roleRows = await harness.db.select().from(roles);
    expect(roleRows).toMatchObject([{ clientId: original.id, roleCode: "portal:reader" }]);
    expect(after.clients[0]).toMatchObject({
      id: original.id,
      clientCode: "portal",
      clientSecret: "internal-stable",
      ssoConfig: custom,
      ssoEnabled: true,
      ssoSecret: configured.clients[0]!.ssoSecret,
      ssoCredentialId: configured.clients[0]!.ssoCredentialId,
    });
    const plain = JSON.stringify([
      selected.body,
      enabled.body,
      switched.body,
      saved.body,
      after.audits,
      await candidate.service.detail("portal"),
      toClientAdminDetailDto({ ...after.clients[0], hasSsoSecret: after.clients[0]!.ssoSecret !== null }),
      toAdminClientRecord({ ...after.clients[0], hasSsoSecret: after.clients[0]!.ssoSecret !== null }),
    ]);
    expect(plain).not.toContain(configured.clients[0]!.ssoSecret!);
    const paused = await request(app, transport, "setEnabled", {
      enabled: false,
    });
    expect(paused.status).toBe(200);
    const resumed = await request(app, transport, "setEnabled", {
      enabled: true,
    });
    expect(resumed.status).toBe(200);
    const removed = await request(app, transport, "selectProtocol", {
      config: null,
    });
    expect(removed.status).toBe(200);
    const final = await facts();
    expect(final.clients[0]).toMatchObject({
      ssoConfig: null,
      ssoEnabled: false,
      ssoSecret: configured.clients[0]!.ssoSecret,
      clientSecret: "internal-stable",
    });
    expect(candidate.invalidateClient).toHaveBeenCalledTimes(7);
  });
  test(`${transport} denies HR and rejects secret injection and mixed configuration before writing`, async () => {
    await seed();
    const candidate = system();
    const before = await facts();
    const denied = await request(http(candidate, ["iam:hr"]), transport, "selectProtocol", { config: oidc });
    expect(denied.status).toBe(403);
    for (const data of [
      { config: { ...oidc, mode: "gateway" } },
      { config: { ...custom, logoutEndpoint: "https://rp.example/logout" } },
      { config: oidc, ssoSecret: "ATTACK" },
    ]) {
      const invalid = await request(http(candidate), transport, "selectProtocol", data);
      expect(invalid.status).toBeGreaterThanOrEqual(400);
    }
    const invalid = await request(http(candidate), transport, "save", {
      ssoSecret: "ATTACK",
      clientSecret: "ATTACK",
    });
    expect(invalid.status).toBeGreaterThanOrEqual(400);
    const after = await facts();
    expect(after).toEqual(before);
    expect(candidate.invalidateClient).not.toHaveBeenCalled();
  });
}

test("no-op normalizes config, audits intent, preserves timestamps; required failure reports committed and does not replay", async () => {
  await seed();
  const candidate = system();
  await candidate.service.selectProtocol("portal", {
    ...oidc,
    allowedScopes: [OidcScope.Profile, OidcScope.OpenId],
  });
  const before = await facts();
  const noop = await candidate.service.selectProtocol("portal", {
    ...oidc,
    allowedScopes: [OidcScope.OpenId, OidcScope.Profile],
  });
  expect(noop.changed).toBe(false);
  const after = await facts();
  expect(after.clients).toEqual(before.clients);
  expect(after.audits.at(-1)?.details).toMatchObject({ changed: false });
  candidate.invalidateClient.mockImplementation(async () => {
    throw new Error("cache unavailable");
  });
  const committed = await request(http(candidate), "rest", "selectProtocol", {
    config: custom,
  });
  expect(JSON.stringify(committed.body)).toContain(ApiErrorCode.AdminMutationCommitted);
  const committedFacts = await facts();
  expect(committedFacts.clients[0]!.ssoConfig).toEqual(custom);
  expect(committedFacts.audits).toHaveLength(3);
});

test("PostgreSQL rejects invalid enabled, union and partial credential storage", async () => {
  await seed();
  for (const patch of [
    { ssoEnabled: true },
    { ssoSecret: "only-secret" },
    { ssoConfig: { protocol: "other" } },
    { ssoConfig: { ...custom, mode: "gateway" } },
    { ssoConfig: { ...custom, orcas: { enabled: true, secret: "bad" } } },
  ]) {
    const err = await failure(() => harness.db.update(clients).set(patch as never));
    expect(err).toBeDefined();
  }
  const after = await facts();
  expect(after.clients[0]!.ssoConfig).toBeNull();
});

test("actual generic input parsers reject new sensitive columns", async () => {
  const row = await seed();
  for (const field of ["ssoSecret", "ssoCredentialId", "ssoSecretUpdatedAt", "ssoEnabled", "ssoConfig"]) {
    expect(
      ClientCreateDtoSchema.safeParse({
        clientCode: row.clientCode,
        clientName: row.clientName,
        clientSecret: row.clientSecret,
        [field]: "ATTACK",
      }).success,
    ).toBe(false);
    expect(ClientUpdateDtoSchema.safeParse({ clientName: "edit", [field]: "ATTACK" }).success).toBe(false);
    expect(
      ClientInputDtoSchema.safeParse({
        id: row.id,
        clientName: "edit",
        [field]: "ATTACK",
      }).success,
    ).toBe(false);
  }
});

function decoratedService(
  decorate: (tx: ClientSsoTransactionPorts) => ClientSsoTransactionPorts,
  generatedSecret = "new-current-secret",
) {
  return createClientSsoService({
    client: createClientSsoRepository(harness.db),
    logger,

    invalidation: { invalidateClient: async () => undefined },
    credentials: {
      create: () => ({
        secret: generatedSecret,
        id: "55dc321f-2be5-47e1-9873-9bf1f1651eac",
        updatedAt: "2026-09-14T00:00:00Z",
      }),
    },
    uow: createUnitOfWork({
      db: harness.db,
      logger,
      createTxPorts: tx =>
        decorate({
          client: createClientSsoRepository(tx),
          audit: createAdminAuditService({
            auditRepository: createAuditRepository(tx),
          }),
        }),
    }),
  });
}

async function secretRequest(
  app: ReturnType<typeof http>,
  transport: "rest" | "trpc",
  operation: "readSecret" | "rotateSecret",
) {
  const response = await app.request(
    transport === "rest"
      ? `/admin/clients-sso/portal/secret/${operation === "readSecret" ? "read" : "rotate"}`
      : `/rpc/client-sso/${operation}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(transport === "rest" ? {} : { clientCode: "portal" }),
    },
  );
  return { status: response.status, text: await response.text() };
}

for (const transport of ["rest", "trpc"] as const) {
  test(`${transport} rotates only current credential and delivers plaintext only through independent audited read; HR denied`, async () => {
    await seed();
    const candidate = system();
    await candidate.service.selectProtocol("portal", oidc);
    const before = await facts();
    const app = http(candidate);
    const rotated = await secretRequest(app, transport, "rotateSecret");
    const after = await facts();
    const current = after.clients[0]!;
    expect(rotated.status).toBe(200);
    expect(current.ssoSecret).not.toBe(before.clients[0]!.ssoSecret);
    expect(current.ssoCredentialId).not.toBe(before.clients[0]!.ssoCredentialId);
    expect(current.clientSecret).toBe("internal-stable");
    expect(rotated.text).not.toContain(current.ssoSecret!);
    const invalidations = candidate.invalidateClient.mock.calls.length;
    for (const operation of ["readSecret", "rotateSecret"] as const) {
      const denied = await secretRequest(http(candidate, ["iam:hr-admin"]), transport, operation);
      expect(denied.status).toBe(403);
      expect(denied.text).not.toContain(current.ssoSecret!);
    }
    // Discard the first successful response as if delivery was lost, then explicitly read again.
    await secretRequest(app, transport, "readSecret");
    const read = await secretRequest(app, transport, "readSecret");
    expect(read.status).toBe(200);
    expect(read.text).toContain(current.ssoSecret!);
    expect(read.text).toContain(current.ssoCredentialId!);
    const final = await facts();
    expect(final.clients).toEqual(after.clients);
    expect(final.audits.filter(row => row.action === "admin.client.sso_secret_read")).toHaveLength(2);
    expect(JSON.stringify(final.audits)).not.toContain(current.ssoSecret!);
    expect(candidate.invalidateClient.mock.calls.length).toBe(invalidations);
  });

  test(`${transport} actual audit failure never delivers secret or its driver-error cause`, async () => {
    await seed();
    await system().service.selectProtocol("portal", oidc);
    const before = await facts();
    const secret = before.clients[0]!.ssoSecret!;
    const broken = decoratedService(tx => ({
      ...tx,
      audit: {
        async recordAuditLog() {
          // Exercise an actual failed PostgreSQL audit write, with a sensitive driver error sentinel.
          await harness.sql`select cast(${secret} as integer)`;
        },
      },
    }));
    logger.error.mockClear();
    const denied = await secretRequest(http(createClientSsoAdapter(broken)), transport, "readSecret");
    expect(denied.status).toBe(500);
    expect(denied.text).toContain(ApiErrorCode.AdminClientSecretReadAuditFailed);
    expect(denied.text).not.toContain(secret);
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain(secret);
    const after = await facts();
    expect(after).toEqual(before);
  });
}

test("Secret rotation and profile save serialize on the same row without overwriting credentials; rotation audit rollback preserves old current", async () => {
  await seed();
  await system().service.selectProtocol("portal", oidc);
  let release!: () => void;
  let acquired!: () => void;
  const holding = new Promise<void>((resolve) => {
    release = resolve;
  });
  const locked = new Promise<void>((resolve) => {
    acquired = resolve;
  });
  let first = true;
  const service = decoratedService(tx => ({
    ...tx,
    client: {
      ...tx.client,
      async lock(code) {
        const row = await tx.client.lock(code);
        if (first) {
          first = false;
          acquired();
          await holding;
        }
        return row;
      },
    },
  }));
  const rotate = service.rotateSecret("portal");
  await locked;
  const save = service.save("portal", { clientName: "Concurrent edit" });
  release();
  await Promise.all([rotate, save]);
  const before = await facts();
  expect(before.clients[0]).toMatchObject({
    clientName: "Concurrent edit",
    ssoSecret: "new-current-secret",
    clientSecret: "internal-stable",
  });
  const broken = decoratedService(
    tx => ({
      ...tx,
      audit: {
        async recordAuditLog() {
          throw new Error("audit unavailable");
        },
      },
    }),
    "must-roll-back",
  );
  const error = await failure(() => broken.rotateSecret("portal"));
  expect(error).toBeInstanceOf(Error);
  const after = await facts();
  expect(after).toEqual(before);
});
test("audit failure rolls configuration and initial secret back in the same transaction", async () => {
  await seed();
  const before = await facts();
  const service = decoratedService(tx => ({
    ...tx,
    audit: {
      recordAuditLog: async () => {
        throw new Error("audit failed");
      },
    },
  }));
  const error = await failure(() => service.selectProtocol("portal", oidc));
  expect(error).toBeInstanceOf(Error);
  const after = await facts();
  expect(after).toEqual(before);
});
test("same-row lock serializes concurrent protocol selection and creates exactly one initial credential", async () => {
  await seed();
  let release!: () => void;
  let locked!: () => void;
  const holding = new Promise<void>((resolve) => {
    release = resolve;
  });
  const acquired = new Promise<void>((resolve) => {
    locked = resolve;
  });
  let first = true;
  const service = decoratedService(tx => ({
    ...tx,
    client: {
      ...tx.client,
      lock: async (code) => {
        const row = await tx.client.lock(code);
        if (first) {
          first = false;
          locked();
          await holding;
        }
        return row;
      },
    },
  }));
  const one = service.selectProtocol("portal", oidc);
  await acquired;
  const two = service.selectProtocol("portal", custom);
  release();
  const results = await Promise.all([one, two]);
  expect(results.map(result => result.changed)).toEqual([true, true]);
  const after = await facts();
  expect(after.clients[0]!.ssoConfig).toEqual(custom);
  expect(after.clients[0]!.ssoSecret).toBe("new-current-secret");
  expect(after.audits).toHaveLength(2);
});

test("unknown COMMIT after actual PG commit preserves original error, conservatively invalidates and never replays", async () => {
  await seed();
  const originalError = new Error("commit acknowledgement lost");
  const invalidateClient = mock(async () => undefined);
  const service = createClientSsoService({
    client: createClientSsoRepository(harness.db),
    logger,

    invalidation: { invalidateClient },
    credentials: {
      create: () => ({
        secret: "new-current-secret",
        id: "55dc321f-2be5-47e1-9873-9bf1f1651eac",
        updatedAt: "2026-09-14T00:00:00Z",
      }),
    },
    uow: createUnitOfWork({
      db: {
        transaction: async <T>(command: (tx: DbClient) => Promise<T>): Promise<T> => {
          await harness.db.transaction(command);
          throw originalError;
        },
      },
      logger,
      createTxPorts: tx => ({
        client: createClientSsoRepository(tx),
        audit: createAdminAuditService({
          auditRepository: createAuditRepository(tx),
        }),
      }),
    }),
  });
  const error = await failure(() => service.selectProtocol("portal", oidc));
  expect(error).toBe(originalError);
  expect(invalidateClient).toHaveBeenCalledTimes(1);
  const after = await facts();
  expect(after.clients[0]!.ssoConfig).toEqual(oidc);
  expect(after.audits).toHaveLength(1);
});

test("Public and managed callback do not require initial secret; explicit callback type determines requirement", async () => {
  await seed();
  const candidate = system();
  await candidate.service.selectProtocol("portal", {
    ...oidc,
    clientType: OidcClientType.Public,
  });
  await candidate.service.setEnabled("portal", true);
  const publicFacts = await facts();
  expect(publicFacts.clients[0]!.ssoSecret).toBeNull();
  await candidate.service.selectProtocol("portal", {
    ...custom,
    callbackType: ClientSsoCallbackType.Managed,
    callbackEndpoint: "https://business.example:8443/login/finish?tenant=fixed",
    orcas: { enabled: true },
  });
  const managedFacts = await facts();
  expect(managedFacts.clients[0]!.ssoSecret).toBeNull();
  expect(managedFacts.clients[0]!.ssoEnabled).toBe(true);
  await candidate.service.selectProtocol("portal", {
    ...custom,
    callbackEndpoint: "https://business.example/sso/callback",
  });
  const businessFacts = await facts();
  expect(businessFacts.clients[0]!.ssoSecret).toBeString();
  await candidate.service.selectProtocol("portal", { ...custom, callbackType: ClientSsoCallbackType.Managed, callbackEndpoint: "https://business.example/sso/callback" });
  const retained = await facts();
  expect(retained.clients[0]!.ssoSecret).toBe(businessFacts.clients[0]!.ssoSecret);
});

test("business ORCAS configuration is rejected without changing the saved callback or credentials", async () => {
  await seed();
  const candidate = system();
  await candidate.service.selectProtocol("portal", custom);
  const before = await candidate.service.detail("portal");
  let failure: unknown;
  try {
    await candidate.service.selectProtocol("portal", { ...custom, orcas: { enabled: true } });
  }
  catch (error) {
    failure = error;
  }
  expect(failure).toBeDefined();
  const after = await candidate.service.detail("portal");
  expect(after).toEqual(before);
});

test("candidate HTTP detail serializes server capability without sensitive storage", async () => {
  await seed();
  const candidate = system();
  await candidate.service.selectProtocol("portal", oidc);
  for (const path of ["/admin/clients-sso/portal", "/rpc/client-sso/detail?input={\"clientCode\":\"portal\"}"]) {
    const response = await http(candidate).request(path);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(JSON.stringify(body)).toContain(
      "\"allowedActions\":{\"save\":true,\"selectProtocol\":true,\"setEnabled\":true,\"rotateSecret\":true,\"readSecret\":true}",
    );
    expect(JSON.stringify(body)).not.toContain("ssoSecret");
    const denied = await http(candidate, ["iam:hr"]).request(path);
    expect(denied.status).toBe(403);
  }
});
