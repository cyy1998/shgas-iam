import type { Context } from "hono";
import { createClientAdapter } from "@admin-api/routes/admin/client/client.adapter";
import { createClientRoute } from "@admin-api/routes/admin/client/client.index";
import { AdminMutationCommittedError } from "@admin-api/services/admin-mutation/admin-mutation";
import { BadRequestError } from "@iam/api-core/errors";
import { createErrorHandler } from "@iam/api-core/middlewares";
import {
  ClientStatus,
  CustomSsoClientMode,
  OidcClientType,
  OidcScope,
  OidcTokenEndpointAuthMethod,
} from "@iam/contracts";
import { ClientCodeExistsError, ClientCodeImmutableError, ClientNotFoundError, CustomSsoClientStateError, OidcClientStateError } from "@iam/domain/client";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";
import { addTestAdminAuthorizationMiddleware, getTestAdminAuthorizationValue } from "../helpers/admin-authorization";

const clientService = {
  createClient: mock(),
  configureClientCustomSso: mock(),
  configureClientOidc: mock(),
  deleteClient: mock(),
  disableClientCustomSso: mock(),
  disableClientOidc: mock(),
  enableClientCustomSso: mock(),
  enableClientOidc: mock(),
  getClientDetailByCode: mock(),
  removeClientCustomSso: mock(),
  removeClientOidc: mock(),
  rotateClientCustomSsoSecret: mock(),
  rotateClientOidcSecret: mock(),
  searchClientsForAdmin: mock(),
  updateClient: mock(),
  updateClientById: mock(),
  updateClientStatus: mock(),
};

const handlers = createClientAdapter({
  clientService,
} as any);

beforeEach(() => {
  clientService.createClient.mockReset();
  clientService.configureClientCustomSso.mockReset();
  clientService.configureClientOidc.mockReset();
  clientService.deleteClient.mockReset();
  clientService.disableClientCustomSso.mockReset();
  clientService.disableClientOidc.mockReset();
  clientService.enableClientCustomSso.mockReset();
  clientService.enableClientOidc.mockReset();
  clientService.getClientDetailByCode.mockReset();
  clientService.removeClientCustomSso.mockReset();
  clientService.removeClientOidc.mockReset();
  clientService.rotateClientCustomSsoSecret.mockReset();
  clientService.rotateClientOidcSecret.mockReset();
  clientService.searchClientsForAdmin.mockReset();
  clientService.updateClient.mockReset();
  clientService.updateClientById.mockReset();
  clientService.updateClientStatus.mockReset();
});

function createContext(valid: Record<string, unknown>, roles = ["iam:admin"]) {
  return {
    get: mock((key: string) => {
      if (key === "userDetailDto")
        return { roles };
      const authorizationValue = getTestAdminAuthorizationValue(key);
      if (authorizationValue !== undefined)
        return authorizationValue;
      if (key === "userId")
        return 1001;
      if (key === "username")
        return "admin";
      if (key === "requestId")
        return "req-1";
      return undefined;
    }),
    req: {
      valid: mock((target: string) => valid[target]),
      header: mock(() => undefined),
      path: "/admin/client",
      method: "POST",
    },
    json: mock((body: unknown) => body),
  } as unknown as Context & {
    get: ReturnType<typeof mock>;
    req: { valid: ReturnType<typeof mock> };
    json: ReturnType<typeof mock>;
  };
}

describe("admin client adapter", () => {
  test("delegates search input to client service", async () => {
    const query = {
      conditions: {
        fuzzyConditions: { text: "portal" },
        exactConditions: { statuses: [ClientStatus.Enable] },
      },
      pageNum: 1,
      pageSize: 10,
    };
    clientService.searchClientsForAdmin.mockResolvedValue({ result: [], total: 0, pageNum: 1, pageSize: 10, pages: 0 });

    const context = createContext({ json: query });
    await expect(handlers.clientsSearch(context, async () => {})).resolves.toMatchObject({ code: 200 });

    expect(clientService.searchClientsForAdmin).toHaveBeenCalledWith(query);
    expect(context.json).toHaveBeenCalledWith({
      code: 200,
      data: { result: [], total: 0, pageNum: 1, pageSize: 10, pages: 0 },
      message: "success",
    }, 200);
  });

  test("delegates update status input to client service", async () => {
    clientService.updateClientStatus.mockResolvedValue({ changed: true, result: null });

    const context = createContext({
      json: { status: ClientStatus.Disable },
      param: { clientCode: "portal" },
    });
    await expect(handlers.clientStatusUpdate(context, async () => {})).resolves.toMatchObject({ code: 200 });

    expect(clientService.updateClientStatus).toHaveBeenCalledWith(
      "portal",
      ClientStatus.Disable,
      expect.objectContaining({ actorUserId: 1001, actorUsername: "admin", requestId: "req-1" }),
    );
  });

  test("delegates delete input to client service", async () => {
    clientService.deleteClient.mockResolvedValue({ changed: true, result: null });

    const context = createContext({ param: { clientCode: "portal" } });
    await expect(handlers.clientDelete(context, async () => {})).resolves.toMatchObject({ code: 200 });

    expect(clientService.deleteClient).toHaveBeenCalledWith(
      "portal",
      expect.objectContaining({ actorUserId: 1001, actorUsername: "admin", requestId: "req-1" }),
    );
  });

  test("delegates OIDC configure input with audit context", async () => {
    const data = {
      clientType: OidcClientType.Public,
      redirectUris: ["https://portal.example.com/callback"],
      postLogoutRedirectUris: [],
      allowedScopes: [OidcScope.OpenId],
      tokenEndpointAuthMethod: OidcTokenEndpointAuthMethod.None,
    };
    clientService.configureClientOidc.mockResolvedValue({ changed: true, result: { client: {} } });

    const context = createContext({ json: data, param: { clientCode: "portal" } });
    await expect(handlers.clientOidcConfigure(context, async () => {})).resolves.toMatchObject({ code: 200 });

    expect(clientService.configureClientOidc).toHaveBeenCalledWith(
      "portal",
      data,
      expect.objectContaining({ actorUserId: 1001, actorUsername: "admin", requestId: "req-1" }),
    );
  });

  test("delegates strict Custom SSO configure input with audit context", async () => {
    const data = {
      mode: CustomSsoClientMode.Gateway,
      validRedirectUrls: ["https://portal.example.com/sso/*"],
      subjectClaims: ["subjectIdentifier"],
      orcas: { enabled: true },
    };
    clientService.configureClientCustomSso.mockResolvedValue({ changed: true, result: { client: {} } });

    const context = createContext({ json: data, param: { clientCode: "portal" } });
    await expect(handlers.clientCustomSsoConfigure(context, async () => {})).resolves.toMatchObject({ code: 200 });

    expect(clientService.configureClientCustomSso).toHaveBeenCalledWith(
      "portal",
      data,
      expect.objectContaining({ actorUserId: 1001, actorUsername: "admin", requestId: "req-1" }),
    );
  });

  test("delegates all state-only Custom SSO operations with audit context", async () => {
    const cases = [
      ["clientCustomSsoEnable", "enableClientCustomSso"],
      ["clientCustomSsoDisable", "disableClientCustomSso"],
      ["clientCustomSsoRemove", "removeClientCustomSso"],
      ["clientCustomSsoRotateSecret", "rotateClientCustomSsoSecret"],
    ] as const;

    for (const [handlerName, serviceName] of cases) {
      clientService[serviceName].mockResolvedValueOnce({ changed: true, result: { client: {} } });
      const context = createContext({ param: { clientCode: "portal" } });

      await expect(handlers[handlerName](context, async () => {})).resolves.toMatchObject({ code: 200 });
      expect(clientService[serviceName]).toHaveBeenCalledWith(
        "portal",
        expect.objectContaining({ actorUserId: 1001, actorUsername: "admin", requestId: "req-1" }),
      );
    }
  });
});

function createPublicSurface(roles = ["iam:admin"]) {
  const app = new Hono();
  addTestAdminAuthorizationMiddleware(app, roles);
  app.onError(createErrorHandler({ error: mock(), warn: mock(), info: mock() }));
  app.route("/admin", createClientRoute(handlers));
  return {
    async rest(method: string, path: string, body?: object) {
      const response = await app.request(`/admin/clients${path}`, {
        method,
        headers: { "content-type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: response.status, body: await response.json() };
    },
    async trpc(procedure: string, input: object) {
      const context = createContext({}, roles);
      const response = await fetchRequestHandler({
        endpoint: "/trpc",
        req: new Request(`http://localhost/trpc/${procedure}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
        }),
        router: handlers.clientAdminRouter,
        createContext: () => ({ hono: context }),
      });
      return { status: response.status, body: await response.json() };
    },
  };
}

const createInput = {
  clientCode: "portal",
  clientName: "Portal",
  clientSecret: "fixture-secret",
  status: ClientStatus.Enable,
  extAttributes: {},
};

const baseCommands = [
  { method: "PUT", path: "/portal", body: { clientName: "Portal" }, service: "updateClient", procedure: "update", input: { clientCode: "portal", data: { clientName: "Portal" } } },
  { method: "PATCH", path: "/portal/status", body: { status: ClientStatus.Enable }, service: "updateClientStatus", procedure: "updateStatus", input: { clientCode: "portal", status: ClientStatus.Enable } },
  { method: "DELETE", path: "/portal", body: undefined, service: "deleteClient", procedure: "delete", input: { clientCode: "portal" } },
] as const;

describe("Client base mutation public protocols", () => {
  test("REST, legacy create and tRPC return the created resource inside the unified result", async () => {
    const surface = createPublicSurface();
    const outcome = { changed: true, result: { id: 1, clientCode: "portal", clientName: "Portal" } };
    clientService.createClient.mockResolvedValue(outcome);
    for (const path of ["", "/create"]) {
      const response = await surface.rest("POST", path, createInput);
      expect(response).toEqual({ status: 200, body: { code: 200, data: outcome, message: "success" } });
    }
    const response = await surface.trpc("create", createInput);
    expect(response).toEqual({ status: 200, body: { result: { data: outcome } } });
  });

  test.each([true, false])("REST, legacy update and tRPC preserve changed=%s with null result", async (changed) => {
    const surface = createPublicSurface();
    const outcome = { changed, result: null };
    for (const command of baseCommands) {
      clientService[command.service].mockResolvedValue(outcome);
      const rest = await surface.rest(command.method, command.path, command.body);
      const trpc = await surface.trpc(command.procedure, command.input);
      expect(rest).toEqual({ status: 200, body: { code: 200, data: outcome, message: "success" } });
      expect(trpc).toEqual({ status: 200, body: { result: { data: outcome } } });
    }
    clientService.updateClientById.mockResolvedValue(outcome);
    const legacy = await surface.rest("POST", "/update", { id: 1, clientCode: "portal", clientName: "Portal" });
    expect(legacy).toEqual({ status: 200, body: { code: 200, data: outcome, message: "success" } });
    expect(clientService.updateClientById).toHaveBeenCalledWith(
      { id: 1, clientCode: "portal", clientName: "Portal" },
      expect.objectContaining({ actorUserId: 1 }),
    );
  });

  test("empty profile and identity-only legacy input retain the service's 400 rejection", async () => {
    const surface = createPublicSurface();
    const error = new BadRequestError("至少提交一个客户端更新字段");
    clientService.updateClient.mockRejectedValue(error);
    clientService.updateClientById.mockRejectedValue(error);
    const rest = await surface.rest("PUT", "/portal", {});
    const trpc = await surface.trpc("update", { clientCode: "portal", data: {} });
    expect(rest).toMatchObject({ status: 400, body: { code: error.code } });
    expect(trpc).toMatchObject({ status: 400, body: { error: { data: { code: "BAD_REQUEST", httpStatus: 400 } } } });
    for (const input of [{ id: 1 }, { id: 1, clientCode: "portal" }]) {
      const legacy = await surface.rest("POST", "/update", input);
      expect(legacy).toMatchObject({ status: 400, body: { code: error.code } });
    }
  });

  test.each([
    [new ClientNotFoundError(), 404, "NOT_FOUND"],
    [new ClientCodeExistsError(), 409, "CONFLICT"],
    [new ClientCodeImmutableError(), 400, "BAD_REQUEST"],
    [new AdminMutationCommittedError(), 500, "INTERNAL_SERVER_ERROR"],
  ] as const)("retains domain and committed failure classification: %s", async (error, status, code) => {
    const surface = createPublicSurface();
    for (const command of baseCommands) {
      clientService[command.service].mockRejectedValue(error);
      const rest = await surface.rest(command.method, command.path, command.body);
      const trpc = await surface.trpc(command.procedure, command.input);
      expect(rest).toMatchObject({ status, body: { code: error.code } });
      expect(rest.body).toMatchObject({ data: null });
      expect(trpc).toMatchObject({
        status,
        body: { error: { data: { code, httpStatus: status, serviceCode: error.code } } },
      });
      expect(trpc.body).not.toHaveProperty("result");
    }
    clientService.createClient.mockRejectedValue(error);
    clientService.updateClientById.mockRejectedValue(error);
    for (const [path, input] of [["/create", createInput], ["/update", { id: 1, clientCode: "other", clientName: "Portal" }]] as const) {
      const legacy = await surface.rest("POST", path, input);
      expect(legacy).toMatchObject({ status, body: { code: error.code } });
    }
    const created = await surface.rest("POST", "", createInput);
    const trpcCreate = await surface.trpc("create", createInput);
    expect(created).toMatchObject({ status, body: { code: error.code } });
    expect(trpcCreate).toMatchObject({ status, body: { error: { data: { code, serviceCode: error.code } } } });
  });

  test("rejects protocol and storage fields before invoking a base mutation", async () => {
    const surface = createPublicSurface();
    for (const field of ["oidcConfigVersion", "customSsoSecretHash", "isDelete", "createTime", "futureStorageField"]) {
      const rest = await surface.rest("POST", "", { ...createInput, [field]: 1 });
      const trpc = await surface.trpc("create", { ...createInput, [field]: 1 });
      expect(rest.status).toBe(422);
      expect(trpc.status).toBe(400);
      const legacy = await surface.rest("POST", "/update", { id: 1, clientName: "Portal", [field]: 1 });
      expect(legacy.status).toBe(422);
    }
    const update = await surface.rest("PUT", "/portal", { clientCode: "other", clientName: "Portal" });
    const trpcUpdate = await surface.trpc("update", { clientCode: "portal", data: { clientCode: "other" } });
    expect(update.status).toBe(422);
    expect(trpcUpdate.status).toBe(400);
    expect(clientService.createClient).not.toHaveBeenCalled();
    expect(clientService.updateClient).not.toHaveBeenCalled();
    expect(clientService.updateClientById).not.toHaveBeenCalled();
  });

  test("all base mutation protocols reject HR authorization before service access", async () => {
    const surface = createPublicSurface(["iam:hr-admin"]);
    for (const command of baseCommands) {
      const rest = await surface.rest(command.method, command.path, command.body);
      const trpc = await surface.trpc(command.procedure, command.input);
      expect(rest.status).toBe(403);
      expect(trpc.status).toBe(403);
      expect(clientService[command.service]).not.toHaveBeenCalled();
    }
    for (const path of ["", "/create"]) {
      const result = await surface.rest("POST", path, createInput);
      expect(result.status).toBe(403);
    }
    const legacy = await surface.rest("POST", "/update", { id: 1, clientName: "Portal" });
    const trpc = await surface.trpc("create", createInput);
    expect(legacy.status).toBe(403);
    expect(trpc.status).toBe(403);
    expect(clientService.createClient).not.toHaveBeenCalled();
    expect(clientService.updateClientById).not.toHaveBeenCalled();
  });
});

describe("OIDC public mutation results", () => {
  const config = {
    clientType: OidcClientType.Public,
    redirectUris: ["https://portal.example.com/callback"],
    postLogoutRedirectUris: [],
    allowedScopes: [OidcScope.OpenId],
    tokenEndpointAuthMethod: OidcTokenEndpointAuthMethod.None,
  };
  const commands = [
    { method: "PUT", action: "configure", service: "configureClientOidc", procedure: "oidcConfigure", body: config },
    { method: "POST", action: "enable", service: "enableClientOidc", procedure: "oidcEnable", body: undefined },
    { method: "POST", action: "disable", service: "disableClientOidc", procedure: "oidcDisable", body: undefined },
    { method: "POST", action: "remove", service: "removeClientOidc", procedure: "oidcRemove", body: undefined },
    { method: "POST", action: "rotate-secret", service: "rotateClientOidcSecret", procedure: "oidcRotateSecret", body: undefined },
  ] as const;

  test("all REST and tRPC commands preserve resource, change status and one-time delivery", async () => {
    const surface = createPublicSurface();
    for (const command of commands) {
      for (const changed of command.action === "rotate-secret" ? [true] : [true, false]) {
        const result = {
          client: { clientCode: "portal" },
          ...(changed && ["configure", "rotate-secret"].includes(command.action) ? { clientSecret: "one-time-secret" } : {}),
        };
        const outcome = { changed, result };
        clientService[command.service].mockResolvedValue(outcome);
        const rest = await surface.rest(command.method, `/portal/oidc/${command.action}`, command.body);
        const trpc = await surface.trpc(command.procedure, { clientCode: "portal", ...(command.body ? { data: command.body } : {}) });
        expect(rest).toEqual({ status: 200, body: { code: 200, data: outcome, message: "success" } });
        expect(trpc).toEqual({ status: 200, body: { result: { data: outcome } } });
      }
    }
  });

  test("OIDC illegal transitions remain conflicts through REST and tRPC", async () => {
    const surface = createPublicSurface();
    for (const command of commands) {
      const error = new OidcClientStateError();
      clientService[command.service].mockRejectedValue(error);
      const rest = await surface.rest(command.method, `/portal/oidc/${command.action}`, command.body);
      const trpc = await surface.trpc(command.procedure, { clientCode: "portal", ...(command.body ? { data: command.body } : {}) });
      expect(rest).toMatchObject({ status: 409, body: { code: error.code, data: null } });
      expect(trpc).toMatchObject({ status: 409, body: { error: { data: { code: "CONFLICT", serviceCode: error.code } } } });
    }
  });

  test("all OIDC transports expose committed failures without a resource or secret", async () => {
    const surface = createPublicSurface();
    for (const command of commands) {
      clientService[command.service].mockRejectedValue(new AdminMutationCommittedError());
      const rest = await surface.rest(command.method, `/portal/oidc/${command.action}`, command.body);
      const trpc = await surface.trpc(command.procedure, { clientCode: "portal", ...(command.body ? { data: command.body } : {}) });
      expect(rest).toMatchObject({ status: 500, body: { code: "ADMIN_MUTATION_COMMITTED", data: null } });
      expect(trpc).toMatchObject({ status: 500, body: { error: { data: { serviceCode: "ADMIN_MUTATION_COMMITTED" } } } });
      expect(trpc.body).not.toHaveProperty("result");
      expect(JSON.stringify([rest.body, trpc.body])).not.toContain("clientSecret");
    }
  });
});

describe("Custom SSO public mutation results", () => {
  const config = {
    mode: CustomSsoClientMode.Independent,
    validRedirectUrls: ["https://portal.example.com/callback"],
    subjectClaims: ["subjectIdentifier"],
    callbackEndpoint: "https://portal.example.com/callback",
    logoutEndpoint: "https://portal.example.com/logout",
  };
  const commands = [
    { method: "PUT", action: "configure", service: "configureClientCustomSso", procedure: "customSsoConfigure", body: config },
    { method: "POST", action: "enable", service: "enableClientCustomSso", procedure: "customSsoEnable", body: undefined },
    { method: "POST", action: "disable", service: "disableClientCustomSso", procedure: "customSsoDisable", body: undefined },
    { method: "POST", action: "remove", service: "removeClientCustomSso", procedure: "customSsoRemove", body: undefined },
    { method: "POST", action: "rotate-secret", service: "rotateClientCustomSsoSecret", procedure: "customSsoRotateSecret", body: undefined },
  ] as const;

  test("all REST and tRPC commands preserve resource, change status and one-time delivery", async () => {
    const surface = createPublicSurface();
    for (const command of commands) {
      for (const changed of command.action === "rotate-secret" ? [true] : [true, false]) {
        const result = {
          client: { clientCode: "portal" },
          ...(changed && ["configure", "rotate-secret"].includes(command.action) ? { customSsoSecret: "one-time-secret" } : {}),
        };
        const outcome = { changed, result };
        clientService[command.service].mockResolvedValue(outcome);
        const rest = await surface.rest(command.method, `/portal/custom-sso/${command.action}`, command.body);
        const trpc = await surface.trpc(command.procedure, { clientCode: "portal", ...(command.body ? { data: command.body } : {}) });
        expect(rest).toEqual({ status: 200, body: { code: 200, data: outcome, message: "success" } });
        expect(trpc).toEqual({ status: 200, body: { result: { data: outcome } } });
      }
    }
  });

  test("Custom SSO illegal transitions remain conflicts through REST and tRPC", async () => {
    const surface = createPublicSurface();
    for (const command of commands) {
      const error = new CustomSsoClientStateError();
      clientService[command.service].mockRejectedValue(error);
      const rest = await surface.rest(command.method, `/portal/custom-sso/${command.action}`, command.body);
      const trpc = await surface.trpc(command.procedure, { clientCode: "portal", ...(command.body ? { data: command.body } : {}) });
      expect(rest).toMatchObject({ status: 409, body: { code: error.code, data: null } });
      expect(trpc).toMatchObject({ status: 409, body: { error: { data: { code: "CONFLICT", serviceCode: error.code } } } });
    }
  });

  test("all Custom SSO transports expose committed failures without a resource or secret", async () => {
    const surface = createPublicSurface();
    for (const command of commands) {
      clientService[command.service].mockRejectedValue(new AdminMutationCommittedError());
      const rest = await surface.rest(command.method, `/portal/custom-sso/${command.action}`, command.body);
      const trpc = await surface.trpc(command.procedure, { clientCode: "portal", ...(command.body ? { data: command.body } : {}) });
      expect(rest).toMatchObject({ status: 500, body: { code: "ADMIN_MUTATION_COMMITTED", data: null } });
      expect(trpc).toMatchObject({ status: 500, body: { error: { data: { serviceCode: "ADMIN_MUTATION_COMMITTED" } } } });
      expect(trpc.body).not.toHaveProperty("result");
      expect(JSON.stringify([rest.body, trpc.body])).not.toContain("customSsoSecret");
    }
  });
});
