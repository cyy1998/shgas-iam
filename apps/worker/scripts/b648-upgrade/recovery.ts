import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { ClientSsoUpgradeManifestSchema } from "./upgrade-plan";

export const digestSchema = z.string().regex(/^[a-f0-9]{64}$/u);
export const redisEntrySchema = z.object({ digest: digestSchema, expiresAt: z.number().int() }).strict();
export const baselineSchema = z.object({
  postgres: digestSchema,
  redis: z.record(digestSchema, redisEntrySchema),
}).strict();
const completionSchema = z.object({ receiptDigest: digestSchema, preservation: z.object({ retained: z.number().int().nonnegative(), naturallyExpired: z.number().int().nonnegative() }).strict() }).strict();
export const recoverySchema = z.object({
  version: z.literal(1),
  source: z.literal("b6481f2de5c2930fc381d99e70520e0783091e9d"),
  target: z.literal("acc2bd7c558ce9b029bcb04d446a31ee6dbeca25"),
  resource: digestSchema,
  manifest: ClientSsoUpgradeManifestSchema,
  baseline: baselineSchema,
  completion: completionSchema.optional(),
}).strict();
export type Recovery = z.infer<typeof recoverySchema>;
export function digest(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}
export async function readJson(path: string) {
  if ((await stat(path)).size > 64 * 1024 * 1024)
    throw new Error("Recovery file exceeds bound");
  return JSON.parse(await readFile(path, "utf8"));
}
export async function readOptionalJson(path: string): Promise<unknown | undefined> {
  try {
    return await readJson(path);
  }
  catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return undefined;
    throw error;
  }
}

/** Immutable, exclusive recovery facts. Never replace an existing or incomplete receipt. */
export async function writeEvidence(path: string, value: unknown) {
  const serialized = JSON.stringify(value);
  const existing = await readOptionalJson(path);
  if (existing !== undefined) {
    if (JSON.stringify(existing) !== serialized)
      throw new Error("Recovery evidence conflict");
    return;
  }
  const file = await open(path, "wx", 0o600);
  try {
    await file.writeFile(serialized, "utf8");
    await file.sync();
  }
  finally { await file.close(); }
}

export async function prepareRecoveryDirectory(directory: string) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  // A unique probe also proves write access before any migration mutation.
  const path = join(directory, `.probe-${randomUUID()}`);
  const file = await open(path, "wx", 0o600);
  await file.close();
  await unlink(path);
}

/** Publish the terminal status in the mandatory state file before reporting success. */
export async function completeRecovery(path: string, previous: Recovery, completion: z.infer<typeof completionSchema>) {
  if (JSON.stringify(await readJson(path)) !== JSON.stringify(previous))
    throw new Error("Recovery state changed");
  const next = recoverySchema.parse({ ...previous, completion });
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeEvidence(temporary, next);
  await rename(temporary, path);
}
