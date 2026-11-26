import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { hasCode } from "./command.ts";

type ReviewCheckpoint = {
  reviewBase: string;
  reviewCandidate: string;
  reviewReport: string;
};

export type DeliveryEvidence = ReviewCheckpoint & {
  repairSummary: string;
  prBody: string;
};

function isSha(value: unknown): value is string {
  return typeof value === "string" && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value);
}

function assertSha(value: string) {
  if (!isSha(value)) throw new Error("Cache identity must be a full Git SHA.");
}

function isDelivery(value: unknown): value is DeliveryEvidence {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<DeliveryEvidence>;
  return (
    isSha(record.reviewBase) &&
    isSha(record.reviewCandidate) &&
    typeof record.reviewReport === "string" &&
    typeof record.repairSummary === "string" &&
    typeof record.prBody === "string" &&
    Boolean(record.prBody.trim())
  );
}

async function read(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (!hasCode(error, "ENOENT")) throw error;
  }
}

async function readSpecRecord(path: string) {
  const text = await read(path);
  if (text === undefined) return;
  let record: {
    version?: unknown;
    head?: unknown;
    evidence?: unknown;
    prNumber?: unknown;
    review?: Partial<ReviewCheckpoint>;
  } | null;
  try {
    record = JSON.parse(text);
  } catch {
    return;
  }
  if (record?.version === 1) return record;
}

async function replace(path: string, content: string) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, content, { flag: "wx", mode: 0o600 });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

export function createSpecState(cwd: string, number: number) {
  if (!Number.isSafeInteger(number) || number <= 0) throw new Error("Invalid Spec number.");
  const directory = join(cwd, ".sandcastle", "state");
  const path = join(directory, `spec-${number}.json`);
  function explorationPath(base: string) {
    assertSha(base);
    return join(directory, `spec-${number}-exploration-${base}.md`);
  }
  async function readDeliveryRecord(head: string) {
    assertSha(head);
    const record = await readSpecRecord(path);
    if (record?.head === head) return record;
  }
  return {
    async saveExploration(base: string, notes: string): Promise<string> {
      const path = explorationPath(base);
      if (!notes.trim()) throw new Error("Exploration notes are empty.");
      await replace(path, notes);
      return path;
    },
    async readExploration(base: string): Promise<string | undefined> {
      const path = explorationPath(base);
      if ((await read(path))?.trim()) return path;
    },
    async saveReview(review: ReviewCheckpoint): Promise<void> {
      assertSha(review.reviewBase);
      assertSha(review.reviewCandidate);
      if (!review.reviewReport.trim()) throw new Error("Review report is empty.");
      const record = await readSpecRecord(path);
      await replace(path, JSON.stringify({ ...record, version: 1, review }));
    },
    async readReview(reviewBase: string, reviewCandidate: string): Promise<string | undefined> {
      assertSha(reviewBase);
      assertSha(reviewCandidate);
      const review = (await readSpecRecord(path))?.review;
      if (
        review?.reviewBase === reviewBase &&
        review.reviewCandidate === reviewCandidate &&
        typeof review.reviewReport === "string" &&
        review.reviewReport.trim()
      ) {
        return review.reviewReport;
      }
    },
    async saveDelivery(head: string, evidence: DeliveryEvidence): Promise<void> {
      assertSha(head);
      if (!isDelivery(evidence)) throw new Error("Delivery evidence is incomplete.");
      await replace(path, JSON.stringify({ version: 1, head, evidence }));
    },
    async readDelivery(head: string): Promise<DeliveryEvidence | undefined> {
      const evidence = (await readDeliveryRecord(head))?.evidence;
      if (isDelivery(evidence)) return evidence;
    },
    async readOpenPr(head: string) {
      const number = (await readDeliveryRecord(head))?.prNumber;
      if (typeof number === "number" && Number.isSafeInteger(number) && number > 0) return number;
    },
    async saveOpenPr(head: string, prNumber: number) {
      const record = await readDeliveryRecord(head);
      await replace(path, JSON.stringify({ version: 1, head, evidence: record?.evidence, prNumber }));
    },
    async clearDelivery() {
      await rm(path, { force: true });
    },
  };
}

export async function pendingDeliveries(cwd: string): Promise<number[]> {
  const directory = join(cwd, ".sandcastle", "state");
  const entries = await readdir(directory, { withFileTypes: true }).catch((error) => {
    if (!hasCode(error, "ENOENT")) throw error;
    return [];
  });
  const pending = await Promise.all(
    entries.map(async (entry) => {
      const number = Number(/^spec-([1-9]\d*)\.json$/.exec(entry.name)?.[1]);
      if (!entry.isFile() || !Number.isSafeInteger(number)) return;
      if (isSha((await readSpecRecord(join(directory, entry.name)))?.head)) return number;
    }),
  );
  return pending.filter((number) => number !== undefined);
}
