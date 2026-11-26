import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { startFrontendServers } from "../../src/frontend/frontend-servers.ts";

test("starts the real Admin and SSO Vite servers on distinct loopback ports and closes both", async () => {
  const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
  const servers = await startFrontendServers({
    repoRoot,
    devFrontend: true,
    adminClientCode: "iam-dev-frontend-integration",
  });
  const { admin, sso } = servers.origins;
  const request = (origin: string, path: string) =>
    fetch(new URL(path, origin), { redirect: "manual", signal: AbortSignal.timeout(5_000) });

  try {
    expect(new URL(admin).hostname).toBe("127.0.0.1");
    expect(new URL(sso).hostname).toBe("127.0.0.1");
    expect(admin).not.toBe(sso);
    for (const [origin, prefix] of [
      [admin, "/iam-admin"],
      [sso, "/portal"],
    ] as const) {
      const redirect = await request(origin, prefix);
      expect(redirect.status).toBe(301);
      expect(redirect.headers.get("location")).toBe(`${prefix}/`);
      const page = await request(origin, `${prefix}/`);
      expect(page.status).toBe(200);
      expect(await page.text()).toContain("/@vite/client");
    }
    const configuration = await request(admin, "/iam-admin/src/constants/config.ts");
    expect(configuration.status).toBe(200);
    expect(await configuration.text()).toContain("iam-dev-frontend-integration");
    const terminal = await request(sso, "/portal/e2e-rp.html?code=example");
    expect(terminal.status).toBe(200);
    expect(await terminal.text()).toContain("<title>E2E relying party</title>");
  } finally {
    await servers.stop();
  }

  for (const origin of [admin, sso]) {
    const error = await request(origin, "/healthz").then(
      (response) => response.status,
      (error: unknown) => error,
    );
    expectConnectionRefused(error);
  }
}, 40_000);

test("reclaims an already-started Vite server and its child when the second app fails", async () => {
  const repoRoot = await mkdtemp(join(tmpdir(), "iam-e2e-vite-failure-"));
  const cacheRoot = join(repoRoot, "e2e", "system", ".cache", "frontend");
  const portFile = join(repoRoot, "child-port");
  try {
    const installed = fileURLToPath(new URL("../../../../apps/admin/node_modules", import.meta.url));
    for (const app of ["admin", "sso"]) {
      const directory = join(repoRoot, "apps", app);
      await mkdir(directory, { recursive: true });
      await symlink(installed, join(directory, "node_modules"));
      await writeFile(join(directory, "index.html"), "<title>Vite startup fixture</title>");
    }
    await writeFile(
      join(repoRoot, "apps", "admin", "vite.config.mjs"),
      `
      import { spawn } from "node:child_process";
      import { once } from "node:events";
      import { writeFile } from "node:fs/promises";
      const program = 'const server = require("net").createServer();' +
        'server.listen(0, "127.0.0.1", () => console.log(server.address().port));';
      export default {
        base: "/iam-admin/",
        plugins: [{
          name: "descendant",
          async configureServer() {
            const child = spawn(process.execPath, ["-e", program], {
              detached: process.platform === "linux",
            });
            const [port] = await once(child.stdout, "data");
            await writeFile(${JSON.stringify(portFile)}, String(port).trim());
          },
        }],
      };
    `,
    );
    await writeFile(
      join(repoRoot, "apps", "sso", "vite.config.mjs"),
      'throw new Error("synthetic SSO startup failure");',
    );

    let failure: unknown;
    try {
      const unexpected = await startFrontendServers({ repoRoot, devFrontend: true });
      await unexpected.stop();
    } catch (error) {
      failure = error;
    }
    expect(failure).toMatchObject({ message: expect.stringContaining("synthetic SSO startup failure") });
    const port = await readFile(portFile, "utf8");
    const error = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(2_000) }).then(
      (response) => response.status,
      (error: unknown) => error,
    );
    expectConnectionRefused(error);
    const cache = await Array.fromAsync(new Bun.Glob("dev-*").scan({ cwd: cacheRoot, onlyFiles: false }));
    expect(cache).toEqual([]);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
}, 40_000);

function expectConnectionRefused(error: unknown) {
  expect(error).toBeInstanceOf(Error);
  const code = error instanceof Error && "code" in error ? error.code : undefined;
  const message = error instanceof Error ? error.message : String(error);
  const refused = code === "ConnectionRefused" || message.includes("ECONNREFUSED");
  expect({ refused, code, message }).toMatchObject({ refused: true });
}
