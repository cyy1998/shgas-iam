import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, test } from "bun:test";

const sourceRoot = join(import.meta.dir, "..");
const ignoredDirectories = new Set(["__tests__"]);
const bannedSpellings = [
  ["ce", "hck"].join(""),
  ["auth", "enication"].join(""),
];

function sourceFilesFrom(directory: string): string[] {
  return readdirSync(directory).flatMap((entryName) => {
    const path = join(directory, entryName);
    const stat = statSync(path);

    if (stat.isDirectory()) {
      return ignoredDirectories.has(entryName) ? [] : sourceFilesFrom(path);
    }

    return [path];
  });
}

describe("API source spelling", () => {
  test("does not contain known misspellings in filenames or code", () => {
    const matches = sourceFilesFrom(sourceRoot).flatMap((filePath) => {
      const relativePath = relative(sourceRoot, filePath);
      const content = readFileSync(filePath, "utf8");

      return bannedSpellings.flatMap((spelling) => {
        const hits = [];
        if (relativePath.includes(spelling)) {
          hits.push(relativePath);
        }
        if (content.includes(spelling)) {
          hits.push(`${relativePath}:content`);
        }
        return hits;
      });
    });

    expect(matches).toEqual([]);
  });
});
