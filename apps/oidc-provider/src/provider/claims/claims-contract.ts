import {
  EmploymentResponsibilitySnapshotSchema,
} from "@iam/client-subject-projection";
import {
  OidcScope,
} from "@iam/contracts";
import { z } from "zod";

const NonEmptyStringsSchema = z.array(z.string().min(1));

const OrganizationNodeSchema = z.strictObject({
  orgCode: z.string(),
  orgName: z.string(),
  orgType: z.string(),
});

const EmploymentBaseSchema = z.strictObject({
  isPrimary: z.boolean(),
  organization: z.strictObject({
    ...OrganizationNodeSchema.shape,
    fullOrgPath: z.array(OrganizationNodeSchema),
  }),
  position: z.strictObject({
    posCode: z.string(),
    posName: z.string(),
  }),
});

export const OidcEmploymentSchema
  = EmploymentBaseSchema.extend({
    responsibilities: z.array(EmploymentResponsibilitySnapshotSchema),
  }).strict();

const OidcAuthorizationEmploymentSchema
  = EmploymentBaseSchema.extend({
    roles: NonEmptyStringsSchema,
    privileges: NonEmptyStringsSchema,
  }).strict();

export const OidcUserInfoClaimsSchema = z.strictObject({
  sub: z.string().min(1),
  preferred_username: z.string().optional(),
  name: z.string().optional(),
  phone_number: z.string().optional(),
  [OidcScope.IamEmployments]: z.array(OidcEmploymentSchema)
    .optional(),
  [OidcScope.IamAuthorization]: z.strictObject({
    employments: z.array(OidcAuthorizationEmploymentSchema),
    roles: NonEmptyStringsSchema,
    privileges: NonEmptyStringsSchema,
  }).optional(),
});

export type OidcUserInfoClaims = z.infer<
  typeof OidcUserInfoClaimsSchema
>;
