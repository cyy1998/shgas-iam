import type { ResolvedGlobalSession } from "../interaction/global-session.ts";
import { z } from "zod";

export const ProviderSessionBindingSchema = z.object({
  globalSessionId: z.string().min(1),
  principalSessionId: z.string().min(1),
  bindingId: z.string().min(1),
  userId: z.number().int().positive(),
  accountId: z.string().uuid(),
  authTime: z.number().int().nonnegative(),
  oidcConfigVersion: z.number().int().nonnegative(),
  expiresAt: z.number().int().positive(),
});

export type ProviderSessionBinding = z.infer<typeof ProviderSessionBindingSchema>;

export type ProviderSessionBindingInput = ResolvedGlobalSession;

export const PENDING_PROVIDER_SESSION_BINDING_TTL_SECONDS = 60;

export function providerSessionBindingKey(sessionUid: string) {
  return `oidc:provider-session-binding:${sessionUid}`;
}

export function providerSessionBindingLookupKey(sessionUid: string) {
  return `oidc:provider-session-binding-lookup:${sessionUid}`;
}

export function pendingProviderSessionBindingKey(accountId: string) {
  return `oidc:pending-provider-session-binding:${accountId}`;
}
