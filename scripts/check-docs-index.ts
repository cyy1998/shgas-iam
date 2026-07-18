import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

type DocStatus = "Current" | "Needs Review" | "Historical" | "Stale";

type IndexedDoc = {
  path: string;
  type: string;
  status: DocStatus;
  lastVerified: string;
  nextReview: string;
  notes: string;
};

type Finding = {
  file: string;
  message: string;
};

const repoRoot = join(import.meta.dirname, "..");
const docsRoot = join(repoRoot, "docs");
const indexPath = join(docsRoot, "index.md");
const validStatuses = new Set<DocStatus>(["Current", "Needs Review", "Historical", "Stale"]);
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

const currentDate = new Date();
const todayUtc = Date.UTC(currentDate.getUTCFullYear(), currentDate.getUTCMonth(), currentDate.getUTCDate());

const staleReferencePatterns = [
  { pattern: /\bPrisma\b|schema\.prisma|src\/db\/schema\.prisma/i, label: "Prisma-era database reference" },
  { pattern: /Route Handler\s*->\s*Service\s*->\s*Repository\s*->\s*Prisma/i, label: "old layered architecture summary" },
  { pattern: /src\/routes\/auth\/auth\.service\.ts|src\/lib\/core\/create-app\.ts/i, label: "pre-composition app path" },
];

const findings: Finding[] = [];
const warnings: Finding[] = [];

const indexedDocs = parseIndex();
const docs = listMarkdownFiles(docsRoot)
  .map(file => toRepoPath(file))
  .filter(file => file !== "docs/index.md")
  .sort();

checkIndexCoverage(indexedDocs, docs);
checkIndexFreshness(indexedDocs);
checkMarkdownLinks(listMarkdownFiles(docsRoot).map(file => toRepoPath(file)));
checkStaleReferences(indexedDocs);

for (const warning of warnings) {
  console.warn(`Docs index warning: ${warning.file} ${warning.message}`);
}

if (findings.length > 0) {
  console.error("Docs index guard failed:");
  for (const finding of findings) {
    console.error(`- ${finding.file}: ${finding.message}`);
  }
  process.exit(1);
}

console.log(`Docs index guard passed: ${docs.length} docs indexed.`);

function parseIndex(): Map<string, IndexedDoc> {
  if (!existsSync(indexPath)) {
    fail("docs/index.md", "missing docs index");
    return new Map();
  }

  const rows = new Map<string, IndexedDoc>();
  const text = read("docs/index.md");

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("| ["))
      continue;

    const cells = trimmed
      .slice(1, trimmed.endsWith("|") ? -1 : undefined)
      .split("|")
      .map(cell => cell.trim());

    if (cells.length < 6) {
      fail("docs/index.md", `invalid index row: ${trimmed}`);
      continue;
    }

    const linkMatch = cells[0].match(/\[[^\]]+\]\(([^)]+)\)/);
    if (!linkMatch) {
      fail("docs/index.md", `document cell must be a markdown link: ${cells[0]}`);
      continue;
    }

    const path = normalizeDocPath(linkMatch[1]);
    const status = cells[2] as DocStatus;

    if (!validStatuses.has(status)) {
      fail("docs/index.md", `${path} has invalid status "${cells[2]}"`);
      continue;
    }

    if (rows.has(path)) {
      fail("docs/index.md", `${path} is indexed more than once`);
      continue;
    }

    rows.set(path, {
      path,
      type: cells[1],
      status,
      lastVerified: cells[3],
      nextReview: cells[4],
      notes: cells[5],
    });
  }

  if (rows.size === 0) {
    fail("docs/index.md", "no document rows found");
  }

  return rows;
}

function checkIndexCoverage(rows: Map<string, IndexedDoc>, docs: string[]): void {
  const indexedPaths = [...rows.keys()].sort();

  for (const doc of docs) {
    if (!rows.has(doc)) {
      fail("docs/index.md", `${doc} is missing from the docs index`);
    }
  }

  for (const doc of indexedPaths) {
    if (!docs.includes(doc)) {
      fail("docs/index.md", `${doc} is indexed but no file exists`);
    }
  }

  const unsorted = indexedPaths.find((path, index) => path !== [...rows.keys()][index]);
  if (unsorted) {
    fail("docs/index.md", "document rows must be sorted by normalized path");
  }
}

function checkIndexFreshness(rows: Map<string, IndexedDoc>): void {
  for (const doc of rows.values()) {
    if (!doc.type) {
      fail("docs/index.md", `${doc.path} is missing type`);
    }

    if (!isDate(doc.lastVerified)) {
      fail("docs/index.md", `${doc.path} must use YYYY-MM-DD last verified date`);
    }

    if (doc.status === "Current") {
      if (!isDate(doc.nextReview)) {
        fail("docs/index.md", `${doc.path} must use YYYY-MM-DD next review date`);
      }
      else if (dateToUtc(doc.nextReview) < todayUtc) {
        fail("docs/index.md", `${doc.path} next review date is in the past`);
      }
    }

    if (doc.status === "Needs Review") {
      warnings.push({ file: doc.path, message: "is marked Needs Review" });
    }

    if ((doc.status === "Historical" || doc.status === "Stale") && doc.nextReview !== "n/a") {
      fail("docs/index.md", `${doc.path} should use n/a next review for ${doc.status}`);
    }

    if (doc.status === "Stale" && !doc.notes.toLowerCase().includes("not current")) {
      fail("docs/index.md", `${doc.path} is Stale but notes do not explain that it is not current`);
    }
  }
}

function checkMarkdownLinks(files: string[]): void {
  for (const file of files) {
    const text = read(file);
    const linkPattern = /!?\[[^\]]*\]\(([^)]+)\)/g;

    for (const match of text.matchAll(linkPattern)) {
      const rawTarget = match[1].trim();
      const target = rawTarget.split(/\s+/)[0].split("#")[0];
      if (!target || shouldSkipLink(target))
        continue;

      const targetPath = resolve(dirname(join(repoRoot, file)), target);
      if (!existsSync(targetPath)) {
        fail(file, `broken markdown link target: ${rawTarget}`);
      }
    }
  }
}

function checkStaleReferences(rows: Map<string, IndexedDoc>): void {
  for (const doc of rows.values()) {
    const text = read(doc.path);
    const stalePattern = staleReferencePatterns.find(({ pattern }) => pattern.test(text));
    if (!stalePattern)
      continue;

    if (doc.status === "Current" || doc.status === "Needs Review") {
      fail(doc.path, `contains ${stalePattern.label}; mark as Historical/Stale or update the content`);
    }
  }
}

function listMarkdownFiles(dir: string): string[] {
  const result: string[] = [];

  for (const entry of readdirSync(dir)) {
    const absolutePath = join(dir, entry);
    const stat = statSync(absolutePath);

    if (stat.isDirectory()) {
      result.push(...listMarkdownFiles(absolutePath));
    }
    else if (entry.endsWith(".md")) {
      result.push(absolutePath);
    }
  }

  return result;
}

function normalizeDocPath(target: string): string {
  const normalized = target.replace(/\\/g, "/").split("#")[0];
  const withDocsPrefix = normalized.startsWith("docs/") ? normalized : `docs/${normalized}`;
  return withDocsPrefix.replace(/\/+/g, "/");
}

function shouldSkipLink(target: string): boolean {
  return /^(?:https?:|mailto:|#)/i.test(target);
}

function isDate(value: string): boolean {
  return datePattern.test(value) && !Number.isNaN(dateToUtc(value));
}

function dateToUtc(value: string): number {
  const [year, month, day] = value.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function toRepoPath(file: string): string {
  return relative(repoRoot, file).replace(/\\/g, "/");
}

function read(file: string): string {
  return readFileSync(join(repoRoot, file), "utf8");
}

function fail(file: string, message: string): void {
  findings.push({ file, message });
}
