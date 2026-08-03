import { describe, expect, test } from "bun:test";
import { createClientRoute } from "../client.index";

function createAdapterStub() {
  const handler = () => new Response();
  return new Proxy({}, {
    get: () => handler,
  });
}

describe("Custom SSO Admin OpenAPI contract", () => {
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
