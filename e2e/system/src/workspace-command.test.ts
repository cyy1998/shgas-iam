import { readFile } from "node:fs/promises";
import { describe, expect, test } from "bun:test";

async function readPackageJson(url: URL) {
  return JSON.parse(await readFile(url, "utf8")) as {
    scripts: Record<string, string>;
  };
}

describe("workspace-local command", () => {
  test("publishes the complete E2E owner through root and Turbo", async () => {
    const workspacePackage = await readPackageJson(
      new URL("../package.json", import.meta.url),
    );
    const rootPackage = await readPackageJson(
      new URL("../../../package.json", import.meta.url),
    );

    expect(workspacePackage.scripts["runtime:lifecycle"]).toBe("bun src/cli.ts run");
    expect(workspacePackage.scripts["runtime:cleanup"]).toBe("bun src/cli.ts cleanup");
    expect(workspacePackage.scripts["admin:journey"]).toBe("bun src/cli.ts admin");
    expect(workspacePackage.scripts["oidc:journey"]).toBe("bun src/cli.ts oidc");
    expect(workspacePackage.scripts["test:e2e"]).toBe("bun src/cli.ts e2e");
    expect(workspacePackage.scripts["infra:lifecycle"]).toBeUndefined();
    expect(workspacePackage.scripts["infra:migrate"]).toBeUndefined();
    expect(rootPackage.scripts["test:e2e"]).toBe("turbo test:e2e --concurrency=1");
  });

  test("Current owner docs publish the complete root command without CI claims", async () => {
    const docs = await Promise.all([
      "../../../docs/architecture/testing-architecture.md",
      "../../../docs/architecture/repository-map.md",
      "../../../docs/development/commands.md",
      "../../../docs/adr/0009-adopt-canonical-test-collections.md",
    ].map(path => readFile(new URL(path, import.meta.url), "utf8")));
    const currentOwnerDocs = docs.join("\n");

    expect(currentOwnerDocs).toContain("pnpm test:e2e");
    expect(currentOwnerDocs).toContain("Admin → OIDC");
    expect(currentOwnerDocs).toContain("Windows 本地");
    expect(currentOwnerDocs).not.toContain("root `test:e2e` 仍未发布");
    expect(currentOwnerDocs).not.toContain("Root `test:e2e` 尚未发布");
    expect(currentOwnerDocs).not.toContain("当前没有 root `test:e2e`");
    expect(currentOwnerDocs).not.toContain("不发布 root `test:e2e`");
  });
});
