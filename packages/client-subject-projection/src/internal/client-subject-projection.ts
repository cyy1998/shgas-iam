import type {
  ClientAuthorization,
  ClientAuthorizationEmployment,
  ClientSubjectProjectionService,
  CreateClientSubjectProjectionServiceOptions,
  EmploymentProfile,
  SubjectFactsEmployment,
  SubjectFactsSnapshot,
} from "../legacy-maintenance";
import { assertSubjectClaimSelection } from "../catalog";
import { SubjectProjectionNotReadyError } from "../errors";

export function createClientSubjectProjectionService(
  options: CreateClientSubjectProjectionServiceOptions,
): ClientSubjectProjectionService {
  return {
    async resolve(input) {
      await options.subjectAccess.assertAccessible(input.subjectIdentifier);
      assertSubjectClaimSelection(input.selection);
      const projection: {
        subjectIdentifier: string;
        username?: string;
        name?: string;
        phone?: string | null;
        employments?: EmploymentProfile[];
        authorization?: ClientAuthorization;
      } = {
        subjectIdentifier: input.subjectIdentifier,
      };
      if (input.selection.optionalClaims.length === 0)
        return projection;

      let facts = await options.subjectFacts.read(input.subjectIdentifier);
      if (facts === null || facts.subjectIdentifier !== input.subjectIdentifier)
        throw new SubjectProjectionNotReadyError();

      if (input.selection.optionalClaims.includes("iam:authorization")) {
        const freshness = await options.authorizationFreshness.check({
          subjectIdentifier: input.subjectIdentifier,
          sourceDirtyVersion: facts.sourceDirtyVersion,
        });
        if (freshness.status === "not-ready")
          throw new SubjectProjectionNotReadyError();
        if (freshness.status === "refreshed") {
          if (freshness.facts.subjectIdentifier !== input.subjectIdentifier)
            throw new SubjectProjectionNotReadyError();
          facts = freshness.facts;
        }
      }

      if (input.selection.optionalClaims.includes("profile:username"))
        projection.username = facts.profile.username;
      if (input.selection.optionalClaims.includes("profile:name"))
        projection.name = facts.profile.name;
      if (input.selection.optionalClaims.includes("profile:phone"))
        projection.phone = facts.profile.phone;
      if (input.selection.optionalClaims.includes("profile:employments")) {
        projection.employments = facts.employments
          .map(toEmploymentProfile)
          .sort(compareEmploymentProfiles);
      }
      if (input.selection.optionalClaims.includes("iam:authorization"))
        projection.authorization = toClientAuthorization(facts, input.clientCode);

      return projection;
    },
  };
}

function toClientAuthorization(
  facts: SubjectFactsSnapshot,
  clientCode: string,
): ClientAuthorization {
  const topLevelRoles = new Set<string>();
  const topLevelPrivileges = new Set<string>();
  const employments = facts.employments.map((employment): ClientAuthorizationEmployment => {
    const roles = new Set<string>();
    const privileges = new Set<string>();
    for (const authorization of employment.clientAuthorizations) {
      if (authorization.clientCode !== clientCode)
        continue;
      for (const role of authorization.roles) {
        roles.add(role.code);
        topLevelRoles.add(role.code);
        for (const privilege of role.privileges) {
          privileges.add(privilege);
          topLevelPrivileges.add(privilege);
        }
      }
    }

    return {
      ...toEmploymentProfile(employment),
      roles: [...roles].sort(compareCodes),
      privileges: [...privileges].sort(compareCodes),
    };
  });

  return {
    employments: employments.sort(compareEmploymentProfiles),
    roles: [...topLevelRoles].sort(compareCodes),
    privileges: [...topLevelPrivileges].sort(compareCodes),
  };
}

function toEmploymentProfile(employment: SubjectFactsEmployment): EmploymentProfile {
  return {
    isPrimary: employment.isPrimary,
    organization: {
      code: employment.organization.code,
      name: employment.organization.name,
      type: employment.organization.type,
      path: employment.organization.path.map(organization => ({
        code: organization.code,
        name: organization.name,
        type: organization.type,
      })),
    },
    position: {
      code: employment.position.code,
      name: employment.position.name,
    },
  };
}

function compareEmploymentProfiles(left: EmploymentProfile, right: EmploymentProfile) {
  if (left.isPrimary !== right.isPrimary)
    return left.isPrimary ? -1 : 1;

  const organizationOrder = compareCodes(left.organization.code, right.organization.code);
  if (organizationOrder !== 0)
    return organizationOrder;
  return compareCodes(left.position.code, right.position.code);
}

function compareCodes(left: string, right: string) {
  if (left < right)
    return -1;
  if (left > right)
    return 1;
  return 0;
}
