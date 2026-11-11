import { IMAGE_CAPTCHA_PROOF_HEADER, type ImageCaptchaAnswer, type ImageCaptchaChallenge } from "@iam/contracts";
import { request } from "@sso/utils/request";

export function imageCaptchaProofOptions(proof?: string): RequestInit {
  return proof ? { mode: "same-origin", headers: { [IMAGE_CAPTCHA_PROOF_HEADER]: proof } } : {};
}

function imageCaptchaRequest<T>(path: "challenge" | "answer", body: object, signal?: AbortSignal) {
  return request<T>(`/open/image-captcha/${path}`, {
    method: "POST",
    mode: "same-origin",
    skipAuthRedirect: true,
    suppressErrorMessage: true,
    body: JSON.stringify(body),
    signal,
  });
}

export function fetchImageCaptcha(ticket: string, signal?: AbortSignal) {
  return imageCaptchaRequest<ImageCaptchaChallenge>("challenge", { ticket }, signal);
}

export function verifyImageCaptcha(ticket: string, challengeId: string, answer: string, signal?: AbortSignal) {
  return imageCaptchaRequest<ImageCaptchaAnswer>("answer", { ticket, challengeId, answer }, signal);
}
