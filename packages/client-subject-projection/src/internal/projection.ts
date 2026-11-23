import { OrganizationReferenceSchema, SubjectClaim } from "@iam/contracts";
import type { CustomAttributeValues } from "@iam/contracts/custom-attributes";
import { z } from "zod";
import { SubjectProjectionNotReadyError } from "../errors";
import type { EmploymentProfileBase, SubjectFactsEmploymentBase } from "../index";
import { assertSubjectClaimSelection } from "./catalog";
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
    customAttributes?: CustomAttributeValues;
    employments?: EmploymentProfile[];
    authorization?: ClientAuthorization;
  } = {
    subjectIdentifier: input.subjectIdentifier,
  };
  if (!input.includeCustomAttributes && input.selection.optionalClaims.length === 0) return projection;

  const facts = await options.subjectFacts.read(input.subjectIdentifier);
  if (facts === null || facts.subjectIdentifier !== input.subjectIdentifier) throw new SubjectProjectionNotReadyError();

  if (input.selection.optionalClaims.includes(SubjectClaim.ProfileUsername))
    projection.username = facts.profile.username;
  if (input.selection.optionalClaims.includes(SubjectClaim.ProfileName)) projection.name = facts.profile.name;
  if (input.selection.optionalClaims.includes(SubjectClaim.ProfilePhone)) projection.phone = facts.profile.phone;
  if (input.includeCustomAttributes && facts.profile.customAttributes !== undefined) {
    projection.customAttributes = facts.profile.customAttributes;
  }
  if (input.selection.optionalClaims.includes(SubjectClaim.ProfileEmployments)) {
    projection.employments = facts.employments
      .map((employment) => toEmploymentProfile(employment, input.includeCustomAttributes))
      .sort(compareEmploymentProfiles);
  }
  if (input.selection.optionalClaims.includes(SubjectClaim.IamAuthorization)) {
    projection.authorization = toClientAuthorization(facts, input.clientCode);
  }

  return projection;
}

function toEmploymentProfile(employment: SubjectFactsEmployment, includeCustomAttributes = false): EmploymentProfile {
  const profile = toEmploymentBase(employment);
  return {
    ...profile,
    organization: withCustomAttributes(
      profile.organization,
      includeCustomAttributes ? employment.organization.customAttributes : undefined,
    ),
    position: withCustomAttributes(
      profile.position,
      includeCustomAttributes ? employment.position.customAttributes : undefined,
    ),
    responsibilities: z.array(EmploymentResponsibilitySnapshotSchema).parse(
      employment.responsibilities.map((responsibility) => ({
        type: responsibility.type,
        targetOrganization: OrganizationReferenceSchema.parse(responsibility.targetOrganization),
      })),
    ),
  };
}

function withCustomAttributes<T>(reference: T, customAttributes: CustomAttributeValues | undefined) {
  return customAttributes === undefined ? reference : { ...reference, customAttributes };
}

function toClientAuthorization(facts: SubjectFactsSnapshot, clientCode: string): ClientAuthorization {
  const topLevelRoles = new Set<string>();
  const employments = facts.employments.map((employment): ClientAuthorizationEmployment => {
    const roles = new Set(employment.globalRoles?.map((role) => role.code));
    for (const authorization of employment.clientAuthorizations) {
      if (authorization.clientCode !== clientCode) continue;
      for (const role of authorization.roles) {
        roles.add(role.code);
      }
    }
    for (const code of roles) topLevelRoles.add(code);

    return {
      ...toEmploymentBase(employment),
      roles: [...roles].sort(compareCodes),
    };
  });

  return {
    employments: employments.sort(compareEmploymentProfiles),
    roles: [...topLevelRoles].sort(compareCodes),
  };
}

function toEmploymentBase(employment: SubjectFactsEmploymentBase): EmploymentProfileBase {
  return {
    isPrimary: employment.isPrimary,
    organization: OrganizationReferenceSchema.parse(employment.organization),
    position: {
      code: employment.position.code,
      name: employment.position.name,
    },
  };
}

function compareEmploymentProfiles(left: EmploymentProfileBase, right: EmploymentProfileBase) {
  if (left.isPrimary !== right.isPrimary) return left.isPrimary ? -1 : 1;

  const organizationOrder = compareCodes(left.organization.code, right.organization.code);
  if (organizationOrder !== 0) return organizationOrder;
  return compareCodes(left.position.code, right.position.code);
}

function compareCodes(left: string, right: string) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
