import type { RunDescriptor } from "./lifecycle.ts";
import { Buffer } from "node:buffer";
import { lstat, mkdir, readdir, rename, writeFile } from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";

const maxRelativeNameBytes = 512;
const runIdPattern = /^[a-z0-9][a-z0-9-]{7,62}$/u;

export const playwrightEvidenceLimits = Object.freeze({
  maxBytesPerFile: 16 * 1024 * 1024,
  maxFiles: 128,
  maxTotalBytes: 64 * 1024 * 1024,
});

export interface CollectPlaywrightEvidenceOptions {
  descriptor: RunDescriptor;
  signal?: AbortSignal;
}

interface PlaywrightEvidenceMetadata {
  name: string;
  size: number;
  type: "screenshot" | "trace" | "video";
}

export function playwrightStagingDirectory(descriptor: RunDescriptor) {
  if (!runIdPattern.test(descriptor.runId))
    throw new Error("invalid run id for Playwright staging");
  const stagingRoot = resolve(
    dirname(descriptor.artifactDirectory),
    ".playwright-staging",
  );
  const staging = resolve(stagingRoot, descriptor.runId);
  if (!isInside(stagingRoot, staging))
    throw new Error("Playwright staging escaped its run root");
  return staging;
}

export async function collectPlaywrightEvidence(
  options: CollectPlaywrightEvidenceOptions,
) {
  const staging = playwrightStagingDirectory(options.descriptor);
  const evidenceRoot = join(options.descriptor.artifactDirectory, "playwright");
  const metadataPath = join(
    options.descriptor.artifactDirectory,
    "playwright-evidence.json",
  );
  const candidates = await listCandidates(staging, options.signal);
  const artifacts: PlaywrightEvidenceMetadata[] = [];
  for (const candidate of candidates) {
    options.signal?.throwIfAborted();
    const destination = resolve(evidenceRoot, candidate.relativeName);
    if (!isInside(evidenceRoot, destination))
      throw new Error("Playwright evidence destination escaped its run artifact");
    await mkdir(dirname(destination), { recursive: true });
    await rename(candidate.path, destination);
    const movedStats = await lstat(destination);
    if (
      !movedStats.isFile()
      || movedStats.isSymbolicLink()
      || movedStats.size !== candidate.size
      || movedStats.size > playwrightEvidenceLimits.maxBytesPerFile
    ) {
      throw new Error("Playwright evidence changed while being moved");
    }
    artifacts.push({
      name: `playwright/${candidate.relativeName}`,
      size: movedStats.size,
      type: candidate.type,
    });
  }
  await mkdir(options.descriptor.artifactDirectory, { recursive: true });
  await writeFile(metadataPath, `${JSON.stringify({
    version: 1,
    runId: options.descriptor.runId,
    artifacts,
  }, null, 2)}\n`, "utf8");
  return { metadataPath };
}

interface EvidenceCandidate {
  path: string;
  relativeName: string;
  size: number;
  type: PlaywrightEvidenceMetadata["type"];
}

async function listCandidates(staging: string, signal?: AbortSignal) {
  const candidates: EvidenceCandidate[] = [];
  let fileCount = 0;
  let totalBytes = 0;
  const visit = async (directory: string): Promise<void> => {
    signal?.throwIfAborted();
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    }
    catch (error) {
      if (directory === staging && isFileSystemError(error, "ENOENT"))
        return;
      throw error;
    }
    for (const entry of entries) {
      signal?.throwIfAborted();
      const path = join(directory, entry.name);
      const stats = await lstat(path);
      signal?.throwIfAborted();
      if (stats.isSymbolicLink())
        throw new Error("symbolic links are forbidden in Playwright staging");
      if (stats.isDirectory()) {
        await visit(path);
        continue;
      }
      if (!stats.isFile())
        throw new Error("unsupported entry in Playwright staging");
      fileCount++;
      if (fileCount > playwrightEvidenceLimits.maxFiles)
        throw new Error("too many files in Playwright staging");
      if (stats.size > playwrightEvidenceLimits.maxBytesPerFile)
        throw new Error("Playwright evidence file exceeded its byte limit");
      totalBytes += stats.size;
      if (totalBytes > playwrightEvidenceLimits.maxTotalBytes)
        throw new Error("Playwright evidence exceeded its total byte limit");
      const type = evidenceType(path);
      if (type === undefined)
        continue;
      candidates.push({
        path,
        relativeName: safeRelativeName(staging, path),
        size: stats.size,
        type,
      });
    }
  };
  await visit(staging);
  return candidates.sort((left, right) =>
    left.relativeName.localeCompare(right.relativeName));
}

function safeRelativeName(staging: string, path: string) {
  const relativeName = relative(staging, resolve(path)).split(sep).join("/");
  if (
    relativeName === ""
    || relativeName.startsWith("../")
    || isAbsolute(relativeName)
    || Buffer.byteLength(relativeName, "utf8") > maxRelativeNameBytes
    || !isInside(staging, resolve(path))
  ) {
    throw new Error("unsafe Playwright evidence path");
  }
  return relativeName;
}

function evidenceType(path: string): PlaywrightEvidenceMetadata["type"] | undefined {
  const name = basename(path).toLowerCase();
  if (name === "trace.zip")
    return "trace";
  if (name.endsWith(".png"))
    return "screenshot";
  if (name.endsWith(".webm"))
    return "video";
  return undefined;
}

function isInside(root: string, target: string) {
  const nested = relative(resolve(root), resolve(target));
  return nested !== ""
    && !nested.startsWith(`..${sep}`)
    && nested !== ".."
    && !isAbsolute(nested);
}

function isFileSystemError(error: unknown, code: string) {
  return error instanceof Error
    && "code" in error
    && error.code === code;
}
