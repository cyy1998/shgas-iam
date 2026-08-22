import type { SubjectClaimName } from "@iam/contracts";
import type {
  ClientAuthorization,
  ClientSubjectProjection,
  ClientSubjectProjectionService,
  EmploymentProfile,
  EmploymentProfileBase,
  ResolveClientSubjectInput,
} from "./index";
import { SubjectClaim } from "@iam/contracts";
import { z } from "zod";
import {
  EmploymentResponsibilitySnapshotSchema,
  parseSubjectClaimSelection,
} from "./index";

const CustomSsoOrganizationObjectSchema = z.object({
  code: z.string(),
  name: z.string(),
  type: z.string(),
}).strict();

export const CustomSsoOrganizationSchema
  = CustomSsoOrganizationObjectSchema.readonly();

const CustomSsoEmploymentBaseObjectSchema = z.object({
  isPrimary: z.boolean(),
  organization: CustomSsoOrganizationObjectSchema.extend({
    path: z.array(CustomSsoOrganizationSchema).readonly(),
  }).readonly(),
  position: z.object({
    code: z.string(),
    name: z.string(),
  }).strict().readonly(),
}).strict();

export const CustomSsoEmploymentSchema
  = CustomSsoEmploymentBaseObjectSchema.extend({
    responsibilities: z.array(
      EmploymentResponsibilitySnapshotSchema,
    ).readonly(),
  }).strict().readonly();

const CustomSsoAuthorizationEmploymentSchema
  = CustomSsoEmploymentBaseObjectSchema.extend({
    roles: z.array(z.string()).readonly(),
    privileges: z.array(z.string()).readonly(),
  }).strict().readonly();

export const CustomSsoSubjectProjectionSchema = z.object({
  version: z.literal(2),
  subjectIdentifier: z.uuid(),
  profile: z.object({
    username: z.string().optional(),
    name: z.string().optional(),
    phone: z.string().optional(),
    employments: z.array(CustomSsoEmploymentSchema).readonly().optional(),
  }).strict().refine(
    profile => Object.values(profile).some(value => value !== undefined),
    { message: "profile must contain at least one selected field" },
  ).readonly().optional(),
  authorization: z.object({
    employments: z.array(CustomSsoAuthorizationEmploymentSchema).readonly(),
    roles: z.array(z.string()).readonly(),
    privileges: z.array(z.string()).readonly(),
  }).strict().readonly().optional(),
}).strict().readonly();

export type CustomSsoEmployment = z.infer<typeof CustomSsoEmploymentSchema>;
export type CustomSsoSubjectProjection = z.infer<
  typeof CustomSsoSubjectProjectionSchema
>;
export type CustomSsoSubjectProfile = NonNullable<
  CustomSsoSubjectProjection["profile"]
>;
export type CustomSsoClientAuthorization = NonNullable<
  CustomSsoSubjectProjection["authorization"]
>;
export type CustomSsoSubjectProjectionInvariantReason
  = | "subject_mismatch"
    | "invalid_wire";

export class CustomSsoSubjectProjectionInvariantError extends Error {
  readonly reason: CustomSsoSubjectProjectionInvariantReason;

  constructor(reason: CustomSsoSubjectProjectionInvariantReason) {
    super(`Custom SSO subject projection invariant failed: ${reason}`);
    this.name = "CustomSsoSubjectProjectionInvariantError";
    this.reason = reason;
  }
}

export async function resolveCustomSsoSubjectProjection(
  service: ClientSubjectProjectionService,
  input: ResolveClientSubjectInput,
): Promise<CustomSsoSubjectProjection> {
  const projection = await service.resolve(input);
  if (projection.subjectIdentifier !== input.subjectIdentifier) {
    throw new CustomSsoSubjectProjectionInvariantError("subject_mismatch");
  }
  try {
    return CustomSsoSubjectProjectionSchema.parse(
      mapClientSubjectProjectionToCustomSso(projection),
    );
  }
  catch {
    throw new CustomSsoSubjectProjectionInvariantError("invalid_wire");
  }
}

const PLACEHOLDER_SUBJECT_IDENTIFIER
  = "00000000-0000-4000-8000-000000000001";

export function buildCustomSsoPlaceholderPreview(
  subjectClaims: readonly SubjectClaimName[],
) {
  const selection = parseSubjectClaimSelection({
    catalogVersion: 2,
    claims: [...subjectClaims],
  });
  const selected = new Set(selection.optionalClaims);
  return CustomSsoSubjectProjectionSchema.parse({
    version: 2,
    subjectIdentifier: PLACEHOLDER_SUBJECT_IDENTIFIER,
    ...(selected.has(SubjectClaim.ProfileUsername)
      || selected.has(SubjectClaim.ProfileName)
      || selected.has(SubjectClaim.ProfilePhone)
      || selected.has(SubjectClaim.ProfileEmployments)
      ? {
          profile: {
            ...(selected.has(SubjectClaim.ProfileUsername)
              ? { username: "zhangsan" }
              : {}),
            ...(selected.has(SubjectClaim.ProfileName)
              ? { name: "张三" }
              : {}),
            ...(selected.has(SubjectClaim.ProfilePhone)
              ? { phone: "13800000000" }
              : {}),
            ...(selected.has(SubjectClaim.ProfileEmployments)
              ? { employments: [] }
              : {}),
          },
        }
      : {}),
    ...(selected.has(SubjectClaim.IamAuthorization)
      ? {
          authorization: {
            employments: [],
            roles: [],
            privileges: [],
          },
        }
      : {}),
  });
}

function mapClientSubjectProjectionToCustomSso(
  projection: ClientSubjectProjection,
): CustomSsoSubjectProjection {
  const wire: {
    version: 2;
    subjectIdentifier: string;
    profile?: CustomSsoSubjectProfile;
    authorization?: CustomSsoClientAuthorization;
  } = {
    version: 2,
    subjectIdentifier: projection.subjectIdentifier,
  };
  const profile: {
    username?: string;
    name?: string;
    phone?: string;
    employments?: readonly CustomSsoEmployment[];
  } = {};
  if (projection.username !== undefined)
    profile.username = projection.username;
  if (projection.name !== undefined)
    profile.name = projection.name;
  if (projection.phone !== undefined && projection.phone !== null)
    profile.phone = projection.phone;
  if (projection.employments !== undefined) {
    profile.employments = projection.employments.map(mapEmploymentProfile);
  }
  if (Object.keys(profile).length > 0)
    wire.profile = profile;
  if (projection.authorization !== undefined) {
    wire.authorization = mapAuthorization(projection.authorization);
  }
  return wire;
}

function mapAuthorization(
  authorization: ClientAuthorization,
): CustomSsoClientAuthorization {
  return {
    employments: authorization.employments.map(employment => ({
      ...mapEmploymentBase(employment),
      roles: [...employment.roles],
      privileges: [...employment.privileges],
    })),
    roles: [...authorization.roles],
    privileges: [...authorization.privileges],
  };
}

function mapEmploymentProfile(
  employment: EmploymentProfile,
): CustomSsoEmployment {
  return {
    ...mapEmploymentBase(employment),
    responsibilities: employment.responsibilities.map(responsibility => ({
      type: {
        code: responsibility.type.code,
        name: responsibility.type.name,
      },
      targetOrganization: {
        code: responsibility.targetOrganization.code,
        name: responsibility.targetOrganization.name,
        type: responsibility.targetOrganization.type,
        path: responsibility.targetOrganization.path.map(organization => ({
          code: organization.code,
          name: organization.name,
          type: organization.type,
        })),
      },
    })),
  };
}

function mapEmploymentBase(employment: EmploymentProfileBase) {
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
