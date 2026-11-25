import { createApiPublicAuthenticationHandler } from "@auth-api/middlewares/public-authentication";
import { createRootAuthHandlers } from "@auth-api/routes/auth/auth.handlers";
import * as authRoutes from "@auth-api/routes/auth/auth.routes";
import { createImageCaptchaRoutes } from "@auth-api/routes/open/image-captcha.routes";
import { createOpenHandlers } from "@auth-api/routes/open/open.handlers";
import { createOpenRoute } from "@auth-api/routes/open/open.index";
import { createPublicHandlers } from "@auth-api/routes/public/public.handlers";
import * as accountRoutes from "@auth-api/routes/public/public.routes";
import { createRootSsoHandlers } from "@auth-api/routes/sso/sso.handlers";
import * as ssoRoutes from "@auth-api/routes/sso/sso.routes";
import { createRootSessionService } from "@auth-api/services/authentication/root-session.service";
import { createUserSessionAuthenticationAdapter } from "@auth-api/services/authentication/user-session.adapter";
import {
  CUSTOM_SSO_SESSION_AUTHORIZATION_SECURITY_DEFINITION,
  CUSTOM_SSO_SESSION_AUTHORIZATION_SECURITY_SCHEME,
} from "@auth-api/services/sso/transport/custom-sso-delivery.security";
import type { CreateAppOptions } from "@iam/api-core/core/create-app";
import { createRouter } from "@iam/api-core/core/create-router";
import type { PublicBindings } from "@iam/api-core/types";
import { createPermittedClientSubjectProjectionService } from "@iam/client-subject-projection";
import { createUnifiedCustomSsoOperations } from "@iam/custom-sso";
import type { AuditLogWriter } from "@iam/db/audit";
import { AuthzUnauthorizedError } from "@iam/runtime/errors";
import type { SubjectAccessOperation } from "@iam/subject-access";
import {
  requireSubjectAccessOperation,
  SubjectAccessOperationDeniedError,
  SubjectAccessUnavailableError,
} from "@iam/subject-access";
import type { AuthApiRepositories } from "../repositories";
import type { ApiRuntimePorts } from "../runtime";
import type { ApiServices } from "../services";
import type { createAuthApiUnitOfWork } from "../tx";
import type { ApiUseCases } from "../use-cases";
import { createAuthenticationUseCases } from "../use-cases/authentication";
import { createWechatQrRoutes } from "./wechat-qr";

export function createAuthApiRoutes(options: {
  verifyDatabase: () => Promise<unknown>;
  auditLogWriter: AuditLogWriter;
  runtime: ApiRuntimePorts;
  services: ApiServices;
  useCases: ApiUseCases;
  repositories: AuthApiRepositories;
  unitOfWork: ReturnType<typeof createAuthApiUnitOfWork>;
}): CreateAppOptions["routes"] {
  const { auditLogWriter, runtime, services, useCases } = options;
  const { sessionKernel: kernel, subjectAccessOperations: operations, subjectFacts, clientSnapshots } = services;
  const retryAfterSeconds = runtime.config.env.sso.projectionRetryAfterSeconds;
  const projection = createPermittedClientSubjectProjectionService<SubjectAccessOperation>({
    subjectFacts,
    assertPermission: (operation, subjectIdentifier) =>
      requireSubjectAccessOperation(operation).requirePermission(subjectIdentifier),
  });
  const clients = clientSnapshots.client;
  const roots = createRootSessionService({ kernel, clients, projection });
  const applicationSessions = createUnifiedCustomSsoOperations({
    kernel,
    clients,
    projection,
    credentials: services.credentials,
    redis: runtime.redis,
    namespace: runtime.config.sessionKernel.namespace,
    tokenTtlSeconds: runtime.config.sessionKernel.clientSessionTtlSeconds,
    business: { audit: auditLogWriter, logger: runtime.logger },
  });
  const principalSessions = createUserSessionAuthenticationAdapter(kernel, operations);
  const config = { userSessionTtlSeconds: runtime.config.sessionKernel.userSessionTtlSeconds };
  const authentication = createAuthenticationUseCases({
    auditLogWriter,
    runtime,
    services: {
      ...services,
      principalSessions,
      oaCurrentSessions: {
        resolve: (token) =>
          operations.run(async (operation) => {
            try {
              const { observation } = await roots.forOperation(operation).resolvePermittedRoot(token);
              return {
                subjectIdentifier: observation.userSession.subjectIdentifier,
                remainingSeconds: observation.remainingSeconds,
              };
            } catch (error) {
              if (error instanceof AuthzUnauthorizedError) return null;
              if (error instanceof SubjectAccessOperationDeniedError) {
                if (error.reason === "identity_mismatch") throw new SubjectAccessUnavailableError(error);
                return null;
              }
              throw error;
            }
          }),
        logout: (token) => operations.run(async (operation) => await roots.forOperation(operation).logout(token)),
      },
    },
  });
  const login = createRootAuthHandlers({ authentication, config, loginCredentialParser: services.loginCredential });
  const callbacks = createRootSsoHandlers({ authentication, config });
  const open = createOpenHandlers({
    accountRecovery: useCases.accountRecovery,
    auditLogWriter,
    clientService: services.client,
    humanVerification: services.cap,
    humanRiskService: services.humanRisk,
    mobileService: services.mobile,
    userService: services.user,
  });

  const health = createRouter();
  health.get("/health", async (c) => {
    try {
      await runtime.redis.ping();
      return c.json({ status: "ok" });
    } catch {
      return c.json({ status: "unavailable" }, 503);
    }
  });
  health.get("/ready", async (c) => {
    try {
      await Promise.all([runtime.redis.ping(), options.verifyDatabase()]);
      return c.json({ status: "ok" });
    } catch {
      return c.json({ status: "unavailable" }, 503);
    }
  });

  const account = createRouter<PublicBindings>();
  account.openAPIRegistry.registerComponent(
    "securitySchemes",
    CUSTOM_SSO_SESSION_AUTHORIZATION_SECURITY_SCHEME,
    CUSTOM_SSO_SESSION_AUTHORIZATION_SECURITY_DEFINITION,
  );
  account.use(
    "*",
    createApiPublicAuthenticationHandler({
      runWithAuthentication: (token, clientCode, deliver) =>
        operations.run(async (operation) => {
          const sessions = clientCode === "iam" ? roots : applicationSessions;
          await deliver(await sessions.forOperation(operation).resolvePublicAuthentication(token, clientCode));
        }),
      runWithCapability: async (_context, _capability, next) => await next(),
      retryAfterSeconds,
    }),
  );
  const accountHandlers = createPublicHandlers({ userService: services.user });
  account.openapi(accountRoutes.passwordChange, accountHandlers.passwordChange);
  account.openapi(accountRoutes.mobileSet, accountHandlers.mobileSet);

  const auth = createRouter()
    .openapi(authRoutes.loginPassword, login.loginPassword)
    .openapi(authRoutes.loginMobile, login.loginMobile)
    .route("/", createOpenRoute(open))
    .route("/", createImageCaptchaRoutes(services.imageCaptcha))
    .route("/account", account);
  const sso = createRouter()
    .openapi(ssoRoutes.loginOA, callbacks.loginOA)
    .openapi(ssoRoutes.loginWX, callbacks.loginWX);
  const qr = createWechatQrRoutes({ ...options, principalSessions });
  if (qr) {
    auth.route("/wechat-qr", qr.desktop);
    sso.route("/wechat-qr/mobile", qr.mobile);
  }
  return {
    "./src/routes/health/health.index.ts": { default: health },
    "./src/routes/auth/auth.index.ts": { default: auth },
    "./src/routes/sso/sso.index.ts": { default: sso },
  };
}
