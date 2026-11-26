import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildFrontends } from "../../src/frontend/frontend-build.ts";

test("reuses intact Vite outputs and only rebuilds the frontend affected by a transitive change", async () => {
  const repoRoot = await mkdtemp(join(tmpdir(), "iam-e2e-vite-build-"));
  try {
    await createBuildWorkspace(repoRoot);
    const initial = await buildFrontends({ repoRoot });
    const first = { admin: initial.admin.directory, sso: initial.sso.directory };
    for (const app of ["admin", "sso"] as const) {
      const cache = join(repoRoot, "e2e", "system", ".cache", "frontend", app);
      expect(initial[app].rebuilt).toBe(true);
      expect(first[app].startsWith(`${cache}`)).toBe(true);
      const fingerprint = JSON.parse(await readFile(join(cache, ".build-fingerprint.json"), "utf8"));
      expect(fingerprint.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    }

    const repeat = await buildFrontends({ repoRoot });
    expect(repeat).toEqual({
      admin: { directory: first.admin, rebuilt: false },
      sso: { directory: first.sso, rebuilt: false },
    });

    await writeFile(join(repoRoot, "packages", "leaf", "index.js"), 'export const label = "changed leaf";');
    const changed = await buildFrontends({ repoRoot });
    expect(changed.admin.rebuilt).toBe(true);
    expect(changed.admin.directory).not.toBe(first.admin);
    expect(changed.sso).toEqual({ directory: first.sso, rebuilt: false });

    await rm(join(changed.admin.directory, "index.html"));
    const repaired = await buildFrontends({ repoRoot });
    expect(repaired.admin.rebuilt).toBe(true);
    expect(await readFile(join(repaired.admin.directory, "index.html"), "utf8")).toContain("/iam-admin/assets/");
    expect(repaired.sso).toEqual({ directory: first.sso, rebuilt: false });

    for (const app of ["admin", "sso"]) {
      expect(await readFile(join(repoRoot, "apps", app, "dist", "index.html"), "utf8")).toBe(`${app} ordinary build`);
    }
    expect(await readFile(join(repoRoot, ".turbo", "cache", "unchanged"), "utf8")).toBe("ordinary Turbo cache");
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
}, 30_000);

async function createBuildWorkspace(root: string) {
  const installed = fileURLToPath(new URL("../../../../apps/admin/node_modules", import.meta.url));
  await mkdir(join(root, ".turbo", "cache"), { recursive: true });
  await writeFile(join(root, ".turbo", "cache", "unchanged"), "ordinary Turbo cache");
  await writeFile(join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
  for (const [app, base] of [
    ["admin", "/iam-admin/"],
    ["sso", "/portal/"],
  ] as const) {
    const directory = join(root, "apps", app);
    await mkdir(join(directory, "dist"), { recursive: true });
    await symlink(installed, join(directory, "node_modules"));
    await writeFile(join(directory, "dist", "index.html"), `${app} ordinary build`);
    await writeFile(
      join(directory, "package.json"),
      JSON.stringify({
        name: `@iam/${app}`,
        dependencies: app === "admin" ? { "@fixture/middle": "workspace:*" } : {},
      }),
    );
    await writeFile(join(directory, "vite.config.mjs"), `export default { base: "${base}" };`);
    await writeFile(join(directory, "index.html"), '<script type="module" src="/main.js"></script>');
    await writeFile(
      join(directory, "main.js"),
      app === "admin"
        ? 'import { label } from "../../packages/middle/index.js"; document.body.textContent = label;'
        : 'document.body.textContent = "portal";',
    );
  }
  for (const name of ["middle", "leaf"]) {
    const directory = join(root, "packages", name);
    await mkdir(directory, { recursive: true });
    await writeFile(
      join(directory, "package.json"),
      JSON.stringify({
        name: `@fixture/${name}`,
        dependencies: name === "middle" ? { "@fixture/leaf": "workspace:*" } : {},
      }),
    );
    await writeFile(
      join(directory, "index.js"),
      name === "middle" ? 'export { label } from "../leaf/index.js";' : 'export const label = "initial leaf";',
    );
  }
}
