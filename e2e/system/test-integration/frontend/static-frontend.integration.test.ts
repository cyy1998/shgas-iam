import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startStaticFrontendServer } from "../../src/frontend/static-frontend.ts";

test("serves both production subpaths and the E2E relying-party callback on loopback", async () => {
  const root = await mkdtemp(join(tmpdir(), "iam-e2e-static-"));
  try {
    const admin = join(root, "admin");
    const sso = join(root, "sso");
    const rpTerminalPath = join(root, "e2e-rp.html");
    await mkdir(join(admin, "assets"), { recursive: true });
    await mkdir(join(sso, "assets"), { recursive: true });
    await Promise.all([
      writeFile(join(admin, "index.html"), "<title>Admin</title>"),
      writeFile(join(admin, "assets", "admin.12345678.js"), "export {};"),
      writeFile(join(sso, "index.html"), "<title>SSO</title>"),
      writeFile(join(sso, "assets", "portal.css"), "body {}"),
      writeFile(rpTerminalPath, "<title>E2E relying party</title>"),
    ]);

    const server = startStaticFrontendServer({ admin, sso, rpTerminalPath });
    try {
      expect(new URL(server.origin).hostname).toBe("127.0.0.1");
      const request = (path: string, method = "GET") =>
        fetch(new URL(path, server.origin), { method, redirect: "manual", signal: AbortSignal.timeout(2_000) });
      for (const prefix of ["/iam-admin", "/portal"]) {
        const response = await request(prefix);
        expect(response.status).toBe(301);
        expect(response.headers.get("location")).toBe(`${prefix}/`);
      }
      for (const [path, title] of [
        ["/iam-admin/", "Admin"],
        ["/iam-admin/users/active", "Admin"],
        ["/portal/", "SSO"],
        ["/portal/account/security", "SSO"],
        ["/portal/e2e-rp.html?code=example", "E2E relying party"],
      ] as const) {
        const response = await request(path);
        const body = await response.text();
        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toContain("text/html");
        expect(response.headers.get("cache-control")).toContain("no-store");
        expect(body).toBe(`<title>${title}</title>`);
      }

      const script = await request("/iam-admin/assets/admin.12345678.js");
      expect(script.status).toBe(200);
      expect(script.headers.get("content-type")).toContain("javascript");
      expect(script.headers.get("cache-control")).toContain("immutable");
      expect(await script.text()).toBe("export {};");
      const css = await request("/portal/assets/portal.css", "HEAD");
      expect(css.status).toBe(200);
      expect(css.headers.get("content-type")).toContain("text/css");
      expect(await css.text()).toBe("");

      for (const path of ["/", "/portal-other", "/portal/assets/missing", "/iam-admin/missing.js"]) {
        const response = await request(path);
        expect(response.status).toBe(404);
      }
      const health = await request("/healthz");
      expect(health.status).toBe(200);
      expect(await health.text()).toBe("ok\n");
    } finally {
      await server.stop();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
