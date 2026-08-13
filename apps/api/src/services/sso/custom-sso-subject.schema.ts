import { z } from "@hono/zod-openapi";
import {
  CustomSsoSubjectProjectionV1Schema as SharedCustomSsoSubjectProjectionV1Schema,
} from "@iam/client-subject-projection/custom-sso";
import { ApiErrorCode } from "@iam/contracts";

export const CustomSsoSubjectProjectionV1Schema
  = SharedCustomSsoSubjectProjectionV1Schema.openapi(
    "CustomSsoSubjectProjectionV1",
  );

export type {
  CustomSsoSubjectProjectionV1 as CustomSsoSubjectProjectionV1Dto,
} from "@iam/client-subject-projection/custom-sso";

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
