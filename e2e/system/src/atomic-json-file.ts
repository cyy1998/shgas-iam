import { randomUUID } from "node:crypto";
import { rename, rm, writeFile } from "node:fs/promises";

export async function writeAtomicJsonFile(path: string, value: unknown, mode?: number) {
  await writeAtomicTextFile(path, `${JSON.stringify(value, null, 2)}\n`, mode);
}

export async function writeAtomicTextFile(path: string, text: string, mode?: number) {
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, text, { encoding: "utf8", flag: "wx", mode });
    await rename(temporaryPath, path);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}
