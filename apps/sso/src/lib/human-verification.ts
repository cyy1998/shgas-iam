import { ApiErrorCode } from "@iam/contracts";
import { CAP_API_ENDPOINT, CAP_PAKO_URL, CAP_WASM_URL } from "@sso/constants/config";
import type { HumanVerificationAction } from "@sso/types/api";
import { ServiceError } from "@sso/utils/request";
import { message } from "antd";

type Operation<T> = (capToken?: string, imageCaptchaProof?: string) => Promise<T>;

type HumanVerificationOptions = {
  promptImageCaptcha?: (ticket: string) => Promise<string | undefined>;
  signal?: AbortSignal;
  isCancelled?: () => boolean;
};

const CAP_TIMEOUT_MS = 10_000;
let capQueue = Promise.resolve();

export class HumanVerificationCancelled extends ServiceError {
  constructor() {
    super("已取消安全校验", ApiErrorCode.HumanVerificationRequired);
  }
}

function configureCapAssetUrls() {
  window.CAP_CUSTOM_WASM_URL = CAP_WASM_URL;
  window.CAP_PAKO_URL = CAP_PAKO_URL;
}

async function solveCapAttempt(action: HumanVerificationAction, signal?: AbortSignal): Promise<string> {
  if (signal?.aborted) throw new HumanVerificationCancelled();
  configureCapAssetUrls();

  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  const timeout = window.setTimeout(abort, CAP_TIMEOUT_MS);
  const stopped = new Promise<never>((_, reject) => {
    controller.signal.addEventListener("abort", () => reject(new Error("Cap solve stopped")), { once: true });
  });
  try {
    const { default: Cap } = await Promise.race([import("cap-widget"), stopped]);
    if (controller.signal.aborted) throw new Error("Cap solve stopped");
    const previousFetch = window.CAP_CUSTOM_FETCH;
    window.CAP_CUSTOM_FETCH = (input, init = {}) => {
      const headers = new Headers(init.headers);
      headers.set("X-Cap-Action", action);
      return (previousFetch ?? fetch)(input, { ...init, headers, signal: controller.signal });
    };

    try {
      const cap = new Cap({ apiEndpoint: CAP_API_ENDPOINT });
      try {
        const result = await Promise.race([cap.solve(), stopped]);
        if (!result.success || !result.token) throw new Error("Cap solve failed");
        return result.token;
      } finally {
        cap.widget?.remove();
      }
    } finally {
      window.CAP_CUSTOM_FETCH = previousFetch;
    }
  } finally {
    window.clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
    controller.abort();
  }
}

function solveCap(action: HumanVerificationAction, signal?: AbortSignal) {
  // The SDK reads its fetch override from window, so only one solve may own it at a time.
  const attempt = capQueue.then(() => solveCapAttempt(action, signal));
  capQueue = attempt.then(
    () => undefined,
    () => undefined,
  );
  return attempt;
}

export async function withHumanVerification<T>(
  action: HumanVerificationAction,
  operation: Operation<T>,
  options: HumanVerificationOptions = {},
): Promise<T> {
  const isCancelled = () => options.signal?.aborted || options.isCancelled?.();
  if (isCancelled()) throw new HumanVerificationCancelled();
  let ticket: string | undefined;
  try {
    return await operation();
  } catch (error) {
    if (!(error instanceof ServiceError) || error.code !== ApiErrorCode.HumanVerificationRequired) {
      throw error;
    }
    ticket = error.imageCaptchaTicket;
  }

  let capToken: string;
  if (isCancelled()) throw new HumanVerificationCancelled();
  try {
    capToken = await solveCap(action, options.signal);
  } catch (error) {
    if (isCancelled()) throw new HumanVerificationCancelled();
    if (ticket && options.promptImageCaptcha) {
      const proof = await options.promptImageCaptcha(ticket);
      if (!proof || isCancelled()) throw new HumanVerificationCancelled();
      return await operation(undefined, proof);
    }
    message.error("安全校验失败，请重试");
    if (error instanceof ServiceError) {
      throw error;
    }
    throw new ServiceError("安全校验失败，请重试", ApiErrorCode.HumanVerificationRequired);
  }
  if (isCancelled()) throw new HumanVerificationCancelled();
  return await operation(capToken);
}
