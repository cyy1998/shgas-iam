import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type BindMountSandboxProvider,
  type BindMountSandboxProviderConfig,
  createBindMountSandboxProvider,
} from "@ai-hero/sandcastle";
import { command, hasCode } from "./command.ts";
import { type Phase, phases, type ReviewReport } from "./types.ts";

const shaPattern = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/;
const forbiddenEnvKeys = new Set(["GH_TOKEN", "GITHUB_TOKEN"]);
const validPhases = new Set<string>(phases);
const builtinPromptsDir = join(dirname(fileURLToPath(import.meta.url)), "prompts");

type ReviewCacheFile = {
  version: 1;
  entries: Record<string, ReviewReport>;
};

export function readonlySandbox(base: BindMountSandboxProvider): BindMountSandboxProvider {
  const create =
    "create" in base && typeof base.create === "function"
      ? (base.create.bind(base) as BindMountSandboxProviderConfig["create"])
      : undefined;
  if (!create) throw new Error(`Sandbox provider "${base.name}" is not a bind-mount provider.`);
  return createBindMountSandboxProvider({
    name: base.name,
    env: base.env,
    sandboxHomedir: base.sandboxHomedir,
    create: (options) =>
      create({
        ...options,
        mounts: options.mounts.map((mount) => ({ ...mount, readonly: true })),
      }),
  });
}

function parseEnvKey(line: string): string | undefined {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return undefined;
  const normalized = trimmed.replace(/^export\s+/, "");
  const eqIndex = normalized.indexOf("=");
  if (eqIndex === -1) return undefined;
  return normalized.slice(0, eqIndex).trim();
}

function assertCleanRemoteUrls(remoteUrls: readonly string[]): void {
  for (const remoteUrl of remoteUrls) {
    const url = /^[\w+.-]+:\/\//.test(remoteUrl) ? URL.parse(remoteUrl) : null;
    if (!url) continue;
    const isHttp = url.protocol === "http:" || url.protocol === "https:";
    if (url.password || (isHttp && url.username)) {
      throw new Error("Git remote URL in .git/config must not embed credentials because sandboxes can read it.");
    }
  }
}

export async function preflightCredentials(cwd: string, _remote?: string): Promise<void> {
  const envPath = join(cwd, ".sandcastle", ".env");
  const envContent = await readFile(envPath, "utf8").catch((error) => {
    if (hasCode(error, "ENOENT")) return undefined;
    throw error;
  });
  if (envContent !== undefined) {
    for (const line of envContent.split(/\r?\n/)) {
      const key = parseEnvKey(line);
      if (key && forbiddenEnvKeys.has(key)) {
        throw new Error(
          `Forbidden credential key "${key}" found in .sandcastle/.env. Remove it (even if empty) so the SDK does not inject GitHub tokens into sandboxes.`,
        );
      }
    }
  }

  const configuredUrls = await command("git", ["config", "--get-regexp", "^remote\\..*\\.(url|pushurl)$"], cwd).catch(
    (error) => {
      if (hasCode(error, 1)) return "";
      throw error;
    },
  );
  const urls = configuredUrls
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const space = line.indexOf(" ");
      return space === -1 ? "" : line.slice(space + 1).trim();
    })
    .filter(Boolean);
  assertCleanRemoteUrls(urls);
}

function assertSha(value: string): string {
  if (!shaPattern.test(value)) throw new Error(`Review cache key must be a full Git SHA, got: ${value}`);
  return value;
}

function reviewCachePath(cwd: string): string {
  return join(cwd, ".sandcastle", "state", "review-cache.json");
}

function isValidReport(value: unknown, expectedSha: string): value is ReviewReport {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ReviewReport>;
  return (
    candidate.candidateSha === expectedSha &&
    typeof candidate.standards === "string" &&
    candidate.standards.trim().length > 0 &&
    typeof candidate.spec === "string" &&
    candidate.spec.trim().length > 0
  );
}

async function readCacheFile(path: string): Promise<ReviewCacheFile> {
  const text = await readFile(path, "utf8").catch((error) => {
    if (hasCode(error, "ENOENT")) return undefined;
    throw error;
  });
  if (text === undefined) return { version: 1, entries: {} };
  try {
    const parsed = JSON.parse(text) as Partial<ReviewCacheFile>;
    if (
      parsed?.version === 1 &&
      parsed.entries &&
      typeof parsed.entries === "object" &&
      !Array.isArray(parsed.entries)
    ) {
      return { version: 1, entries: parsed.entries };
    }
  } catch {
    // Ignore corrupt cache files and treat as cache miss.
  }
  return { version: 1, entries: {} };
}

export async function readReviewCache(cwd: string, candidateSha: string): Promise<ReviewReport | undefined> {
  const sha = assertSha(candidateSha);
  const cache = await readCacheFile(reviewCachePath(cwd));
  const entry = cache.entries[sha];
  return isValidReport(entry, sha) ? entry : undefined;
}

export async function writeReviewCache(cwd: string, report: ReviewReport): Promise<void> {
  const sha = assertSha(report.candidateSha);
  if (!report.standards.trim() || !report.spec.trim()) {
    throw new Error("Review report must include nonempty standards and spec axes.");
  }
  const path = reviewCachePath(cwd);
  const cache = await readCacheFile(path);
  const next: ReviewCacheFile = {
    version: 1,
    entries: {
      ...cache.entries,
      [sha]: {
        candidateSha: sha,
        standards: report.standards,
        spec: report.spec,
        createdAt: report.createdAt ?? new Date().toISOString(),
      },
    },
  };
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const tempPath = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(tempPath, `${JSON.stringify(next, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    await rename(tempPath, path);
  } finally {
    await rm(tempPath, { force: true });
  }
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch (error) {
    if (hasCode(error, "ENOENT") || hasCode(error, "ENOTDIR")) return false;
    throw error;
  }
}

export async function resolvePromptFile(phase: Phase, promptsDir?: string): Promise<string> {
  if (!validPhases.has(phase)) throw new Error(`Unknown Sandcastle phase: ${String(phase)}`);
  if (promptsDir) {
    const overridePath = resolve(promptsDir, `${phase}.md`);
    if (await isFile(overridePath)) return overridePath;
  }
  const builtinPath = join(builtinPromptsDir, `${phase}.md`);
  if (await isFile(builtinPath)) return builtinPath;
  throw new Error(`Missing built-in prompt template for phase "${phase}": ${builtinPath}`);
}
