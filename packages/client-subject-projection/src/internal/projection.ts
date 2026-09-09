import type {
  EmploymentProfileBase,
  SubjectFactsEmploymentBase,
} from "../index";
import type {
  ClientAuthorization,
  ClientAuthorizationEmployment,
  ClientSubjectProjection,
  CreatePermittedClientSubjectProjectionServiceOptions,
  EmploymentProfile,
  PermittedClientSubjectProjectionService,
  ProjectionFactsOptions,
  ResolveClientSubjectInput,
  SubjectFactsEmployment,
  SubjectFactsSnapshot,
} from "./contract";
import { SubjectClaim } from "@iam/contracts";
import { z } from "zod";
import { SubjectProjectionNotReadyError } from "../errors";
import { assertSubjectClaimSelection } from "./catalog";
import { EmploymentResponsibilitySnapshotSchema } from "./contract";

export function createPermittedClientSubjectProjectionService<Permission>(
  options: CreatePermittedClientSubjectProjectionServiceOptions<Permission>,
): PermittedClientSubjectProjectionService<Permission> {
  return {
    async resolve(input, permission) {
      options.assertPermission(permission, input.subjectIdentifier);
      return resolveProjection(input, options);
    },
  };
}

async function resolveProjection(
  input: ResolveClientSubjectInput,
  options: ProjectionFactsOptions,
): Promise<ClientSubjectProjection> {
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

  const facts = await options.subjectFacts.read(input.subjectIdentifier);
  if (facts === null || facts.subjectIdentifier !== input.subjectIdentifier)
    throw new SubjectProjectionNotReadyError();

  if (input.selection.optionalClaims.includes(SubjectClaim.ProfileUsername))
    projection.username = facts.profile.username;
  if (input.selection.optionalClaims.includes(SubjectClaim.ProfileName))
    projection.name = facts.profile.name;
  if (input.selection.optionalClaims.includes(SubjectClaim.ProfilePhone))
    projection.phone = facts.profile.phone;
  if (input.selection.optionalClaims.includes(SubjectClaim.ProfileEmployments)) {
    projection.employments = facts.employments
      .map(toEmploymentProfileWithResponsibilities)
      .sort(compareEmploymentProfiles);
  }
  if (input.selection.optionalClaims.includes(SubjectClaim.IamAuthorization)) {
    projection.authorization = toClientAuthorization(
      facts,
      input.clientCode,
    );
  }

  return projection;
}

function toEmploymentProfileWithResponsibilities(
  employment: SubjectFactsEmployment,
): EmploymentProfile {
  return {
    ...toEmploymentProfile(employment),
    responsibilities: z.array(EmploymentResponsibilitySnapshotSchema)
      .parse(employment.responsibilities),
  };
}

function toClientAuthorization(
  facts: SubjectFactsSnapshot,
  clientCode: string,
): ClientAuthorization {
  const topLevelRoles = new Set<string>();
  const topLevelPrivileges = new Set<string>();
  const employments = facts.employments.map(
    (employment): ClientAuthorizationEmployment => {
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
    },
  );

  return {
    employments: employments.sort(compareEmploymentProfiles),
    roles: [...topLevelRoles].sort(compareCodes),
    privileges: [...topLevelPrivileges].sort(compareCodes),
  };
}

function toEmploymentProfile(
  employment: SubjectFactsEmploymentBase,
): EmploymentProfileBase {
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

function compareEmploymentProfiles(
  left: EmploymentProfileBase,
  right: EmploymentProfileBase,
) {
  if (left.isPrimary !== right.isPrimary)
    return left.isPrimary ? -1 : 1;

  const organizationOrder = compareCodes(
    left.organization.code,
    right.organization.code,
  );
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
