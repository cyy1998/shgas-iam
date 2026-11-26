import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import GithubSlugger from "github-slugger";
import MarkdownIt from "markdown-it";

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

type MarkdownDocument = {
  links: Set<string>;
  anchors: Set<string>;
};

const repoRoot = join(import.meta.dirname, "..");
const docsRoot = join(repoRoot, "docs");
const indexPath = join(docsRoot, "index.md");
const rootMarkdownFiles = ["README.md", "AGENTS.md", "GLOSSARY.md"];
const workspaceRoots = ["apps", "packages"];
const historicalRoots = [".scratch/", "openspec/"];
const validStatuses = new Set<DocStatus>(["Current", "Needs Review", "Historical", "Stale"]);
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

const currentDate = new Date();
const todayUtc = Date.UTC(currentDate.getUTCFullYear(), currentDate.getUTCMonth(), currentDate.getUTCDate());

const findings: Finding[] = [];
const warnings: Finding[] = [];
const markdown = new MarkdownIt({ html: true });
const markdownCache = new Map<string, MarkdownDocument>();

const indexedDocs = parseIndex();
const allDocsFiles = listMarkdownFiles(docsRoot).map((file) => toRepoPath(file));
const docs = allDocsFiles.filter((file) => file !== "docs/index.md").sort();
const linkCheckFiles = collectLinkCheckFiles(allDocsFiles);

checkIndexCoverage(indexedDocs, docs);
checkIndexFreshness(indexedDocs);
const checkedFileCount = checkMarkdownLinks(linkCheckFiles);

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

console.log(`Docs index guard passed: ${docs.length} docs indexed, ${checkedFileCount} markdown files link-checked.`);

function parseIndex(): Map<string, IndexedDoc> {
  if (!existsSync(indexPath)) {
    fail("docs/index.md", "missing docs index");
    return new Map();
  }

  const rows = new Map<string, IndexedDoc>();
  const text = read("docs/index.md");

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("| [")) continue;

    const cells = trimmed
      .slice(1, trimmed.endsWith("|") ? -1 : undefined)
      .split("|")
      .map((cell) => cell.trim());

    if (cells.length < 6) {
      fail("docs/index.md", `invalid index row: ${trimmed}`);
      continue;
    }

    const [document = "", type = "", statusCell = "", lastVerified = "", nextReview = "", notes = ""] = cells;
    const linkTarget = markdown
      .parseInline(document, {})[0]
      ?.children?.find((token) => token.type === "link_open")
      ?.attrGet("href");
    if (typeof linkTarget !== "string" || !linkTarget) {
      fail("docs/index.md", `document cell must be a markdown link: ${cells[0]}`);
      continue;
    }

    const path = toRepoPath(resolveLinkPath("docs/index.md", linkTarget));
    const status = statusCell as DocStatus;

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
      type,
      status,
      lastVerified,
      nextReview,
      notes,
    });
  }

  if (rows.size === 0) {
    fail("docs/index.md", "no document rows found");
  }

  return rows;
}

function checkIndexCoverage(rows: Map<string, IndexedDoc>, docs: string[]): void {
  for (const doc of docs) {
    if (!rows.has(doc)) {
      fail("docs/index.md", `${doc} is missing from the docs index`);
    }
  }

  for (const doc of rows.keys()) {
    if (!docs.includes(doc)) {
      fail("docs/index.md", `${doc} is indexed but no file exists`);
    }
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
      } else if (dateToUtc(doc.nextReview) < todayUtc) {
        warnings.push({ file: doc.path, message: "next review date is in the past; review the content" });
      }
    }

    if (doc.status === "Needs Review") {
      warnings.push({ file: doc.path, message: "is marked Needs Review" });
    }

    if ((doc.status === "Historical" || doc.status === "Stale") && doc.nextReview !== "n/a") {
      fail("docs/index.md", `${doc.path} should use n/a next review for ${doc.status}`);
    }

    if (doc.status === "Stale" && !doc.notes.trim()) {
      fail("docs/index.md", `${doc.path} is Stale but has no explanation`);
    }
  }
}

function collectLinkCheckFiles(docsFiles: string[]): string[] {
  const files = new Set<string>(docsFiles);

  for (const rootFile of rootMarkdownFiles) {
    if (existsSync(join(repoRoot, rootFile))) {
      files.add(rootFile);
    }
  }

  for (const workspaceRoot of workspaceRoots) {
    const absoluteRoot = join(repoRoot, workspaceRoot);
    if (!existsSync(absoluteRoot)) continue;

    for (const dirEntry of readdirSync(absoluteRoot, { withFileTypes: true })) {
      if (!dirEntry.isDirectory()) continue;
      const readmeFile = join(absoluteRoot, dirEntry.name, "README.md");
      if (existsSync(readmeFile)) {
        files.add(toRepoPath(readmeFile));
      }
    }
  }

  return [...files].sort();
}

function checkMarkdownLinks(initialFiles: string[]): number {
  const visited = new Set<string>(initialFiles);

  for (const file of visited) {
    for (const target of getMarkdownDocument(file).links) {
      if (!target || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(target)) continue;

      const hashIndex = target.indexOf("#");
      const anchor = hashIndex === -1 ? "" : decodeLinkPart(target.slice(hashIndex + 1));
      const targetPath = resolveLinkPath(file, target);
      const targetFile = toRepoPath(targetPath);

      if (targetFile === ".." || targetFile.startsWith("../") || isAbsolute(targetFile)) {
        fail(file, `markdown link leaves the repository: ${target}`);
        continue;
      }

      if (!existsSync(targetPath)) {
        fail(file, `broken markdown link target: ${target}`);
        continue;
      }

      if (!/\.md$/i.test(targetFile) || !statSync(targetPath).isFile()) continue;

      if (!historicalRoots.some((root) => targetFile.startsWith(root))) {
        visited.add(targetFile);
      }
      if (anchor && !getMarkdownDocument(targetFile).anchors.has(anchor)) {
        fail(file, `broken markdown anchor "#${anchor}" in link target: ${target}`);
      }
    }
  }

  return visited.size;
}

function getMarkdownDocument(file: string): MarkdownDocument {
  const cached = markdownCache.get(file);
  if (cached) return cached;

  const env = {};
  const tokens = markdown.parse(read(file), env);
  const anchors = new Set<string>();
  const slugger = new GithubSlugger();

  for (const [index, token] of tokens.entries()) {
    if (token.type !== "heading_open") continue;
    const heading = (tokens[index + 1]?.children ?? [])
      .filter((child) => child.type === "text" || child.type === "code_inline")
      .map((child) => child.content)
      .join("");
    anchors.add(slugger.slug(heading.trim()));
  }

  const links = new Set<string>();
  new HTMLRewriter()
    .on("a[href], img[src]", {
      element(element) {
        const link = element.getAttribute(element.tagName === "a" ? "href" : "src");
        if (link) links.add(markdown.utils.unescapeAll(link).trim());
      },
    })
    .on("[id], a[name]", {
      element(element) {
        const id = element.getAttribute("id");
        const name = element.tagName === "a" ? element.getAttribute("name") : null;
        if (id) anchors.add(markdown.utils.unescapeAll(id));
        if (name) anchors.add(markdown.utils.unescapeAll(name));
      },
    })
    .transform(markdown.renderer.render(tokens, markdown.options, env));

  const document = { links, anchors };
  markdownCache.set(file, document);
  return document;
}

function decodeLinkPart(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function resolveLinkPath(file: string, target: string): string {
  const path = decodeLinkPart(target.split(/[?#]/, 1)[0] ?? "");
  const source = join(repoRoot, file);
  if (!path) return source;
  return path.startsWith("/") ? resolve(repoRoot, `.${path}`) : resolve(dirname(source), path);
}

function listMarkdownFiles(dir: string): string[] {
  const result: string[] = [];

  for (const dirEntry of readdirSync(dir, { withFileTypes: true })) {
    const absolutePath = join(dir, dirEntry.name);

    if (dirEntry.isDirectory()) {
      result.push(...listMarkdownFiles(absolutePath));
    } else if (dirEntry.isFile() && dirEntry.name.endsWith(".md")) {
      result.push(absolutePath);
    }
  }

  return result;
}

function isDate(value: string): boolean {
  return datePattern.test(value) && !Number.isNaN(dateToUtc(value));
}

function dateToUtc(value: string): number {
  const [year = NaN, month = NaN, day = NaN] = value.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function toRepoPath(file: string): string {
  return relative(repoRoot, file);
}

function read(file: string): string {
  return readFileSync(join(repoRoot, file), "utf8");
}

function fail(file: string, message: string): void {
  findings.push({ file, message });
}
