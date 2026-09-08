import { createClientRoute } from "@admin-api/routes/admin/client/client.index";
import { describe, expect, test } from "bun:test";

function createAdapterStub() {
  const handler = () => new Response();
  return new Proxy({}, {
    get: () => handler,
  });
}

describe("Custom SSO Admin OpenAPI contract", () => {
  test("all five operations expose changed/result, safe Client and optional one-time Secret", () => {
    const document = createClientRoute(createAdapterStub() as never).getOpenAPI31Document({
      openapi: "3.1.0",
      info: { title: "test", version: "1" },
    });
    const schemas = JSON.parse(JSON.stringify(document.components?.schemas));
    const paths = JSON.parse(JSON.stringify(document.paths));
    for (const action of ["configure", "enable", "disable", "remove", "rotate-secret"]) {
      const method = action === "configure" ? "put" : "post";
      const responses = paths[`/clients/:clientCode/custom-sso/${action}`][method].responses;
      expect(responses[409]).toBeDefined();
      expect(responses[500]).toBeDefined();
      expect(responses[200].content["application/json"].schema.properties.data)
        .toEqual({ $ref: "#/components/schemas/ClientCustomSsoMutationResult" });
    }
    expect(schemas.ClientCustomSsoMutationResult).toMatchObject({
      type: "object",
      required: ["changed", "result"],
      properties: {
        changed: { type: "boolean" },
        result: {
          type: "object",
          required: ["client"],
          properties: {
            client: { $ref: "#/components/schemas/ClientAdminDetailDto" },
            customSsoSecret: { type: "string" },
          },
        },
      },
    });
  });

  test("publishes five dedicated Custom SSO operations with their exact methods and paths", () => {
    const route = createClientRoute(createAdapterStub() as never);
    const document = route.getOpenAPI31Document({
      openapi: "3.1.0",
      info: { title: "test", version: "1" },
    });

    expect(document.paths).toMatchObject({
      "/clients/:clientCode/custom-sso/configure": { put: expect.any(Object) },
      "/clients/:clientCode/custom-sso/enable": { post: expect.any(Object) },
      "/clients/:clientCode/custom-sso/disable": { post: expect.any(Object) },
      "/clients/:clientCode/custom-sso/remove": { post: expect.any(Object) },
      "/clients/:clientCode/custom-sso/rotate-secret": { post: expect.any(Object) },
    });
    expect(document.components?.schemas).toMatchObject({
      ClientCustomSsoConfigureDto: expect.any(Object),
      ClientCustomSsoMutationResult: expect.any(Object),
    });
  });
});

describe("Client base mutation OpenAPI contract", () => {
  test("publishes unified mutation results and common failures for REST and legacy commands", () => {
    const route = createClientRoute(createAdapterStub() as never);
    const document = route.getOpenAPI31Document({
      openapi: "3.1.0",
      info: { title: "test", version: "1" },
    });
    const paths = JSON.parse(JSON.stringify(document.paths));
    const commands = [
      ["/clients", "post", true],
      ["/clients/create", "post", true],
      ["/clients/:clientCode", "put", false],
      ["/clients/update", "post", false],
      ["/clients/:clientCode/status", "patch", false],
      ["/clients/:clientCode", "delete", false],
    ] as const;
    for (const [path, method, createsResource] of commands) {
      const responses = paths[path][method].responses;
      expect(responses).toMatchObject({
        400: expect.any(Object),
        401: expect.any(Object),
        403: expect.any(Object),
        404: expect.any(Object),
        409: expect.any(Object),
        500: expect.any(Object),
      });
      const data = responses[200].content["application/json"].schema.properties.data;
      expect(data).toEqual({
        type: "object",
        properties: {
          changed: { type: "boolean" },
          result: createsResource ? { $ref: "#/components/schemas/ClientAdminDetailDto" } : { type: "null" },
        },
        required: ["changed", "result"],
      });
    }
    expect(paths["/clients/:clientCode/oidc/configure"].put.responses[200].content["application/json"].schema.properties.data)
      .toEqual({ $ref: "#/components/schemas/ClientOidcMutationResult" });
    expect(paths["/clients/:clientCode/custom-sso/configure"].put.responses[200].content["application/json"].schema.properties.data)
      .toEqual({ $ref: "#/components/schemas/ClientCustomSsoMutationResult" });
  });

  test("publishes only the explicit base input fields and keeps code out of standard updates", () => {
    const document = createClientRoute(createAdapterStub() as never).getOpenAPI31Document({
      openapi: "3.1.0",
      info: { title: "test", version: "1" },
    });
    const schemas = JSON.parse(JSON.stringify(document.components?.schemas));
    const writable = ["clientName", "clientSecret", "url", "status", "description", "extAttributes"];
    expect(Object.keys(schemas.ClientCreateDto.properties).sort()).toEqual([...writable, "clientCode"].sort());
    expect(Object.keys(schemas.ClientUpdateDto.properties).sort()).toEqual(writable.sort());
    expect(Object.keys(schemas.ClientInputDto.properties).sort()).toEqual([...writable, "clientCode", "id"].sort());
    for (const name of ["ClientCreateDto", "ClientUpdateDto", "ClientInputDto"]) {
      expect(schemas[name].additionalProperties).toBe(false);
    }
  });
});

test("OIDC OpenAPI exposes the unified result with the Client and optional one-time secret", () => {
  const document = createClientRoute(createAdapterStub() as never).getOpenAPI31Document({
    openapi: "3.1.0",
    info: { title: "test", version: "1" },
  });
  const schemas = JSON.parse(JSON.stringify(document.components?.schemas));
  const paths = JSON.parse(JSON.stringify(document.paths));
  for (const action of ["configure", "enable", "disable", "remove", "rotate-secret"]) {
    const method = action === "configure" ? "put" : "post";
    const responses = paths[`/clients/:clientCode/oidc/${action}`][method].responses;
    expect(responses[409]).toBeDefined();
    expect(responses[200].content["application/json"].schema.properties.data)
      .toEqual({ $ref: "#/components/schemas/ClientOidcMutationResult" });
  }
  expect(schemas.ClientOidcMutationResult).toMatchObject({
    type: "object",
    required: ["changed", "result"],
    properties: {
      changed: { type: "boolean" },
      result: {
        type: "object",
        required: ["client"],
        properties: { client: { $ref: "#/components/schemas/ClientAdminDetailDto" }, clientSecret: { type: "string" } },
      },
    },
  });
});
