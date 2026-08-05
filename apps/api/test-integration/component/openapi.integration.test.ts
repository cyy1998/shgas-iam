import createApp from "@iam/api-core/core/create-app";
import { describe, expect, test } from "bun:test";
import pino from "pino";
import appConfig from "~api/app.config";

function createDocsApp() {
  return createApp(appConfig, {
    env: { NODE_ENV: "test" },
    logger: pino({ enabled: false }),
    routes: {},
    middlewares: {},
  });
}

describe("API reference in-memory HTTP integration", () => {
  test("serves the Scalar page, public schema, and local browser bundle", async () => {
    const app = createDocsApp();

    const page = await app.request("http://localhost/");
    expect(page.status).toBe(200);
    expect(page.headers.get("content-type")).toContain("text/html");
    const html = await page.text();
    expect(html).toContain("/public/doc");
    expect(html).toContain("/static/scalar/api-reference.js");

    const schema = await app.request("http://localhost/public/doc");
    expect(schema.status).toBe(200);
    expect(schema.headers.get("content-type")).toContain("application/json");
    expect(await schema.json()).toMatchObject({
      openapi: "3.1.0",
      info: { title: "通用用户API", version: "1.0.0" },
    });

    const bundle = await app.request("http://localhost/static/scalar/api-reference.js");
    expect(bundle.status).toBe(200);
    expect((await bundle.arrayBuffer()).byteLength).toBeGreaterThan(1_000);
  });
});
