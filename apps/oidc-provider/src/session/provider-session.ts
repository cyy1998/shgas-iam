import type { ResolvedGlobalSession } from "../interaction/global-session.ts";
import { z } from "zod";

export const ProviderSessionBindingSchema = z.object({
  principalSessionId: z.string().min(1),
  bindingId: z.string().min(1),
  clientCode: z.string().min(1),
  accountId: z.string().uuid(),
  authTime: z.number().int().nonnegative(),
  oidcConfigVersion: z.number().int().nonnegative(),
  expiresAt: z.number().int().positive(),
  anchorGeneration: z.string().min(1).optional(),
  mappingOwnerId: z.string().min(1).optional(),
});

export type ProviderSessionBinding = z.infer<typeof ProviderSessionBindingSchema>;

export interface ProviderSessionBindingLookup {
  bindingId: string;
  mappingOwnerId?: string;
}

export type ProviderSessionPublicationResult
  = | { status: "committed"; recovered: boolean }
    | { status: "conflict"; recovered: boolean }
    | { status: "unknown"; error: unknown };

export interface ProviderSessionLifecycleFence {
  generation: string;
  principalSessionId: string;
}

export type ProviderSessionBindingInput = ResolvedGlobalSession;

export const ProviderSessionPrincipalAnchorSchema = z.object({
  accountId: z.string().uuid(),
  principalSessionId: z.string().min(1),
  generation: z.string().min(1),
});

export type ProviderSessionPrincipalAnchor = z.infer<typeof ProviderSessionPrincipalAnchorSchema>;

export const StagedProviderSessionBindingSchema = z.object({
  accountId: z.string().uuid(),
  authorizationAttemptId: z.string().min(1),
  authTime: z.number().int().nonnegative(),
  clientCode: z.string().min(1),
  expectedAnchorGeneration: z.string().min(1).nullable(),
  expiresAt: z.number().int().positive(),
  oidcConfigVersion: z.number().int().nonnegative(),
  principalSessionId: z.string().min(1),
  providerSessionUid: z.string().min(1).nullable(),
});

export type StagedProviderSessionBinding = z.infer<typeof StagedProviderSessionBindingSchema>;

export const PENDING_PROVIDER_SESSION_BINDING_TTL_SECONDS = 60;

export function providerSessionBindingLookupKey(sessionUid: string, clientCode: string) {
  return `oidc:provider-session-binding-lookup:${encodeURIComponent(sessionUid)}:${encodeURIComponent(clientCode)}`;
}

export function providerSessionPrincipalAnchorKey(sessionUid: string) {
  return `oidc:provider-session-principal:${encodeURIComponent(sessionUid)}`;
}

export function providerSessionGenerationMembersKey(sessionUid: string, generation: string) {
  return `oidc:provider-session-generation-members:${encodeURIComponent(sessionUid)}:${encodeURIComponent(generation)}`;
}

export function pendingProviderSessionBindingKey(authorizationAttemptId: string) {
  return `oidc:pending-provider-session-binding:${encodeURIComponent(authorizationAttemptId)}`;
}
