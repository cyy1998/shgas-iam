import type Redis from "ioredis";
import { providerSessionBindingLookupKey, providerSessionGenerationMembersKey, providerSessionPrincipalAnchorKey } from "../../src/session/provider-session.ts";

export function createProviderSessionStateInspection(redis: Pick<Redis, "dump" | "pexpiretime">) {
  return {
    async observe(sessionUid: string, clientCode: string, generation: string) {
      const keys = [providerSessionBindingLookupKey(sessionUid, clientCode), providerSessionPrincipalAnchorKey(sessionUid), providerSessionGenerationMembersKey(sessionUid, generation)];
      return await Promise.all(keys.map(async key => ({ payload: await redis.dump(key), expiresAt: await redis.pexpiretime(key) })));
    },
  };
}
