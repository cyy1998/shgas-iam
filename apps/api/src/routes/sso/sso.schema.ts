import { z } from "@hono/zod-openapi";

export const SSOMetaInfoSchema = z.object({
  authorizationEndpoint: z.url().openapi({
    description: "Authorize endpoint composed from the selected SSO public origin and AUTHORIZATION_ENDPOINT.",
    example: "https://iam.example.com/sso/authorize",
  }),
  logoutEndpoint: z.url().openapi({
    description: "Logout endpoint composed from the selected SSO public origin and LOGOUT_ENDPOINT.",
    example: "https://iam.example.com/sso/logout",
  }),
  thirdPartyOAEndpoint: z.url().openapi({
    description: "Third-party OA endpoint composed from the selected SSO public origin and THIRDPARTY_OA_ENDPOINT.",
    example: "https://iam.example.com/sso/thirdparty/oa",
  }),
}).openapi("SSOMetaInfo");
