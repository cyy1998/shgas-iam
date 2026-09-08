import { z } from "@hono/zod-openapi";
import { ApiErrorCode } from "@iam/contracts";
import {
  CustomSsoSubjectProjectionSchema,
} from "@iam/custom-sso/wire";

export const CustomSsoSubjectProjectionV2Schema
  = CustomSsoSubjectProjectionSchema.openapi(
    "CustomSsoSubjectProjectionV2",
  );

export type {
  CustomSsoSubjectProjection as CustomSsoSubjectProjectionV2Dto,
} from "@iam/custom-sso/wire";

export const CustomSsoUnavailableResponseSchema = z.object({
  code: z.union([
    z.literal(ApiErrorCode.InternalError),
    z.literal(ApiErrorCode.Maintenance),
    z.literal(ApiErrorCode.SubjectProjectionNotReady),
    z.literal(ApiErrorCode.SubjectAccessUnavailable),
  ]),
  data: z.null(),
  message: z.string(),
}).strict().openapi("CustomSsoUnavailableResponse");
