import { randomUUID } from "node:crypto";
import { createRouter } from "@iam/api-core/core/create-router";
import { createInternalAuthenticationHandler } from "@iam/api-core/middlewares/internal-client-authentication";
import type { DbClient } from "@iam/db";
import type { AuditLogWriter } from "@iam/db/audit";
import type { DelegationService } from "@iam/delegation";
import {
  createOrganizationDocumentQueryRepository,
  createOrganizationDocumentQueryService,
} from "@iam/documents/organization";
import {
  createInternalUserDocumentQueryRepository,
  createInternalUserDocumentQueryService,
  createUserDocumentSearchRepository,
  createUserDocumentSearchService,
} from "@iam/documents/user";
import { createSubjectAccessTransitionRepository } from "@iam/documents/user/subject-access-transition";
import { createSmsTransport, type SmsTransportOptions } from "@iam/sms";
import type { SubjectAccessBarrier } from "@iam/subject-access";
import { createSubjectAccessLifecycle } from "@iam/subject-access/lifecycle";
import { mapUnitOfWork } from "@iam/unit-of-work";
import type { Logger } from "pino";
import type { Env } from "../env";
import { createDelegationHandlers } from "../routes/internal/delegation/delegation.handlers";
import { createDelegationRoute } from "../routes/internal/delegation/delegation.index";
import { createOrganizationHandlers } from "../routes/internal/organization/organization.handlers";
import { createOrganizationRoute } from "../routes/internal/organization/organization.index";
import { createUserHandlers } from "../routes/internal/user/user.handlers";
import { createUserRoute } from "../routes/internal/user/user.index";
import type { ClientService } from "../services/client/client.service";
import { createOrganizationService } from "../services/organization/organization.service";
import { createUserDocumentSearchAdapter } from "../services/user-document-search/user-document-search.adapter";
import { createRegisterPurveyorContactUseCase } from "../use-cases/internal/register-purveyor-contact/register-purveyor-contact.use-case";
import { createResolveClientDelegationsUseCase } from "../use-cases/internal/resolve-client-delegations/resolve-client-delegations.use-case";
import type { IntegrationRepositories } from "./repositories";
import { createClientDelegationResolutionRepository } from "./repositories/client-delegation-resolution.repository";
import type { createIntegrationUnitOfWork } from "./tx";

interface InternalRoutesOptions {
  env: Env;
  logger: Logger;
  database: DbClient;
  userQueryDb: DbClient;
  organizationQueryDb: DbClient;
  delegationQueryDb: DbClient;
  client: ClientService;
  delegation: DelegationService;
  auditLogWriter: AuditLogWriter;
  repositories: IntegrationRepositories;
  unitOfWork: ReturnType<typeof createIntegrationUnitOfWork>;
  barrier: SubjectAccessBarrier;
  smsFetch?: SmsTransportOptions["fetch"];
}

function getPurveyorWelcomeMessage(name: string) {
  return `尊敬的${name}：
诚挚邀请贵司成为我司的候选供应商。请通过网站 https://tender.shgas.com.cn/tender-portal/ 完成相关信息登记，登录时请选择“手机号验证码登录”方式。感谢贵司的支持与配合！
上海燃气有限公司`;
}

export function createInternalRoutes(options: InternalRoutesOptions) {
  const { env, logger, repositories, unitOfWork, auditLogWriter } = options;
  const sms = env.sms && createSmsTransport({ config: env.sms, clock: { now: Date.now }, fetch: options.smsFetch });

  const registerPurveyorContact = createRegisterPurveyorContactUseCase({
    auditLogWriter,
    config: { nodeEnv: env.nodeEnv },
    mobileService: {
      getPurveyorWelcomeMessage,
      async sendMessage(mobile, message) {
        if (!sms) throw new Error("Production welcome SMS is not configured");
        const response = await sms.sendMessage(mobile, message);
        await response.body?.cancel().catch(() => undefined);
        return true;
      },
    },
    random: { uuid: randomUUID },
    subjectAccessLifecycle: createSubjectAccessLifecycle({
      barrier: options.barrier,
      logger,
      random: { uuid: randomUUID },
      transitionIntent: createSubjectAccessTransitionRepository(options.database),
    }),
    uow: mapUnitOfWork(unitOfWork, (tx) => ({
      employmentRepository: tx.repositories.employment,
      organizationRepository: tx.repositories.organization,
      positionRepository: tx.repositories.position,
      subjectAccessMutation: tx.subjectAccessMutation,
      userRepository: tx.repositories.user,
      userDocumentInvalidation: tx.userDocumentInvalidation,
    })),
    userReader: { getActiveUserByMobile: repositories.user.getUserByMobile },
  });

  const organizations = createOrganizationHandlers({
    auditLogWriter,
    organizationService: createOrganizationService({
      organizationRepository: repositories.organization,
      uow: mapUnitOfWork(unitOfWork, (tx) => ({
        organizationRepository: tx.repositories.organization,
        responsibilityParentLifecycle: tx.responsibilityParentLifecycle,
        userDocumentInvalidation: tx.userDocumentInvalidation,
        organizationDocumentInvalidation: tx.organizationDocumentInvalidation,
      })),
    }),
    organizationDocument: createOrganizationDocumentQueryService({
      repository: createOrganizationDocumentQueryRepository(options.organizationQueryDb),
    }),
  });
  const users = createUserHandlers({
    registerPurveyorContact,
    internalUserDocumentQuery: createInternalUserDocumentQueryService({
      documentRepository: createInternalUserDocumentQueryRepository(options.userQueryDb),
    }),
    userDocumentSearch: createUserDocumentSearchAdapter(
      createUserDocumentSearchService({ documentRepository: createUserDocumentSearchRepository(options.userQueryDb) }),
    ),
  });
  const delegations = createDelegationHandlers({
    delegationService: options.delegation,
    resolveClientDelegations: createResolveClientDelegationsUseCase({
      clock: { nowDate: () => new Date() },
      resolution: createClientDelegationResolutionRepository(options.delegationQueryDb),
    }),
  });

  return createRouter()
    .basePath("/internal")
    .use("/*", createInternalAuthenticationHandler({ getClientBySecret: options.client.getClientBySecret }))
    .route("/", createOrganizationRoute(organizations))
    .route("/", createUserRoute(users))
    .route("/", createDelegationRoute(delegations));
}
