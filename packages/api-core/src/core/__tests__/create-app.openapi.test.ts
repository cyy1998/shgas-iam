import { expect, test } from "bun:test";
import pino from "pino";
import createApp from "../create-app";
import { defineConfig } from "../define-config";

test("the Scalar homepage loads a root tier's OpenAPI document on the same origin", async () => {
  const app = createApp(
    defineConfig({ openapi: { enabled: true }, tiers: [{ name: "integration", title: "Integration", basePath: "/" }] }),
    { env: {}, logger: pino({ enabled: false }), routes: {}, middlewares: {} },
  );

  const homepage = await app.request("/");
  const html = await homepage.text();
  expect(homepage.status).toBe(200);
  expect(html).toMatch(/"url":\s*"\/doc"/u);
  const document = await app.request("/doc");
  expect(document.status).toBe(200);
});
