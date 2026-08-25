import type { Context } from "hono";
import { createClientAdapter } from "@admin-api/routes/admin/client/client.adapter";
import {
  ClientStatus,
  CustomSsoClientMode,
  OidcClientType,
  OidcScope,
  OidcTokenEndpointAuthMethod,
} from "@iam/contracts";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { getTestAdminAuthorizationValue } from "../helpers/admin-authorization";

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

function createContext(valid: Record<string, unknown>) {
  return {
    get: mock((key: string) => {
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
    clientService.updateClientStatus.mockResolvedValue(true);

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
    clientService.deleteClient.mockResolvedValue(true);

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
    clientService.configureClientOidc.mockResolvedValue({ client: {} });

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
    clientService.configureClientCustomSso.mockResolvedValue({ client: {} });

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
      clientService[serviceName].mockResolvedValueOnce({ client: {} });
      const context = createContext({ param: { clientCode: "portal" } });

      await expect(handlers[handlerName](context, async () => {})).resolves.toMatchObject({ code: 200 });
      expect(clientService[serviceName]).toHaveBeenCalledWith(
        "portal",
        expect.objectContaining({ actorUserId: 1001, actorUsername: "admin", requestId: "req-1" }),
      );
    }
  });
});
