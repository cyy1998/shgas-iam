import { z } from "zod";

export const IMAGE_CAPTCHA_TICKET_HEADER = "X-IAM-Image-Captcha-Ticket";
export const IMAGE_CAPTCHA_PROOF_HEADER = "X-IAM-Image-Captcha-Proof";

export const ImageCaptchaChallengeSchema = z.object({
  challengeId: z.string(),
  imageBase64: z.string(),
});

export const ImageCaptchaAnswerSchema = z.discriminatedUnion("result", [
  z.object({ result: z.literal("incorrect") }),
  z.object({ result: z.literal("expired") }),
  z.object({ result: z.literal("verified"), proof: z.string() }),
]);

export type ImageCaptchaChallenge = z.infer<typeof ImageCaptchaChallengeSchema>;
export type ImageCaptchaAnswer = z.infer<typeof ImageCaptchaAnswerSchema>;
