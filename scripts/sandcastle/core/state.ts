import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { hasCode } from "./command.ts";

export type DeliveryEvidence = {
  reviewBase: string;
  reviewCandidate: string;
  reviewReport: string;
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
  const delivery = join(directory, `spec-${number}.json`);
  function explorationPath(base: string) {
    assertSha(base);
    return join(directory, `spec-${number}-exploration-${base}.md`);
  }
  async function readDeliveryRecord(head: string) {
    assertSha(head);
    const text = await read(delivery);
    if (text === undefined) return;
    let record: { version?: unknown; head?: unknown; evidence?: unknown; prNumber?: unknown } | null;
    try {
      record = JSON.parse(text);
    } catch {
      return;
    }
    if (record?.version === 1 && record.head === head) return record;
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
    async saveDelivery(head: string, evidence: DeliveryEvidence): Promise<void> {
      assertSha(head);
      if (!isDelivery(evidence)) throw new Error("Delivery evidence is incomplete.");
      await replace(delivery, JSON.stringify({ version: 1, head, evidence }));
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
      await replace(delivery, JSON.stringify({ version: 1, head, evidence: record?.evidence, prNumber }));
    },
    async clearDelivery() {
      await rm(delivery, { force: true });
    },
  };
}

export async function pendingDeliveries(cwd: string): Promise<number[]> {
  const entries = await readdir(join(cwd, ".sandcastle", "state"), { withFileTypes: true }).catch((error) => {
    if (!hasCode(error, "ENOENT")) throw error;
    return [];
  });
  return entries.flatMap((entry) => {
    const number = Number(/^spec-([1-9]\d*)\.json$/.exec(entry.name)?.[1]);
    return entry.isFile() && Number.isSafeInteger(number) ? [number] : [];
  });
}
