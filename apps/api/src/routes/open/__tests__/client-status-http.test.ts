import { expect, test } from "bun:test";
import { createInternalAuthzHandler } from "@api/routes/auth/auth.handlers";
import { internalAuthz } from "@api/routes/auth/auth.routes";
import { createOpenHandlers } from "@api/routes/open/open.handlers";
import { createOpenRoute } from "@api/routes/open/open.index";
import { createClientService } from "@api/services/client/client.service";
import createApp from "@iam/api-core/core/create-app";
import { createRouter } from "@iam/api-core/core/create-router";
import { defineConfig } from "@iam/api-core/core/define-config";
import { ClientStatus } from "@iam/contracts";
import type { GenericClientRecord } from "@iam/domain/client";
import pino from "pino";

function unexpectedCall(): never {
  throw new Error("This request must not use unrelated dependencies");
}

function fixture(status: ClientStatus = ClientStatus.Maintenance) {
  const source = {
    id: 1,
    clientCode: "portal",
    clientName: "Portal",
    clientSecret: "INTERNAL-SECRET-SENTINEL",
    status,
    url: "https://portal.example.test",
    description: "Private operational description",
    isDelete: false,
    createTime: new Date("2026-01-01T00:00:00.000Z"),
    updateTime: new Date("2026-01-01T00:00:00.000Z"),
    ssoSecret: "SSO-SECRET-SENTINEL",
    ssoConfig: { credentials: { secret: "NESTED-CONFIG-SECRET-SENTINEL" } },
    extAttributes: { credentials: { secret: "NESTED-EXTENSION-SECRET-SENTINEL" } },
  } satisfies GenericClientRecord & Record<string, unknown>;
  let currentSource: GenericClientRecord | null = source;
  let sourceAvailable = true;
  async function readSource() {
    if (!sourceAvailable) throw new Error("The backing database is unavailable");
    return currentSource;
  }
  const cache = new Map<string, string>();
  const clientService = createClientService({
    clientRepository: {
      getClientByCode: async (code) => (code === "portal" ? readSource() : null),
      getClientBySecret: async (secret) => (secret === "INTERNAL-SECRET-SENTINEL" ? readSource() : null),
    },
    redis: {
      get: async (key) => cache.get(key) ?? null,
      set: async (key, value) => cache.set(key, value),
      del: async (key) => Number(cache.delete(key)),
    },
  });
  const handlers = createOpenHandlers({
    clientService,
    accountRecovery: {
      requestPasswordResetCode: { execute: unexpectedCall },
      resetPassword: { execute: unexpectedCall },
      verifyPasswordResetCode: { execute: unexpectedCall },
    },
    auditLogWriter: { recordAuditLog: unexpectedCall, recordAuditLogFromContext: unexpectedCall },
    humanVerification: {
      createChallenge: unexpectedCall,
      ensureActionAllowed: unexpectedCall,
      isValidSiteKey: unexpectedCall,
      redeemChallenge: unexpectedCall,
    },
    humanRiskService: { recordOpenUserInfoLookup: unexpectedCall },
    mobileService: { sendCode: unexpectedCall, checkVerificationCode: unexpectedCall },
    userService: { getUserMobileByUsername: unexpectedCall },
  });
  const logger = pino({ enabled: false });
  const app = createApp(
    defineConfig({
      prefix: "",
      openapi: { enabled: true, docEndpoint: "/doc" },
      tiers: [
        { name: "open", title: "Open" },
        { name: "auth", title: "Auth" },
      ],
    }),
    {
      env: { NODE_ENV: "test" },
      logger,
      routes: {
        "src/routes/open/open.index.ts": { default: createOpenRoute(handlers) },
        "src/routes/auth/auth.index.ts": {
          default: createRouter().openapi(internalAuthz, createInternalAuthzHandler({ clientService, logger })),
        },
      },
      middlewares: {},
    },
  );
  return {
    app,
    stopSource() {
      sourceAvailable = false;
    },
    removeSource() {
      currentSource = null;
    },
  };
}

test("anonymous Client status returns only public metadata on a database read", async () => {
  const { app } = fixture();
  const response = await app.request("/open/client/status?clientCode=portal");
  const body = await response.json();
  expect(response.status).toBe(200);
  expect(body).toEqual({
    code: 200,
    message: "success",
    data: {
      clientCode: "portal",
      clientName: "Portal",
      status: ClientStatus.Maintenance,
      url: "https://portal.example.test",
    },
  });
});

test("anonymous Client status also removes credentials on a cache hit", async () => {
  const f = fixture();
  const coldResponse = await f.app.request("/open/client/status?clientCode=portal");
  expect(coldResponse.status).toBe(200);
  f.stopSource();
  const response = await f.app.request("/open/client/status?clientCode=portal");
  const body = await response.json();
  expect(response.status).toBe(200);
  expect(body).toEqual({
    code: 200,
    message: "success",
    data: {
      clientCode: "portal",
      clientName: "Portal",
      status: ClientStatus.Maintenance,
      url: "https://portal.example.test",
    },
  });
});

test("anonymous Client status preserves a successful null for an absent Client", async () => {
  const f = fixture();
  f.removeSource();
  const response = await f.app.request("/open/client/status?clientCode=portal");
  const body = await response.json();
  expect(response.status).toBe(200);
  expect(body).toEqual({ code: 200, message: "success", data: null });
});

test("the public OpenAPI response advertises only the explicit public Client fields", async () => {
  const { app } = fixture();
  const response = await app.request("/open/doc");
  const document = await response.json();
  expect(response.status).toBe(200);
  const statusSchema = document.components.schemas.PublicClientStatus;
  expect(statusSchema.type).toEqual(["object", "null"]);
  expect(Object.keys(statusSchema.properties).sort()).toEqual(["clientCode", "clientName", "status", "url"]);
  expect(statusSchema.required.toSorted()).toEqual(["clientCode", "clientName", "status", "url"]);
  const responseSchema = document.paths["/open/client/status"].get.responses["200"].content["application/json"].schema;
  expect(responseSchema.properties.data).toEqual({ $ref: "#/components/schemas/PublicClientStatus" });
});

test("Internal authentication still accepts its secret after an anonymous status read", async () => {
  const f = fixture(ClientStatus.Enable);
  const publicResponse = await f.app.request("/open/client/status?clientCode=portal");
  expect(publicResponse.status).toBe(200);
  f.stopSource();
  const authenticated = await f.app.request("/auth/internal-authz", {
    headers: { apikey: "INTERNAL-SECRET-SENTINEL" },
  });
  const body = await authenticated.json();
  expect(authenticated.status).toBe(200);
  expect(body).toEqual({ code: 200, message: "success", data: true });
});
