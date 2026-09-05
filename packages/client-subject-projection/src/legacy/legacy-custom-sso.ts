import type { SubjectClaimName } from "@iam/contracts";
import type {
  ClientSubjectProjection,
  ClientSubjectProjectionService,
  EmploymentProfile,
  ResolveClientSubjectInput,
} from "./legacy-maintenance";
import { SubjectClaim } from "@iam/contracts";
import { z } from "zod";
import { parseSubjectClaimSelection } from "./legacy-maintenance";

const placeholderSubjectIdentifier = "00000000-0000-4000-8000-000000000001";

const CustomSsoOrganizationV1ObjectSchema = z.object({
  code: z.string(),
  name: z.string(),
  type: z.string(),
}).strict();

export const CustomSsoOrganizationV1Schema
  = CustomSsoOrganizationV1ObjectSchema.readonly();

const CustomSsoEmploymentV1ObjectSchema = z.object({
  isPrimary: z.boolean(),
  organization: CustomSsoOrganizationV1ObjectSchema.extend({
    path: z.array(CustomSsoOrganizationV1Schema).readonly(),
  }).readonly(),
  position: z.object({
    code: z.string(),
    name: z.string(),
  }).strict().readonly(),
}).strict();

export const CustomSsoEmploymentV1Schema
  = CustomSsoEmploymentV1ObjectSchema.readonly();

const CustomSsoAuthorizationEmploymentV1Schema
  = CustomSsoEmploymentV1ObjectSchema.extend({
    roles: z.array(z.string()).readonly(),
    privileges: z.array(z.string()).readonly(),
  }).readonly();

export const CustomSsoSubjectProjectionV1Schema = z.object({
  version: z.literal(1),
  subjectIdentifier: z.uuid(),
  profile: z.object({
    username: z.string().optional(),
    name: z.string().optional(),
    phone: z.string().optional(),
    employments: z.array(CustomSsoEmploymentV1Schema).readonly().optional(),
  }).strict().refine(
    profile => Object.values(profile).some(value => value !== undefined),
    { message: "profile must contain at least one selected field" },
  ).meta({ minProperties: 1 }).readonly().optional(),
  authorization: z.object({
    employments: z.array(CustomSsoAuthorizationEmploymentV1Schema).readonly(),
    roles: z.array(z.string()).readonly(),
    privileges: z.array(z.string()).readonly(),
  }).strict().readonly().optional(),
}).strict().readonly();

export type CustomSsoOrganizationV1
  = z.infer<typeof CustomSsoOrganizationV1Schema>;

export type CustomSsoEmploymentV1
  = z.infer<typeof CustomSsoEmploymentV1Schema>;

export type CustomSsoSubjectProjectionV1
  = z.infer<typeof CustomSsoSubjectProjectionV1Schema>;

export type CustomSsoSubjectProfileV1 = NonNullable<
  CustomSsoSubjectProjectionV1["profile"]
>;

export type CustomSsoClientAuthorizationV1 = NonNullable<
  CustomSsoSubjectProjectionV1["authorization"]
>;

export type CustomSsoAuthorizationEmploymentV1
  = CustomSsoClientAuthorizationV1["employments"][number];

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

export async function resolveCustomSsoSubjectProjectionV1(
  service: ClientSubjectProjectionService,
  input: ResolveClientSubjectInput,
): Promise<CustomSsoSubjectProjectionV1> {
  const projection = await service.resolve(input);
  if (projection.subjectIdentifier !== input.subjectIdentifier) {
    throw new CustomSsoSubjectProjectionInvariantError("subject_mismatch");
  }
  try {
    return CustomSsoSubjectProjectionV1Schema.parse(
      mapClientSubjectProjectionToCustomSsoV1(projection),
    );
  }
  catch {
    throw new CustomSsoSubjectProjectionInvariantError("invalid_wire");
  }
}

function mapClientSubjectProjectionToCustomSsoV1(
  projection: ClientSubjectProjection,
): CustomSsoSubjectProjectionV1 {
  const wire: {
    version: 1;
    subjectIdentifier: string;
    profile?: CustomSsoSubjectProfileV1;
    authorization?: CustomSsoClientAuthorizationV1;
  } = {
    version: 1,
    subjectIdentifier: projection.subjectIdentifier,
  };
  const profile: {
    username?: string;
    name?: string;
    phone?: string;
    employments?: readonly CustomSsoEmploymentV1[];
  } = {};
  if (projection.username !== undefined)
    profile.username = projection.username;
  if (projection.name !== undefined)
    profile.name = projection.name;
  if (projection.phone !== undefined && projection.phone !== null)
    profile.phone = projection.phone;
  if (projection.employments !== undefined)
    profile.employments = projection.employments.map(mapEmploymentProfile);
  if (Object.keys(profile).length > 0)
    wire.profile = profile;
  if (projection.authorization !== undefined) {
    wire.authorization = {
      employments: projection.authorization.employments.map(employment => ({
        ...mapEmploymentProfile(employment),
        roles: [...employment.roles],
        privileges: [...employment.privileges],
      })),
      roles: [...projection.authorization.roles],
      privileges: [...projection.authorization.privileges],
    };
  }

  return wire;
}

export function buildCustomSsoPlaceholderPreviewV1(
  subjectClaims: readonly SubjectClaimName[],
): CustomSsoSubjectProjectionV1 {
  const selection = parseSubjectClaimSelection({
    catalogVersion: 1,
    claims: [...subjectClaims],
  });
  const selected = new Set(selection.optionalClaims);
  const projection: ClientSubjectProjection = {
    subjectIdentifier: placeholderSubjectIdentifier,
    ...(selected.has(SubjectClaim.ProfileUsername) ? { username: "zhangsan" } : {}),
    ...(selected.has(SubjectClaim.ProfileName) ? { name: "张三" } : {}),
    ...(selected.has(SubjectClaim.ProfilePhone) ? { phone: "13800000000" } : {}),
    ...(selected.has(SubjectClaim.ProfileEmployments) ? { employments: [] } : {}),
    ...(selected.has(SubjectClaim.IamAuthorization)
      ? {
          authorization: {
            employments: [],
            roles: [],
            privileges: [],
          },
        }
      : {}),
  };

  return mapClientSubjectProjectionToCustomSsoV1(projection);
}

function mapEmploymentProfile(employment: EmploymentProfile): CustomSsoEmploymentV1 {
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
