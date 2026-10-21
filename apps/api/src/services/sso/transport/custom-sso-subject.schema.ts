import { z } from "@hono/zod-openapi";
import { ApiErrorCode } from "@iam/contracts";
import { CustomSsoSubjectProjectionSchema as WireCustomSsoSubjectProjectionSchema } from "@iam/custom-sso/wire";

export const CustomSsoSubjectProjectionSchema = z
  .readonly(WireCustomSsoSubjectProjectionSchema)
  .openapi("CustomSsoSubjectProjectionV3");

export type { CustomSsoSubjectProjection as CustomSsoSubjectProjectionDto } from "@iam/custom-sso/wire";

export const CustomSsoUnavailableResponseSchema = z
  .object({
    code: z.union([
      z.literal(ApiErrorCode.InternalError),
      z.literal(ApiErrorCode.Maintenance),
      z.literal(ApiErrorCode.SubjectProjectionNotReady),
      z.literal(ApiErrorCode.SubjectAccessUnavailable),
    ]),
    data: z.null(),
    message: z.string(),
  })
  .strict()
  .openapi("CustomSsoUnavailableResponse");
