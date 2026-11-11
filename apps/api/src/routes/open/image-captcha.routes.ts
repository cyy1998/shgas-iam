import { getApiAuditRequestContext } from "@api/services/audit/audit.context";
import type { ImageCaptchaService } from "@api/services/human-verification/image-captcha.service";
import { createRoute, z } from "@hono/zod-openapi";
import { createRouter } from "@iam/api-core/core/create-router";
import { commonErrorResponses } from "@iam/api-core/core/openapi/helpers/common-error-responses";
import jsonContent from "@iam/api-core/core/openapi/helpers/json-content";
import jsonContentRequired from "@iam/api-core/core/openapi/helpers/json-content-required";
import createSuccessResponseSchema from "@iam/api-core/core/openapi/schemas/create-success-schema";
import { StandardErrorResponseSchema } from "@iam/api-core/core/openapi/schemas/error-response-schema";
import * as resp from "@iam/api-core/http";
import { ImageCaptchaAnswerSchema, ImageCaptchaChallengeSchema } from "@iam/contracts";
import { OK, TOO_MANY_REQUESTS } from "@iam/contracts/http";

const ticketInput = z.object({ ticket: z.string().max(160) });
const errors = {
  ...commonErrorResponses,
  [TOO_MANY_REQUESTS]: {
    ...jsonContent(StandardErrorResponseSchema, "图片验证码请求过于频繁"),
    headers: { "Retry-After": { schema: { type: "integer" as const, minimum: 1 } } },
  },
};

const imageChallenge = createRoute({
  method: "post",
  path: "/image-captcha/challenge",
  tags: ["Open"],
  request: { body: jsonContentRequired(ticketInput, "人机校验票据") },
  responses: {
    ...errors,
    [OK]: jsonContent(createSuccessResponseSchema(ImageCaptchaChallengeSchema), "图片验证码"),
  },
});

const imageAnswer = createRoute({
  method: "post",
  path: "/image-captcha/answer",
  tags: ["Open"],
  request: {
    body: jsonContentRequired(
      ticketInput.extend({
        challengeId: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
        answer: z.string().min(1).max(32),
      }),
      "图片验证码答案",
    ),
  },
  responses: {
    ...errors,
    [OK]: jsonContent(createSuccessResponseSchema(ImageCaptchaAnswerSchema), "图片验证码校验结果"),
  },
});

export function createImageCaptchaRoutes(service: Pick<ImageCaptchaService, "createChallenge" | "verifyAnswer">) {
  return createRouter()
    .openapi(imageChallenge, async (c) => {
      const { ticket } = c.req.valid("json");
      const { ip } = getApiAuditRequestContext(c);
      c.header("Cache-Control", "no-store");
      return c.json(resp.ok(await service.createChallenge(ticket, ip ?? undefined)), OK);
    })
    .openapi(imageAnswer, async (c) => {
      const { ticket, challengeId, answer } = c.req.valid("json");
      const { ip } = getApiAuditRequestContext(c);
      c.header("Cache-Control", "no-store");
      return c.json(resp.ok(await service.verifyAnswer(ticket, challengeId, answer, ip ?? undefined)), OK);
    });
}
