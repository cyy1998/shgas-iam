import type { Redis } from "ioredis";
import type { OidcProviderEnv } from "../env.ts";
import { readGlobalSession, removeGlobalSession, renewGlobalSession } from "@iam/api-core/session";
import { ClientManagementLevel } from "@iam/contracts";
import { z } from "zod";

const GlobalSessionUserSchema = z.object({
  id: z.number().int().positive(),
  username: z.string().min(1),
}).passthrough();

const LocalSessionReferenceSchema = z.object({
  clientCode: z.string().min(1),
  localSessionId: z.string().min(1),
  mode: z.enum(ClientManagementLevel),
});

export function createGlobalSessionStore(redis: Redis, env: OidcProviderEnv) {
  return {
    async read(sessionId: string) {
      return await readGlobalSession(redis, sessionId, GlobalSessionUserSchema);
    },
    async renew(sessionId: string) {
      return await renewGlobalSession(
        redis,
        sessionId,
        env.OIDC_GLOBAL_SESSION_TTL_SECONDS,
        LocalSessionReferenceSchema,
      );
    },
    async remove(sessionId: string) {
      await removeGlobalSession(redis, sessionId);
    },
  };
}

export type GlobalSessionStore = ReturnType<typeof createGlobalSessionStore>;
