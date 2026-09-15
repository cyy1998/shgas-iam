import { readFile } from "node:fs/promises";
import { describe, expect, test } from "bun:test";

async function readPackageJson(url: URL) {
  return JSON.parse(await readFile(url, "utf8")) as {
    scripts: Record<string, string>;
  };
}

describe("workspace-local command", () => {
  test("publishes workspace-local journey and recovery commands", async () => {
    const workspacePackage = await readPackageJson(
      new URL("../package.json", import.meta.url),
    );

    expect(workspacePackage.scripts["runtime:lifecycle"]).toBe("bun src/cli.ts run");
    expect(workspacePackage.scripts["runtime:cleanup"]).toBe("bun src/cli.ts cleanup");
    expect(workspacePackage.scripts["admin:journey"]).toBe("bun src/cli.ts admin");
    expect(workspacePackage.scripts["hr-admin:journey"])
      .toBe("bun src/cli.ts hr-admin");
    expect(workspacePackage.scripts["oidc:journey"]).toBe("bun src/cli.ts oidc");
  });
});
