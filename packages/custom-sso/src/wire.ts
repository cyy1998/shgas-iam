import type {
  ClientAuthorization,
  ClientSubjectProjection,
  ClientSubjectProjectionService,
  EmploymentProfile,
  EmploymentProfileBase,
  ResolveClientSubjectInput,
} from "@iam/client-subject-projection";
import { EmploymentResponsibilitySnapshotSchema, parseSubjectClaimSelection } from "@iam/client-subject-projection";
import type { SubjectClaimName } from "@iam/contracts";
import {
  OrganizationLevel,
  OrganizationPathNodeSchema,
  OrganizationReferenceSchema,
  SubjectClaim,
} from "@iam/contracts";
import { PublishedCustomAttributesSchema } from "@iam/contracts/custom-attributes";
import { z } from "zod";

const CUSTOM_SSO_SUBJECT_WIRE_VERSION = 5;

const CustomSsoOrganizationReferenceSchema = OrganizationReferenceSchema.safeExtend({
  path: z.array(OrganizationPathNodeSchema.strict()).min(1).max(OrganizationLevel.Five),
}).strict();

const CustomSsoPositionReferenceSchema = z.strictObject({
  code: z.string(),
  name: z.string(),
});

const CustomSsoEmploymentBaseObjectSchema = z.strictObject({
  isPrimary: z.boolean(),
  organization: CustomSsoOrganizationReferenceSchema.readonly(),
  position: CustomSsoPositionReferenceSchema.readonly(),
});

export const CustomSsoEmploymentSchema = CustomSsoEmploymentBaseObjectSchema.extend({
  organization: CustomSsoOrganizationReferenceSchema.safeExtend({
    customAttributes: PublishedCustomAttributesSchema,
  }).readonly(),
  position: CustomSsoPositionReferenceSchema.extend({
    customAttributes: PublishedCustomAttributesSchema,
  }).readonly(),
  responsibilities: z.array(EmploymentResponsibilitySnapshotSchema).readonly(),
})
  .strict()
  .readonly();

const CustomSsoAuthorizationEmploymentSchema = CustomSsoEmploymentBaseObjectSchema.extend({
  roles: z.array(z.string()).readonly(),
})
  .strict()
  .readonly();

export const CustomSsoSubjectProjectionSchema = z
  .object({
    version: z.literal(CUSTOM_SSO_SUBJECT_WIRE_VERSION),
    subjectIdentifier: z.uuid(),
    profile: z
      .object({
        username: z.string().optional(),
        name: z.string().optional(),
        phone: z.string().optional(),
        customAttributes: PublishedCustomAttributesSchema,
        employments: z.array(CustomSsoEmploymentSchema).readonly().optional(),
      })
      .strict()
      .refine((profile) => Object.values(profile).some((value) => value !== undefined), {
        message: "profile must contain at least one selected field",
      })
      .readonly()
      .optional(),
    authorization: z
      .object({
        employments: z.array(CustomSsoAuthorizationEmploymentSchema).readonly(),
        roles: z.array(z.string()).readonly(),
      })
      .strict()
      .readonly()
      .optional(),
  })
  .strict()
  .readonly();

export type CustomSsoEmployment = z.infer<typeof CustomSsoEmploymentSchema>;
export type CustomSsoSubjectProjection = z.infer<typeof CustomSsoSubjectProjectionSchema>;
export type CustomSsoSubjectProfile = NonNullable<CustomSsoSubjectProjection["profile"]>;
export type CustomSsoClientAuthorization = NonNullable<CustomSsoSubjectProjection["authorization"]>;
export type CustomSsoSubjectProjectionInvariantReason = "subject_mismatch" | "invalid_wire";

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
    return CustomSsoSubjectProjectionSchema.parse(mapClientSubjectProjectionToCustomSso(projection));
  } catch {
    throw new CustomSsoSubjectProjectionInvariantError("invalid_wire");
  }
}

const PLACEHOLDER_SUBJECT_IDENTIFIER = "00000000-0000-4000-8000-000000000001";

export function buildCustomSsoPlaceholderPreview(subjectClaims: readonly SubjectClaimName[]) {
  const selection = parseSubjectClaimSelection({
    catalogVersion: 3,
    claims: [...subjectClaims],
  });
  const selected = new Set(selection.optionalClaims);
  return CustomSsoSubjectProjectionSchema.parse({
    version: CUSTOM_SSO_SUBJECT_WIRE_VERSION,
    subjectIdentifier: PLACEHOLDER_SUBJECT_IDENTIFIER,
    ...(selected.has(SubjectClaim.ProfileUsername) ||
    selected.has(SubjectClaim.ProfileName) ||
    selected.has(SubjectClaim.ProfilePhone) ||
    selected.has(SubjectClaim.ProfileEmployments)
      ? {
          profile: {
            ...(selected.has(SubjectClaim.ProfileUsername) ? { username: "zhangsan" } : {}),
            ...(selected.has(SubjectClaim.ProfileName) ? { name: "张三" } : {}),
            ...(selected.has(SubjectClaim.ProfilePhone) ? { phone: "13800000000" } : {}),
            ...(selected.has(SubjectClaim.ProfileEmployments) ? { employments: [] } : {}),
          },
        }
      : {}),
    ...(selected.has(SubjectClaim.IamAuthorization)
      ? {
          authorization: {
            employments: [],
            roles: [],
          },
        }
      : {}),
  });
}

function mapClientSubjectProjectionToCustomSso(projection: ClientSubjectProjection): CustomSsoSubjectProjection {
  const wire: {
    version: typeof CUSTOM_SSO_SUBJECT_WIRE_VERSION;
    subjectIdentifier: string;
    profile?: CustomSsoSubjectProfile;
    authorization?: CustomSsoClientAuthorization;
  } = {
    version: CUSTOM_SSO_SUBJECT_WIRE_VERSION,
    subjectIdentifier: projection.subjectIdentifier,
  };
  const profile: { -readonly [Key in keyof CustomSsoSubjectProfile]: CustomSsoSubjectProfile[Key] } = {};
  if (projection.username !== undefined) profile.username = projection.username;
  if (projection.name !== undefined) profile.name = projection.name;
  if (projection.phone !== undefined && projection.phone !== null) profile.phone = projection.phone;
  if (projection.customAttributes !== undefined) profile.customAttributes = projection.customAttributes;
  if (projection.employments !== undefined) {
    profile.employments = projection.employments.map(mapEmploymentProfile);
  }
  if (Object.keys(profile).length > 0) wire.profile = profile;
  if (projection.authorization !== undefined) {
    wire.authorization = mapAuthorization(projection.authorization);
  }
  return wire;
}

function mapAuthorization(authorization: ClientAuthorization): CustomSsoClientAuthorization {
  return {
    employments: authorization.employments.map((employment) => ({
      ...mapEmploymentBase(employment),
      roles: [...employment.roles],
    })),
    roles: [...authorization.roles],
  };
}

function mapEmploymentProfile(employment: EmploymentProfile): CustomSsoEmployment {
  const base = mapEmploymentBase(employment);
  const organizationAttributes = employment.organization.customAttributes;
  const positionAttributes = employment.position.customAttributes;
  return {
    ...base,
    organization:
      organizationAttributes === undefined
        ? base.organization
        : { ...base.organization, customAttributes: organizationAttributes },
    position:
      positionAttributes === undefined ? base.position : { ...base.position, customAttributes: positionAttributes },
    responsibilities: employment.responsibilities.map(({ type, targetOrganization }) => ({
      type: { code: type.code, name: type.name },
      targetOrganization: {
        ...OrganizationReferenceSchema.parse(targetOrganization),
        ...(targetOrganization.customAttributes === undefined
          ? {}
          : { customAttributes: targetOrganization.customAttributes }),
      },
    })),
  };
}

function mapEmploymentBase(employment: EmploymentProfileBase) {
  return {
    isPrimary: employment.isPrimary,
    organization: OrganizationReferenceSchema.parse(employment.organization),
    position: {
      code: employment.position.code,
      name: employment.position.name,
    },
  };
}
