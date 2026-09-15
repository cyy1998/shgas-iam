import { z } from "zod";
import { SessionStorageError } from "./model";
import { SESSION_SCRIPT } from "./scripts";

export interface UnifiedSessionRedis {
  eval: (script: string, keyCount: number, ...args: Array<string | number>) => Promise<unknown>;
}

const replySchema = z.object({
  status: z.string(),
  observedAt: z.number().int().nonnegative(),
  value: z.unknown().optional(),
});

export function createUnifiedSessionStorage(redis: UnifiedSessionRedis, namespace: string) {
  const prefix = `${namespace}:unified:v1:`;
  async function execute(request: object) {
    let raw: unknown;
    try {
      raw = await redis.eval(SESSION_SCRIPT, 0, prefix, JSON.stringify(request));
    }
    catch (cause) {
      // A transport rejection does not prove whether Redis executed a mutation.
      throw new SessionStorageError("unknown", { cause });
    }
    try {
      if (typeof raw !== "string")
        throw new Error("Invalid Redis session reply");
      return replySchema.parse(JSON.parse(raw));
    }
    catch (cause) {
      throw new SessionStorageError("unknown", { cause });
    }
  }
  return { execute };
}
