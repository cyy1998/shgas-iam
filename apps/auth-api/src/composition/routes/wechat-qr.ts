import { createWechatQrDesktopRouter, createWechatQrMobileRouter } from "@auth-api/routes/sso/wechat-qr.http";
import { createWechatQrContinuationHttp } from "@auth-api/routes/sso/wechat-qr-continuation.http";
import type { createUserSessionAuthenticationAdapter } from "@auth-api/services/authentication/user-session.adapter";
import { createWechatQrState } from "@auth-api/services/authentication/wechat-qr.state";
import { createWechatQrUseCase } from "@auth-api/use-cases/authentication/wechat-qr/wechat-qr.use-case";
import { createWechatQrBindingUseCase } from "@auth-api/use-cases/authentication/wechat-qr/wechat-qr-binding.use-case";
import { createWechatQrCompletionUseCase } from "@auth-api/use-cases/authentication/wechat-qr/wechat-qr-completion.use-case";
import { createCustomSsoWechatQrContinuation } from "@iam/custom-sso/wechat-qr";
import type { AuditLogWriter } from "@iam/db/audit";
import { createOidcWechatQrContinuation } from "@iam/oidc/wechat-qr";
import { mapUnitOfWork } from "@iam/unit-of-work";
import type { AuthApiRepositories } from "../repositories";
import type { ApiRuntimePorts } from "../runtime";
import type { ApiServices } from "../services";
import type { createAuthApiUnitOfWork } from "../tx";

export function createWechatQrRoutes(options: {
  runtime: ApiRuntimePorts;
  services: ApiServices;
  repositories: AuthApiRepositories;
  auditLogWriter: AuditLogWriter;
  unitOfWork: ReturnType<typeof createAuthApiUnitOfWork>;
  principalSessions: ReturnType<typeof createUserSessionAuthenticationAdapter>;
}) {
  const { runtime, services, repositories, auditLogWriter, unitOfWork, principalSessions } = options;
  const { env, sessionKernel } = runtime.config;
  const { qr, corpId } = env.integrations.wechat;
  if (!qr) return;

  const state = createWechatQrState(runtime.redis, sessionKernel.namespace);
  const { subjectAccessOperations: operations, loginRestriction } = services;
  const workflow = createWechatQrUseCase({
    config: { ...qr, corpId },
    state,
    wechat: runtime.integrations.wechat,
    directory: {
      lookupApplicationName: async (clientCode) =>
        (await services.client.getClientByCode(clientCode))?.clientName ?? null,
      findRegisteredMember: repositories.user.findRegisteredWechatMember,
      findRegisteredExternalIdentity: repositories.user.findRegisteredWechatExternalIdentity,
    },
  });
  const binding = createWechatQrBindingUseCase({
    state,
    users: repositories.user,
    sms: services.mobile,
    verifyUserPassword: services.userPassword.verifyUserPassword,
    credentials: services.loginCredential,
    humanVerification: services.cap,
    humanRisk: services.humanRisk,
    loginRestriction,
    auditLogWriter,
    requireAccess: (subjectIdentifier) =>
      operations.run(async (operation) => {
        await operation.acquireForAuthentication(subjectIdentifier);
      }),
    uow: mapUnitOfWork(unitOfWork, (tx) => ({
      userRepository: tx.repositories.user,
      auditLogWriter: tx.auditLogWriter,
      userDocumentInvalidation: tx.userDocumentInvalidation,
    })),
  });
  const complete = createWechatQrCompletionUseCase({
    state,
    principalSessions,
    auditLogWriter,
    loginRestriction,
    users: services.user,
  });
  const continuation = {
    redis: runtime.redis,
    kernel: services.sessionKernel,
    clients: services.clientSnapshots.client,
  };
  const httpContinuation = createWechatQrContinuationHttp({
    customSso: createCustomSsoWechatQrContinuation({ ...continuation, namespace: sessionKernel.namespace }),
    oidc: createOidcWechatQrContinuation({ ...continuation, namespace: env.oidc.namespace }),
    operations,
    internalIssuer: `${env.sso.internalOrigin}/oidc`,
    retryAfterSeconds: env.sso.projectionRetryAfterSeconds,
  });
  return {
    desktop: createWechatQrDesktopRouter({
      ...httpContinuation,
      qr: workflow,
      state,
      complete,
      binding,
      internalOrigin: env.sso.internalOrigin,
    }),
    mobile: createWechatQrMobileRouter(workflow),
  };
}
