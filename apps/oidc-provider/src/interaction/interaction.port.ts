import type { IncomingMessage } from "node:http";
import type { OidcClientRuntimeMetadata } from "../provider/client/client-runtime-metadata.ts";
import type { ProviderSessionBinding } from "../session/provider-session.ts";
import type {
  GlobalSessionInspection,
  ResolvedGlobalSession,
} from "./global-session.ts";
import type { OidcReturnHandlePayload } from "./return-handle.ts";

export interface InteractionClientReader {
  findRuntime: (clientId: string) => Promise<OidcClientRuntimeMetadata | null>;
}

export interface InteractionArtifactReader {
  find: (interactionUid: string) => Promise<{
    clientId: string;
    promptName: string;
    uid: string;
  } | null>;
}

export interface InteractionTrafficGate {
  assertIssuanceAllowed: (clientId: string) => Promise<void>;
}

export interface InteractionGlobalSessionResolver {
  inspect: (request: Pick<IncomingMessage, "headers">) => Promise<GlobalSessionInspection>;
  resolve: (request: Pick<IncomingMessage, "headers">) => Promise<ResolvedGlobalSession | null>;
  renew: (sessionId: string) => Promise<boolean>;
}

export interface InteractionStagedPrincipalReader {
  isStagedPrincipal: (
    authorizationAttemptId: string,
    clientId: string,
    session: ResolvedGlobalSession,
  ) => Promise<boolean>;
}

export interface InteractionProviderSessionPrincipalReader
  extends InteractionStagedPrincipalReader {
  isCurrentOrStagedPrincipal: (
    sessionUid: string,
    clientId: string,
    session: ResolvedGlobalSession,
    authorizationAttemptId: string | null,
  ) => Promise<boolean>;
}

export interface InteractionProviderSessionBindingStore
  extends InteractionStagedPrincipalReader {
  stage: (
    session: ResolvedGlobalSession,
    context: {
      authorizationAttemptId: string;
      clientId: string;
      oidcConfigVersion: number;
      providerSessionUid: string | null;
    },
  ) => Promise<ProviderSessionBinding | null>;
}

export interface InteractionReturnHandleStore {
  create: (payload: OidcReturnHandlePayload, ttlSeconds: number) => Promise<string | null>;
  resolveReturnHandle: (handle: string) => Promise<OidcReturnHandlePayload | null>;
  consume: (handle: string) => Promise<OidcReturnHandlePayload | null>;
}
