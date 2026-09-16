import type { SubjectAccessOperation } from "@iam/api-core/subject-access";
import type {
  EmploymentProfileBase,
  OptionalSubjectClaim,
  SubjectFactsSnapshot,
} from "@iam/client-subject-projection";
import type { OidcTokens } from "./tokens";
import { requireSubjectAccessOperation } from "@iam/api-core/subject-access";
import { createPermittedClientSubjectProjectionService } from "@iam/client-subject-projection";
import { OidcScope, SubjectClaim } from "@iam/contracts";
import { OidcProtocolError } from "./errors";

function employmentBase(employment: EmploymentProfileBase) {
  return {
    isPrimary: employment.isPrimary,
    organization: {
      orgCode: employment.organization.code,
      orgName: employment.organization.name,
      orgType: employment.organization.type,
      fullOrgPath: employment.organization.path.map(node => ({
        orgCode: node.code,
        orgName: node.name,
        orgType: node.type,
      })),
    },
    position: { posCode: employment.position.code, posName: employment.position.name },
  };
}

/** Current disclosure consumes the Token owner's single online observation. */
export function createOidcUserInfo(options: {
  tokens: OidcTokens;
  subjectFacts: { read: (subjectIdentifier: string) => Promise<SubjectFactsSnapshot | null> };
}) {
  const projection = createPermittedClientSubjectProjectionService<SubjectAccessOperation>({
    subjectFacts: options.subjectFacts,
    assertPermission: (operation, subject) =>
      requireSubjectAccessOperation(operation).requirePermission(subject),
  });
  return {
    forOperation(operation: SubjectAccessOperation, issuer: string) {
      requireSubjectAccessOperation(operation);
      return {
        async read(bearer: string, origin?: string, allowOrigin?: () => void) {
          let resolved;
          try {
            resolved = await options.tokens.forOperation(operation, issuer).resolveAccessToken(bearer);
          }
          catch (error) {
            if (error instanceof OidcProtocolError && error.status !== 503)
              throw new OidcProtocolError("invalid_token", "Access Token is invalid", 401);
            throw error;
          }
          const { config, token, observation } = resolved;
          if (origin) {
            if (!config.redirectUris.some(uri => new URL(uri).origin === origin))
              throw new OidcProtocolError("invalid_request", "Origin is not allowed");
            allowOrigin?.();
          }
          const claims: OptionalSubjectClaim[] = [];
          const scopes = new Set(config.allowedScopes);
          if (scopes.has(OidcScope.Profile))
            claims.push(SubjectClaim.ProfileUsername, SubjectClaim.ProfileName);
          if (scopes.has(OidcScope.Phone))
            claims.push(SubjectClaim.ProfilePhone);
          if (scopes.has(OidcScope.IamEmployments))
            claims.push(SubjectClaim.ProfileEmployments);
          if (scopes.has(OidcScope.IamAuthorization))
            claims.push(SubjectClaim.IamAuthorization);
          const subject = await projection.resolve(
            {
              subjectIdentifier: observation.userSession.subjectIdentifier,
              clientCode: token.clientId,
              selection: { catalogVersion: 2, optionalClaims: claims },
            },
            operation,
          );
          return {
            sub: subject.subjectIdentifier,
            ...(subject.username === undefined ? {} : { preferred_username: subject.username }),
            ...(subject.name === undefined ? {} : { name: subject.name }),
            ...(subject.phone ? { phone_number: subject.phone } : {}),
            ...(subject.employments === undefined
              ? {}
              : {
                  "iam:employments": subject.employments.map(employment => ({
                    ...employmentBase(employment),
                    responsibilities: employment.responsibilities,
                  })),
                }),
            ...(subject.authorization === undefined
              ? {}
              : {
                  "iam:authorization": {
                    employments: subject.authorization.employments.map(employment => ({
                      ...employmentBase(employment),
                      roles: employment.roles,
                      privileges: employment.privileges,
                    })),
                    roles: subject.authorization.roles,
                    privileges: subject.authorization.privileges,
                  },
                }),
          };
        },
      };
    },
  };
}
export type OidcUserInfo = ReturnType<typeof createOidcUserInfo>;
