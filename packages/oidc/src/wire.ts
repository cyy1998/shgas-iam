import { z } from "zod";

export const OidcResponseModeSchema = z.enum(["query", "fragment", "form_post"]);
export type OidcResponseMode = z.infer<typeof OidcResponseModeSchema>;
export const OidcErrorSchema = z.object({ error: z.string(), error_description: z.string() }).strict();
export type OidcErrorResponse = z.infer<typeof OidcErrorSchema>;
export const OidcLoginGuardSchema = z.object({ decision: z.enum(["continue", "login"]) }).strict();
export const OidcReturnHandleSchema = z.string().regex(/^[\w-]{43}$/u);
export const OidcTokenResponseSchema = z.object({
  access_token: z.string(),
  token_type: z.literal("Bearer"),
  expires_in: z.number().int().positive(),
  id_token: z.string(),
  scope: z.string(),
}).strict();
export type OidcTokenResponse = z.infer<typeof OidcTokenResponseSchema>;

export const OidcAuthorizationResponseSchema = z.object({
  redirectUri: z.url(),
  responseMode: OidcResponseModeSchema,
  parameters: z.union([
    z.object({ code: z.string(), state: z.string(), iss: z.url() }).strict(),
    OidcErrorSchema.extend({ state: z.string().optional(), iss: z.url() }).strict(),
  ]),
}).strict();
export type OidcAuthorizationResponse = z.infer<typeof OidcAuthorizationResponseSchema>;
