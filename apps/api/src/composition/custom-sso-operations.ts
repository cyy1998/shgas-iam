import type { CustomSsoOperationsDeps, CustomSsoProjectionPermission } from "@iam/custom-sso";
import {
  requireSubjectAccessOperation,
  SubjectAccessPermissionRequiredError,
} from "@iam/api-core/subject-access";
import { createPermittedClientSubjectProjectionService } from "@iam/client-subject-projection";
import { createCustomSsoOperations } from "@iam/custom-sso";

type ProjectionOptions = Parameters<
  typeof createPermittedClientSubjectProjectionService<CustomSsoProjectionPermission>
>[0];

/** Bind subject delivery to the current operation permission. */
export function createApiCustomSsoOperations(
  deps: Omit<CustomSsoOperationsDeps, "subjectProjection"> & {
    subjectFacts: ProjectionOptions["subjectFacts"];
    authorizationFreshness: ProjectionOptions["authorizationFreshness"];
  },
) {
  return createCustomSsoOperations({
    ...deps,
    subjectProjection: createPermittedClientSubjectProjectionService<CustomSsoProjectionPermission>({
      subjectFacts: deps.subjectFacts,
      authorizationFreshness: deps.authorizationFreshness,
      assertPermission(proof, subjectIdentifier) {
        const operation = requireSubjectAccessOperation(proof?.operation);
        if (operation.requirePermission(subjectIdentifier) !== proof.permission)
          throw new SubjectAccessPermissionRequiredError();
      },
    }),
  });
}
