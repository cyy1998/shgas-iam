import { describe, expect, test } from "bun:test";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { COMMAND_FIXTURE_TEST_TIMEOUT_MS, runOwnedCommand, withCommandFixture } from "../harness/command-fixture";
import { dockerCliEnvironment } from "./docker-cli-fixture";

const repositoryRoot = join(import.meta.dirname, "..", "..", "..");
const localOverrideNames = [".env.local", ".env.development.local", ".env.test.local", ".env.production.local"];
const fixtureDirectories = [
  "",
  "apps/api/deep",
  "apps/admin-api/deep",
  "apps/worker/deep",
  "apps/admin/deep",
  "apps/sso/deep",
];
const localOverridePaths = fixtureDirectories.flatMap((directory) =>
  localOverrideNames.map((name) => (directory ? `${directory}/${name}` : name)),
);
const includedPaths = ["apps/api/deep/.env.example", "public/visible.txt"];
const artifactPaths = [
  "test-results/integration/run/compose-environment.json",
  "e2e/system/test-results/run/receipt.json",
];
const fixturePaths = new Set([...localOverridePaths, ...artifactPaths, ...includedPaths]);

async function exportedFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(root, entry.name);
      return entry.isDirectory() ? exportedFiles(path) : [path];
    }),
  );
  return files.flat();
}

describe("Docker build context environment isolation", () => {
  test(
    "excludes root and nested local overrides while retaining distributable files",
    async () => {
      await withCommandFixture("iam-docker-context-", async (root, signal) => {
        const context = join(root, "context");
        const output = join(root, "export");
        await mkdir(context);
        for (const path of [...localOverridePaths, ...artifactPaths, ...includedPaths]) {
          await mkdir(dirname(join(context, path)), { recursive: true });
          await writeFile(join(context, path), `synthetic:${path}\n`, "utf8");
        }
        const dockerIgnore = await readFile(join(repositoryRoot, ".dockerignore"), "utf8");
        await writeFile(join(context, ".dockerignore"), dockerIgnore, "utf8");
        await writeFile(join(context, "Dockerfile"), "FROM scratch\nCOPY . /\n", "utf8");
        const result = await runOwnedCommand(
          ["docker", "buildx", "build", "--output", `type=local,dest=${output}`, context],
          root,
          signal,
          20_000,
          dockerCliEnvironment(),
        );
        expect(result.exitCode, result.output).toBe(0);
        const files = await exportedFiles(output);
        const exportedFixturePaths = files
          .map((path) => relative(output, path).replaceAll("\\", "/"))
          .filter((path) => fixturePaths.has(path));
        expect(new Set(exportedFixturePaths)).toEqual(new Set(includedPaths));
      });
    },
    COMMAND_FIXTURE_TEST_TIMEOUT_MS,
  );
});
