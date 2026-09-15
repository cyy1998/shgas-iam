import { OIDC_SUPPORTED_SCOPES, OidcScope } from "@iam/contracts";
import { z } from "zod";
import {
  OidcUserInfoClaimsSchema,
} from "./claims-contract.ts";

export const OidcScopesSchema = z.array(
  z.enum(OIDC_SUPPORTED_SCOPES),
).min(1).superRefine((scopes, context) => {
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
  version: z.literal(2),
  claimsContractVersion: z.literal(2),
  subjectIdentifier: z.uuid(),
  clientId: z.string().min(1),
  scopes: OidcScopesSchema,
  oidcConfigVersion: z.number().int().nonnegative(),
  providerSessionUid: z.string().min(1),
  principalSessionId: z.string().min(1),
  providerSessionBindingId: z.string().min(1),
  claims: OidcUserInfoClaimsSchema,
}).superRefine((snapshot, context) => {
  if (snapshot.claims.sub !== snapshot.subjectIdentifier) {
    context.addIssue({
      code: "custom",
      path: ["claims", "sub"],
      message: "OIDC snapshot subject does not match",
    });
  }

  const claims = snapshot.claims;
  const hasProfileClaim
    = claims.name !== undefined || claims.preferred_username !== undefined;
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
  if (claims.phone_number !== undefined
    && !snapshot.scopes.includes(OidcScope.Phone)) {
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
      message: "OIDC employments claim requires its scope",
    });
  }
  if (snapshot.scopes.includes(OidcScope.IamEmployments)
    && claims[OidcScope.IamEmployments] === undefined) {
    context.addIssue({
      code: "custom",
      path: ["claims", "iam:employments"],
      message: "OIDC employments scope requires its claim",
    });
  }
  if (claims[OidcScope.IamAuthorization] !== undefined
    && !snapshot.scopes.includes(OidcScope.IamAuthorization)) {
    context.addIssue({
      code: "custom",
      path: ["claims", "iam:authorization"],
      message: "OIDC authorization claim requires its scope",
    });
  }
  if (snapshot.scopes.includes(OidcScope.IamAuthorization)
    && claims[OidcScope.IamAuthorization] === undefined) {
    context.addIssue({
      code: "custom",
      path: ["claims", "iam:authorization"],
      message: "OIDC authorization scope requires its claim",
    });
  }
});
