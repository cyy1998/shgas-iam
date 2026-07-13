import type { IncomingMessage } from "node:http";
import type { OidcClientRuntimeMetadata } from "../provider/client-runtime-metadata.ts";
import type { ProviderSessionBinding } from "../session/provider-session.ts";
import type { ResolvedGlobalSession } from "./global-session.ts";
import type { OidcReturnHandlePayload } from "./return-handle.ts";

export interface InteractionClientReader {
  findRuntime: (clientId: string) => Promise<OidcClientRuntimeMetadata | null>;
}

export interface InteractionGlobalSessionResolver {
  resolve: (request: Pick<IncomingMessage, "headers">) => Promise<ResolvedGlobalSession | null>;
  renew: (sessionId: string) => Promise<boolean>;
}

export interface InteractionProviderSessionBindingStore {
  bind: (
    sessionUid: string,
    session: ResolvedGlobalSession,
    context: { clientId: string; oidcConfigVersion: number },
  ) => Promise<ProviderSessionBinding | null>;
  stage: (
    session: ResolvedGlobalSession,
    context: { clientId: string; oidcConfigVersion: number },
  ) => Promise<ProviderSessionBinding | null>;
}

export interface InteractionReturnHandleStore {
  create: (payload: OidcReturnHandlePayload, ttlSeconds: number) => Promise<string | null>;
  consume: (handle: string) => Promise<OidcReturnHandlePayload | null>;
}
