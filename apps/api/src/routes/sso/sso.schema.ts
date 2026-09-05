import {
  CustomSsoSubjectProjectionV2Schema,
} from "@api/services/sso/transport/custom-sso-subject.schema";
import { z } from "@hono/zod-openapi";
import { LoginPageGuardDecision } from "@iam/contracts";

export const LoginPageGuardResultSchema = z.object({
  decision: z.enum([
    LoginPageGuardDecision.Continue,
    LoginPageGuardDecision.Login,
  ]),
}).strict().openapi("LoginPageGuardResult");

export const SSOMetaInfoSchema = z.object({
  authorizationEndpoint: z.url().openapi({
    description: "Authorize endpoint composed from the selected SSO public origin and IAM_API_AUTHORIZATION_ENDPOINT.",
    example: "https://iam.example.com/sso/authorize",
  }),
  logoutEndpoint: z.url().openapi({
    description: "Logout endpoint composed from the selected SSO public origin and IAM_API_LOGOUT_ENDPOINT.",
    example: "https://iam.example.com/sso/logout",
  }),
  thirdPartyOAEndpoint: z.url().openapi({
    description: "Third-party OA endpoint composed from the selected SSO public origin and IAM_API_THIRDPARTY_OA_ENDPOINT.",
    example: "https://iam.example.com/sso/thirdparty/oa",
  }),
}).openapi("SSOMetaInfo");

export const SsoTokenResultSchema = z.object({
  sid: z.string().min(1),
  ttl: z.number().int().positive(),
  subject: CustomSsoSubjectProjectionV2Schema,
}).strict().openapi("SsoTokenResult");
