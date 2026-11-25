import jsonContent from "@iam/api-core/core/openapi/helpers/json-content";
import { CustomSsoUnavailableResponseSchema } from "@sso-api/services/sso/transport/custom-sso-subject.schema";

export function createCustomSsoUnavailableResponse(
  description: string,
  retryAfterDescription = "建议重试前等待的秒数",
) {
  return {
    ...jsonContent(CustomSsoUnavailableResponseSchema, description),
    headers: {
      "Retry-After": {
        description: retryAfterDescription,
        schema: {
          type: "string",
          pattern: "^[1-9]\\d*$",
          example: "3",
        },
      },
    },
  } as const;
}
