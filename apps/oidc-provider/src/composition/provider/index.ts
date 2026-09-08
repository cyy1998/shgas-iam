import type { SubjectAccessOperation } from "@iam/api-core/subject-access";
import type { DbClient } from "@iam/db";
import type { Redis } from "ioredis";
import type { OidcProviderEnv } from "../../env.ts";
import type { CreateOidcInteractionHandlerDeps, OidcInteractionHandler } from "../../interaction/handler.ts";
import type { OidcLogger } from "../../lib/logger.ts";
import type { OidcClaimsSnapshot } from "../../provider/claims/claims-snapshot.ts";
import type { ClaimsAccountReader, ClaimsSubjectProjectionResolver } from "../../provider/claims/claims.port.ts";
import type { SigningKey } from "../../security/signing-keys.ts";
import type { OidcProviderSecurity } from "../security/index.ts";
import type { OidcProviderSession } from "../session/index.ts";
import type { OidcProviderStores } from "../stores/index.ts";
import { requireSubjectAccessOperation } from "@iam/api-core/subject-access";
import { createPermittedClientSubjectProjectionService } from "@iam/client-subject-projection";
import {
  createSubjectFactsLoggerObservability,
  createSubjectFactsReader,
  createSubjectFactsRedisCache,
} from "@iam/user-profile-read-model/subject-facts";
import { createOidcInteractionHandler } from "../../interaction/handler.ts";
import { createIamInteractionPolicy } from "../../interaction/policy.ts";
import { createOidcClaimsAdapter } from "../../provider/claims.ts";
import {
  createOidcClientTrafficGate,
  registerOidcClientTrafficGate,
} from "../../provider/client/client-traffic-gate.ts";
import { createOidcProvider } from "../../provider/create-provider.ts";
import { createOidcSubjectAccessBridge } from "../../provider/subject-access-operation.ts";
import { createOidcProviderSessionBridge } from "../../provider/subject-access-session.ts";
import { createOidcAdapterFactory } from "../../storage/redis-adapter.ts";

export interface CreateOidcProviderRuntimeDeps {
  env: OidcProviderEnv;
  logger: OidcLogger;
  redis: Redis;
  db: DbClient;
  signingKeys: {
    current: SigningKey;
    previous?: SigningKey;
  };
  repositories: { account: ClaimsAccountReader };
  security: Pick<OidcProviderSecurity, "clientAuthRateLimiter" | "clientSecretVerifier">;
  session: OidcProviderSession;
  stores: Pick<OidcProviderStores, | "clientRuntime"
  | "clientTrafficGate"
  | "tokens">;
}

export function createOidcProviderRuntime(deps: CreateOidcProviderRuntimeDeps) {
  const bridge = createOidcSubjectAccessBridge(deps.session.operations);
  const oidcSession = createOidcProviderSessionBridge(deps.session.sessions, bridge);
  const subjectFacts = createSubjectFactsReader({
    db: deps.db,
    cache: createSubjectFactsRedisCache(deps.redis),
    observability: createSubjectFactsLoggerObservability(deps.logger),
  });
  const projection = createPermittedClientSubjectProjectionService<SubjectAccessOperation>({
    subjectFacts,
    authorizationFreshness: subjectFacts,
    assertPermission(operation, subjectIdentifier) {
      requireSubjectAccessOperation(operation).requirePermission(subjectIdentifier);
    },
  });
  const runtime = assembleOidcProviderRuntime({
    ...deps,
    repositories: {
      account: {
        async findBySubject(subject) {
          bridge.current().requirePermission(subject);
          return await deps.repositories.account.findBySubject(subject);
        },
      },
    },
    session: { oidcSession },
  }, {
    resolve: input => projection.resolve(input, bridge.current()),
  }, (handlerDeps) => {
    function scoped(operation: SubjectAccessOperation) {
      const session = deps.session.sessions.forOperation(operation);
      return createOidcInteractionHandler({
        ...handlerDeps,
        globalSessions: session,
        providerSessions: session,
        returnHandles: session,
      });
    }
    return {
      handleInteraction: (request, response) => bridge.run(operation =>
        scoped(operation).handleInteraction(request, response)),
      handleLoginGuard: (request, response) => bridge.run(operation =>
        scoped(operation).handleLoginGuard(request, response)),
      handleResume: (request, response) => bridge.run(operation =>
        scoped(operation).handleResume(request, response)),
    };
  }, claimsDeps => createOidcClaimsAdapter(
    claimsDeps,
    bridge.current,
    () => oidcSession.resolve(bridge.request()),
  ));
  bridge.register(runtime.provider);
  return { ...runtime, bridge };
}

function assembleOidcProviderRuntime(
  deps: Omit<CreateOidcProviderRuntimeDeps, "session"> & {
    session: { oidcSession: ReturnType<typeof createOidcProviderSessionBridge> };
  },
  projection: ClaimsSubjectProjectionResolver,
  createInteractions: (deps: CreateOidcInteractionHandlerDeps) => OidcInteractionHandler,
  createClaims: (deps: Parameters<typeof createOidcClaimsAdapter>[0]) => ReturnType<typeof createOidcClaimsAdapter>,
) {
  const trafficGate = createOidcClientTrafficGate({ gate: deps.stores.clientTrafficGate });
  const claims = createClaims({
    accounts: deps.repositories.account,
    clients: deps.stores.clientRuntime,
    globalSessions: deps.session.oidcSession,
    projection,
    providerSessions: deps.session.oidcSession,
    tokens: deps.session.oidcSession,
  });
  const adapter = createOidcAdapterFactory<OidcClaimsSnapshot>(deps.redis, {
    claims,
    clients: deps.stores.clientRuntime,
    clientVersions: deps.stores.clientRuntime,
    oidcSession: deps.session.oidcSession,
    providerSessions: deps.session.oidcSession,
    tokens: deps.stores.tokens,
  });
  const provider = createOidcProvider({
    env: deps.env,
    logger: deps.logger,
    signingKeys: deps.signingKeys,
    adapter,
    claims,
    interactionPolicy: createIamInteractionPolicy(
      deps.session.oidcSession,
      deps.session.oidcSession,
      trafficGate,
    ),
    clientAuthRateLimiter: deps.security.clientAuthRateLimiter,
    clientSecretVerifier: deps.security.clientSecretVerifier,
    oidcSession: deps.session.oidcSession,
    trafficGate,
  });
  registerOidcClientTrafficGate(provider, trafficGate);
  const interactions = createInteractions({
    provider,
    interactionArtifacts: {
      async find(interactionUid) {
        const interaction = await provider.Interaction.find(interactionUid);
        if (typeof interaction !== "object" || interaction === null)
          return null;
        const uid = Reflect.get(interaction, "uid");
        const params = Reflect.get(interaction, "params");
        const prompt = Reflect.get(interaction, "prompt");
        if (typeof params !== "object" || params === null
          || typeof prompt !== "object" || prompt === null) {
          return null;
        }
        const clientId = Reflect.get(params, "client_id");
        const promptName = Reflect.get(prompt, "name");
        if (typeof uid !== "string"
          || typeof clientId !== "string"
          || typeof promptName !== "string") {
          return null;
        }
        return {
          clientId,
          promptName,
          uid,
        };
      },
    },
    clients: deps.stores.clientRuntime,
    globalSessions: deps.session.oidcSession,
    providerSessions: deps.session.oidcSession,
    returnHandles: deps.session.oidcSession,
    trafficGate,
    env: deps.env,
  });

  return {
    claims,
    provider,
    interactions,
  };
}

export type OidcProviderRuntime = ReturnType<typeof createOidcProviderRuntime>;
