import { HumanVerificationRequiredError } from "@api/services/human-verification/human-verification.error";
import { IMAGE_CAPTCHA_TICKET_HEADER } from "@iam/contracts";
import type { Context } from "hono";

export function exposeImageCaptchaTicket(context: Pick<Context, "header">, error: unknown): never {
  if (error instanceof HumanVerificationRequiredError && error.imageCaptchaTicket) {
    context.header(IMAGE_CAPTCHA_TICKET_HEADER, error.imageCaptchaTicket);
    context.header("Cache-Control", "no-store");
  }
  throw error;
}
