import type { UnknownObject } from "oidc-provider";
import { OIDC_SUPPORTED_SCOPES, OidcScope } from "@iam/contracts";
import { z } from "zod";

const NonEmptyStringsSchema = z.array(z.string().min(1));
const OrganizationNodeSchema = z.strictObject({
  orgCode: z.string(),
  orgName: z.string(),
  orgType: z.string(),
});
const EmploymentSchema = z.strictObject({
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
const AuthorizationEmploymentSchema = z.strictObject({
  ...EmploymentSchema.shape,
  roles: NonEmptyStringsSchema,
  privileges: NonEmptyStringsSchema,
});

export const OidcUserInfoSnapshotSchema = z.strictObject({
  sub: z.string().min(1),
  preferred_username: z.string().optional(),
  name: z.string().optional(),
  phone_number: z.string().optional(),
  [OidcScope.IamEmployments]: z.array(EmploymentSchema).optional(),
  [OidcScope.IamAuthorization]: z.strictObject({
    employments: z.array(AuthorizationEmploymentSchema),
    roles: NonEmptyStringsSchema,
    privileges: NonEmptyStringsSchema,
  }).optional(),
});

export const OidcScopesSchema = z.array(z.enum(OIDC_SUPPORTED_SCOPES)).min(1).superRefine((scopes, context) => {
  if (new Set(scopes).size !== scopes.length) {
    context.addIssue({
      code: "custom",
      message: "OIDC snapshot scopes must be unique",
    });
  }
  if (!scopes.includes(OidcScope.OpenId)) {
    context.addIssue({
      code: "custom",
      message: "OIDC snapshot must include openid",
    });
  }
});

export const OidcClaimsSnapshotSchema = z.strictObject({
  version: z.literal(1),
  subjectIdentifier: z.uuid(),
  clientId: z.string().min(1),
  scopes: OidcScopesSchema,
  oidcConfigVersion: z.number().int().nonnegative(),
  providerSessionUid: z.string().min(1),
  principalSessionId: z.string().min(1),
  providerSessionBindingId: z.string().min(1),
  claims: OidcUserInfoSnapshotSchema,
}).superRefine((snapshot, context) => {
  if (snapshot.claims.sub !== snapshot.subjectIdentifier) {
    context.addIssue({
      code: "custom",
      path: ["claims", "sub"],
      message: "OIDC snapshot subject does not match",
    });
  }

  const claims = snapshot.claims;
  const hasProfileClaim = claims.name !== undefined || claims.preferred_username !== undefined;
  if (hasProfileClaim && !snapshot.scopes.includes(OidcScope.Profile)) {
    context.addIssue({
      code: "custom",
      path: ["claims"],
      message: "OIDC profile claims require the profile scope",
    });
  }
  if (snapshot.scopes.includes(OidcScope.Profile)
    && (claims.name === undefined || claims.preferred_username === undefined)) {
    context.addIssue({
      code: "custom",
      path: ["claims"],
      message: "OIDC profile scope requires both profile claims",
    });
  }
  if (claims.phone_number !== undefined && !snapshot.scopes.includes(OidcScope.Phone)) {
    context.addIssue({
      code: "custom",
      path: ["claims", "phone_number"],
      message: "OIDC phone claim requires the phone scope",
    });
  }
  if (claims[OidcScope.IamEmployments] !== undefined
    && !snapshot.scopes.includes(OidcScope.IamEmployments)) {
    context.addIssue({
      code: "custom",
      path: ["claims", "iam:employments"],
      message: "OIDC employments claim requires the iam:employments scope",
    });
  }
  if (snapshot.scopes.includes(OidcScope.IamEmployments)
    && claims[OidcScope.IamEmployments] === undefined) {
    context.addIssue({
      code: "custom",
      path: ["claims", "iam:employments"],
      message: "OIDC iam:employments scope requires the employments claim",
    });
  }
  if (claims[OidcScope.IamAuthorization] !== undefined
    && !snapshot.scopes.includes(OidcScope.IamAuthorization)) {
    context.addIssue({
      code: "custom",
      path: ["claims", "iam:authorization"],
      message: "OIDC authorization claim requires the iam:authorization scope",
    });
  }
  if (snapshot.scopes.includes(OidcScope.IamAuthorization)
    && claims[OidcScope.IamAuthorization] === undefined) {
    context.addIssue({
      code: "custom",
      path: ["claims", "iam:authorization"],
      message: "OIDC iam:authorization scope requires the authorization claim",
    });
  }
});

export type OidcUserInfoSnapshot = UnknownObject & z.infer<typeof OidcUserInfoSnapshotSchema>;

export type OidcClaimsSnapshot = Omit<z.infer<typeof OidcClaimsSnapshotSchema>, "claims"> & {
  claims: OidcUserInfoSnapshot;
};

export interface CreateOidcAuthorizationCodeSnapshotInput {
  subjectIdentifier: string;
  clientId: string;
  scopes: OidcScope[];
  oidcConfigVersion: number;
  providerSessionUid: string;
  principalSessionId: string;
  providerSessionBindingId: string;
}

export function parseOidcClaimsSnapshot(input: unknown): OidcClaimsSnapshot | null {
  const parsed = OidcClaimsSnapshotSchema.safeParse(input);
  return parsed.success ? parsed.data as OidcClaimsSnapshot : null;
}
