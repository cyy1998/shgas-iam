import type { IncomingMessage } from "node:http";
import type { OidcClientRuntimeMetadata } from "../repositories/client-metadata.ts";
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
  bind: (sessionUid: string, session: ResolvedGlobalSession) => Promise<ProviderSessionBinding | null>;
  stage: (session: ResolvedGlobalSession) => Promise<ProviderSessionBinding | null>;
}

export interface InteractionReturnHandleStore {
  create: (payload: OidcReturnHandlePayload, ttlSeconds: number) => Promise<string>;
  consume: (handle: string) => Promise<OidcReturnHandlePayload | null>;
}
