import { describe, expect, test } from "bun:test";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { COMMAND_FIXTURE_TEST_TIMEOUT_MS, runOwnedCommand, withCommandFixture } from "../harness/command-fixture";

const repoRoot = join(import.meta.dirname, "..", "..", "..");
const currentRow = "| [Guide](guide.md) | guide | Current | 2026-01-01 | 9999-12-31 | |\n";
const staleRow = "| [Guide](guide.md) | guide | Stale | 2026-01-01 | n/a | 旧版流程，已不适用于当前实现。 |\n";

async function initializeDocsFixture(root: string, index: string, files: Record<string, string>) {
  await mkdir(join(root, "scripts"), { recursive: true });
  await copyFile(join(repoRoot, "scripts", "check-docs-index.ts"), join(root, "scripts", "check-docs-index.ts"));
  for (const [path, content] of Object.entries({ ...files, "index.md": index })) {
    const target = join(root, "docs", path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content, "utf8");
  }
}

describe("docs index guard process", () => {
  const validFixtures: {
    name: string;
    index: string;
    files: Record<string, string>;
    count: number;
  }[] = [
    {
      name: "reading-order indexes",
      index: currentRow.replaceAll("guide.md", "z-guide.md") + currentRow.replaceAll("guide.md", "a-guide.md"),
      files: { "z-guide.md": "# Guide\n", "a-guide.md": "# Another guide\n" },
      count: 2,
    },
    {
      name: "Chinese stale explanations",
      index: staleRow,
      files: { "guide.md": "# 旧版流程\n" },
      count: 1,
    },
    {
      name: "historical technology discussions in current documents",
      index: currentRow,
      files: { "guide.md": "# Guide\n\n历史上曾使用 Prisma 和 src/lib/core/create-app.ts，当前实现已调整。\n" },
      count: 1,
    },
  ];

  test.each(validFixtures)(
    "accepts $name",
    async ({ index, files, count }) => {
      await withCommandFixture("iam-docs-index-", async (root, signal) => {
        await initializeDocsFixture(root, index, files);

        const result = await runOwnedCommand([process.execPath, "scripts/check-docs-index.ts"], root, signal);
        expect(result.exitCode, result.output).toBe(0);
        expect(result.output).toContain(`Docs index guard passed: ${count} docs indexed.`);
        expect(result.output).not.toContain("Docs index warning:");
      });
    },
    COMMAND_FIXTURE_TEST_TIMEOUT_MS,
  );

  test(
    "warns about overdue reviews without failing the check",
    async () => {
      await withCommandFixture("iam-docs-index-", async (root, signal) => {
        await initializeDocsFixture(root, currentRow.replace("9999-12-31", "2000-01-01"), {
          "guide.md": "# Guide\n",
        });

        const result = await runOwnedCommand([process.execPath, "scripts/check-docs-index.ts"], root, signal);
        expect(result.exitCode, result.output).toBe(0);
        expect(result.output).toContain("Docs index warning: docs/guide.md next review date is in the past");
        expect(result.output).toContain("Docs index guard passed:");
      });
    },
    COMMAND_FIXTURE_TEST_TIMEOUT_MS,
  );

  const invalidFixtures: {
    name: string;
    index: string;
    files: Record<string, string>;
    diagnostic: string;
  }[] = [
    {
      name: "a stale document without an explanation",
      index: staleRow.replace("旧版流程，已不适用于当前实现。", "   "),
      files: { "guide.md": "# Guide\n" },
      diagnostic: "docs/guide.md is Stale but has no explanation",
    },
    {
      name: "an unindexed document",
      index: currentRow,
      files: { "guide.md": "# Guide\n", "extra.md": "# Extra\n" },
      diagnostic: "docs/extra.md is missing from the docs index",
    },
    {
      name: "an indexed document that does not exist",
      index: currentRow + currentRow.replaceAll("guide.md", "missing.md"),
      files: { "guide.md": "# Guide\n" },
      diagnostic: "docs/missing.md is indexed but no file exists",
    },
    {
      name: "a duplicate index entry",
      index: currentRow + currentRow,
      files: { "guide.md": "# Guide\n" },
      diagnostic: "docs/guide.md is indexed more than once",
    },
    {
      name: "an invalid status",
      index: currentRow.replace("Current", "Unknown"),
      files: { "guide.md": "# Guide\n" },
      diagnostic: 'docs/guide.md has invalid status "Unknown"',
    },
    {
      name: "a missing document type",
      index: currentRow.replace("| guide |", "| |"),
      files: { "guide.md": "# Guide\n" },
      diagnostic: "docs/guide.md is missing type",
    },
    {
      name: "an invalid last verified date",
      index: currentRow.replace("2026-01-01", "not-a-date"),
      files: { "guide.md": "# Guide\n" },
      diagnostic: "docs/guide.md must use YYYY-MM-DD last verified date",
    },
    {
      name: "an invalid current review date",
      index: currentRow.replace("9999-12-31", "not-a-date"),
      files: { "guide.md": "# Guide\n" },
      diagnostic: "docs/guide.md must use YYYY-MM-DD next review date",
    },
    {
      name: "a historical document with a review date",
      index: currentRow.replace("Current", "Historical"),
      files: { "guide.md": "# Guide\n" },
      diagnostic: "docs/guide.md should use n/a next review for Historical",
    },
    {
      name: "a broken local link",
      index: currentRow,
      files: { "guide.md": "# Guide\n\n[Missing](missing.md)\n" },
      diagnostic: "broken markdown link target: missing.md",
    },
  ];

  test.each(invalidFixtures)(
    "rejects $name",
    async ({ index, files, diagnostic }) => {
      await withCommandFixture("iam-docs-index-", async (root, signal) => {
        await initializeDocsFixture(root, index, files);

        const result = await runOwnedCommand([process.execPath, "scripts/check-docs-index.ts"], root, signal);
        expect(result.exitCode, result.output).toBe(1);
        expect(result.output).toContain(diagnostic);
      });
    },
    COMMAND_FIXTURE_TEST_TIMEOUT_MS,
  );
});
