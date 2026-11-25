import { randomUUID } from "node:crypto";
import { mapCustomSsoRetryableError } from "@iam/api-core/http/custom-sso-retryable";
import { createPublicAuthenticationHandler } from "@iam/api-core/middlewares/public-authentication";
import { acquireIamRootClient, type ClientSnapshotReader } from "@iam/client-snapshot";
import { AuthzMaintenanceError, AuthzUnauthorizedError } from "@iam/runtime/errors";
import { createUnifiedSessionKernel, SessionStorageError } from "@iam/session-kernel";
import {
  createSubjectAccessBarrier,
  createSubjectAccessOperations,
  requireSubjectAccessOperation,
  type SubjectAccessOperation,
  SubjectAccessUnavailableError,
} from "@iam/subject-access";
import { createRedisSubjectAccessStore } from "@iam/subject-access/redis";
import { createUnifiedSubjectAccessSessionRevocation } from "@iam/subject-access/session-kernel";
import type Redis from "ioredis";
import type { Env } from "../env";

class IamClientRejectedError extends AuthzUnauthorizedError {}

export function createIntegrationSubjectAccess(
  redis: Redis,
  sessionConfig: Env["sessionKernel"],
  clients: ClientSnapshotReader,
) {
  const barrier = createSubjectAccessBarrier({
    clock: { nowDate: () => new Date() },
    random: { uuid: randomUUID },
    store: createRedisSubjectAccessStore({ redis }),
  });
  const kernel = createUnifiedSessionKernel<SubjectAccessOperation>({
    redis,
    ...sessionConfig,
    assertOperationActive: requireSubjectAccessOperation,
  });
  const revocation = createUnifiedSubjectAccessSessionRevocation(kernel, {
    run: (callback) => operations.run(callback),
  });
  const operations: ReturnType<typeof createSubjectAccessOperations> = createSubjectAccessOperations({
    barrier,
    revocation,
  });

  const authenticate = createPublicAuthenticationHandler<undefined>({
    async runWithAuthentication(token, clientCode, deliver) {
      if (clientCode !== "iam") throw new AuthzUnauthorizedError("非法访问");

      await operations.run(async (operation) => {
        const result = await kernel
          .forOperation(operation)
          .resolveUserSession(token)
          .catch((error: unknown) => {
            if (error instanceof SessionStorageError) throw new SubjectAccessUnavailableError();
            throw error;
          });
        if (result.status === "corrupt") throw new SubjectAccessUnavailableError();
        if (result.status !== "resolved") throw new AuthzUnauthorizedError("未登录");
        const user = result.value.userSession;
        await operation.acquireForSession({
          principalSessionId: user.userSessionId,
          subjectIdentifier: user.subjectIdentifier,
          subjectContext: user.subjectContext,
        });
        const client = await acquireIamRootClient(clients);
        if (client.kind === "maintenance") throw new AuthzMaintenanceError();
        if (client.kind !== "accepted") throw new IamClientRejectedError("非法访问");
        await deliver({
          authenticationContext: { subjectIdentifier: user.subjectIdentifier, authenticatedClientCode: clientCode },
          subjectDeliveryCapability: undefined,
        });
      });
    },
    runWithCapability: (_context, _capability, next) => next(),
    mapRetryableError: mapCustomSsoRetryableError,
    shouldPreserveSessionCookie: (error, clientCode) => clientCode !== "iam" || error instanceof IamClientRejectedError,
    retryAfterSeconds: 3,
  });
  return { authenticate, barrier };
}
