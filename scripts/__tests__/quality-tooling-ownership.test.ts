import { describe, expect, test } from "bun:test";
import { discoverQualityWorkspaces, readPackageManifest, relativeQualityRunner } from "../tooling/quality-workspaces";

const qualityDependencies = ["@biomejs/biome", "prettier", "stylelint", "stylelint-config-standard", "postcss-less"];
const legacyLintDependency = /^(?:@antfu\/eslint-config|@eslint(?:-|\/)|@iam\/eslint-config|eslint$|eslint-)/u;

describe("quality tooling ownership", () => {
  test("keeps formatter and linter dependencies at the repository root", async () => {
    const rootManifest = await readPackageManifest("package.json");
    const rootDependencies = {
      ...rootManifest.dependencies,
      ...rootManifest.devDependencies,
    };
    for (const dependency of qualityDependencies) expect(rootDependencies[dependency], dependency).toBeString();
    expect(Object.keys(rootDependencies).filter((dependency) => legacyLintDependency.test(dependency))).toEqual([]);

    const workspaces = await discoverQualityWorkspaces();
    expect(workspaces.length).toBeGreaterThan(0);
    for (const workspace of workspaces) {
      const manifest = await readPackageManifest(workspace.manifest);
      const dependencies = {
        ...manifest.dependencies,
        ...manifest.devDependencies,
      };
      expect(
        qualityDependencies.filter((dependency) => dependency in dependencies),
        workspace.name,
      ).toEqual([]);
      expect(
        Object.keys(dependencies).filter((dependency) => legacyLintDependency.test(dependency)),
        workspace.name,
      ).toEqual([]);
    }
  });

  test("publishes the four shared commands from every workspace", async () => {
    const workspaces = await discoverQualityWorkspaces();
    const commands = {
      format: "format",
      "format:check": "format-check",
      lint: "lint",
      "lint:fix": "lint-fix",
    } as const;

    for (const workspace of workspaces) {
      const manifest = await readPackageManifest(workspace.manifest);
      const runner = relativeQualityRunner(workspace.workspace);
      for (const [script, action] of Object.entries(commands)) {
        expect(manifest.scripts?.[script], `${workspace.name}#${script}`).toBe(
          `node ${runner} ${action} --workspace ${workspace.workspace}`,
        );
      }
    }
  });
});
