import { z } from "@hono/zod-openapi";

export const SSOMetaInfoSchema = z.object({
  authorizationEndpoint: z.url().openapi({ example: "http://176.169.99.150/sso/authorize" }),
  logoutEndpoint: z.url().openapi({ example: "http://176.169.99.150/sso/logout" }),
  thirdPartyOAEndpoint: z.url().openapi({ example: "http://176.169.99.150/sso/third-party/oa" }),
}).openapi("SSOMetaInfo");




