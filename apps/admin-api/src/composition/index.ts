import env from "@admin-api/env";
import { logger } from "@admin-api/lib/logger";
import { createAdminAuthorizationPolicy } from "@admin-api/services/admin-authorization/admin-authorization.policy";
import { createHrAdministrationScopeResolver } from "@admin-api/services/admin-authorization/hr-administration-scope.resolver";
import { createAdminAuditService } from "@admin-api/services/audit/audit.service";
import type { CreateAppOptions } from "@iam/api-core/core/create-app";
import { createRoleAssignmentResolver } from "@iam/assignment-resolution/role-assignment";
import type { DbClient } from "@iam/db";
import db from "@iam/db";
import { createOrganizationDocumentWriteResources } from "@iam/documents/organization/producer";
import { createUserDocumentWriteResources } from "@iam/documents/user/producer";
import { createAdminApiMiddlewares } from "./middlewares";
import { createAdminApiRepositories } from "./repositories";
import { createAdminApiRouteComposition } from "./routes";
import { createAdminApiRuntime } from "./runtime";
import { createAdminApiServices } from "./services";
import { createAdminApiSession } from "./session";
import { createAdminApiUnitOfWork } from "./tx";
import { createAdminApiUseCases } from "./use-cases";

export interface AdminApiComposition {
  env: typeof env;
  logger: typeof logger;
  runtime: ReturnType<typeof createAdminApiRuntime>;
  session: ReturnType<typeof createAdminApiSession>;
  repositories: ReturnType<typeof createAdminApiRepositories>;
  roleAssignmentResolver: ReturnType<typeof createRoleAssignmentResolver>;
  auditService: ReturnType<typeof createAdminAuditService>;
  authorizationPolicy: ReturnType<typeof createAdminAuthorizationPolicy>;
  userDocumentQueue: ReturnType<typeof createUserDocumentWriteResources>["queue"];
  userDocumentJobProducer: ReturnType<typeof createUserDocumentWriteResources>["jobProducer"];
  organizationDocumentWrites: ReturnType<typeof createOrganizationDocumentWriteResources>;
  unitOfWork: ReturnType<typeof createAdminApiUnitOfWork>;
  services: ReturnType<typeof createAdminApiServices>;
  useCases: ReturnType<typeof createAdminApiUseCases>;
  routes: CreateAppOptions["routes"];
  middlewares: CreateAppOptions["middlewares"];
}

export interface CreateAdminApiCompositionOptions {
  db?: DbClient;
  env?: typeof env;
  logger?: typeof logger;
}

export async function createAdminApiComposition(
  options: CreateAdminApiCompositionOptions = {},
): Promise<AdminApiComposition> {
  const compositionEnv = options.env ?? env;
  const compositionLogger = options.logger ?? logger;
  const compositionDb = options.db ?? db;
  const runtime = createAdminApiRuntime({ env: compositionEnv, logger: compositionLogger });
  const session = createAdminApiSession({ runtime });
  const roleAssignmentResolver = createRoleAssignmentResolver(compositionDb);
  const hrAdministrationScopeResolver = createHrAdministrationScopeResolver({
    db: compositionDb,
    roleAssignmentResolver,
  });
  const repositories = createAdminApiRepositories(compositionDb);
  const auditService = createAdminAuditService({ auditRepository: repositories.audit });
  const authorizationPolicy = createAdminAuthorizationPolicy({
    hrAdministrationScopeResolver,
    logger: runtime.logger,
  });
  const userDocumentWrites = createUserDocumentWriteResources({
    redis: runtime.config.env.redis,
    logger: runtime.logger,
  });
  const userDocumentQueue = userDocumentWrites.queue;
  const userDocumentJobProducer = userDocumentWrites.jobProducer;
  const organizationDocumentWrites = createOrganizationDocumentWriteResources({
    redis: runtime.config.env.redis,
    logger: runtime.logger,
  });
  const unitOfWork = createAdminApiUnitOfWork({
    db: compositionDb,
    logger: runtime.afterCommitLogger,
    userDocumentJobProducer,
    organizationDocumentJobProducer: organizationDocumentWrites.jobProducer,
    clock: runtime.clock,
  });
  const services = createAdminApiServices({
    db: compositionDb,
    auditService,
    roleAssignmentResolver,
    repositories,
    runtime,
    session,
    unitOfWork,
  });
  const useCases = createAdminApiUseCases({
    clock: runtime.clock,
    sessionRevocation: session.revocation,
    subjectAccessLifecycle: session.subjectAccessLifecycle,
    unitOfWork,
    userReader: repositories.user,
  });
  const routeComposition = createAdminApiRouteComposition({
    auditService,
    runtime,
    services,
    useCases,
  });

  return {
    env: compositionEnv,
    logger: compositionLogger,
    runtime,
    session,
    repositories,
    roleAssignmentResolver,
    auditService,
    authorizationPolicy,
    userDocumentQueue,
    userDocumentJobProducer,
    organizationDocumentWrites,
    unitOfWork,
    services,
    useCases,
    routes: routeComposition.routes,
    middlewares: await createAdminApiMiddlewares({
      authorizationPolicy,
      restOperationSurface: routeComposition.restOperationSurface,
      runtime,
      services,
      subjectAccess: session.subjectAccessOperations,
    }),
  };
}
