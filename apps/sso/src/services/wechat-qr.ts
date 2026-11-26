import {
  ApiErrorCode,
  IMAGE_CAPTCHA_TICKET_HEADER,
  WechatQrCompleteResponseSchema,
  WechatQrEventSchema,
  WechatQrLoginFailureSchema,
  WechatQrSendSmsResponseSchema,
  WechatQrStartResponseSchema,
  type WechatQrStatus,
} from "@iam/contracts";
import { API_PREFIX } from "@sso/constants/config";
import { createPasswordLoginCredential } from "@sso/lib/login-credential";
import { imageCaptchaProofOptions } from "@sso/services/image-captcha";
import { readRetryAfter, ServiceError } from "@sso/utils/request";

export type WechatQrContinuation =
  | { oidcReturn: string }
  | { client: string; redirectUrl: string; state?: string; ssoReturn: string };

function endpoint(continuation: WechatQrContinuation, suffix = "") {
  const path = `${API_PREFIX}/auth/wechat-qr${suffix}`;
  if ("oidcReturn" in continuation) {
    return `${path}?${new URLSearchParams({ protocol: "oidc", oidcReturn: continuation.oidcReturn })}`;
  }
  const query = new URLSearchParams({
    protocol: "custom_sso",
    client: continuation.client,
    redirectUrl: continuation.redirectUrl,
    ssoReturn: continuation.ssoReturn,
  });
  if (continuation.state !== undefined) query.set("state", continuation.state);
  return `${path}?${query}`;
}

export async function startWechatQr(continuation: WechatQrContinuation, signal: AbortSignal) {
  const response = await fetch(endpoint(continuation), { method: "POST", credentials: "same-origin", signal });
  if (!response.ok) throw new Error("扫码请求暂时无法创建");
  return WechatQrStartResponseSchema.parse(await response.json()).data;
}

export async function completeWechatQr(continuation: WechatQrContinuation, requestId: string) {
  const response = await fetch(endpoint(continuation, `/${requestId}/complete`), {
    method: "POST",
    credentials: "same-origin",
    signal: AbortSignal.timeout(8000),
  });
  const body: unknown = await response.json();
  if (!response.ok) {
    const failure = WechatQrLoginFailureSchema.safeParse(body);
    if (failure.success) throw new ServiceError(failure.data.message, failure.data.code);
    if (response.status === 401) throw new ServiceError("账号不可用", response.status);
    if (response.status === 400) throw new ServiceError("登录请求已失效，请返回应用重新发起登录", response.status);
    throw new ServiceError("暂时无法完成扫码登录，请重试", response.status);
  }
  return WechatQrCompleteResponseSchema.parse(body).data;
}

export async function bindWechatQrPassword(
  continuation: WechatQrContinuation,
  requestId: string,
  input: { username: string; password: string; capToken?: string; imageCaptchaProof?: string },
) {
  const body = await postBinding(
    continuation,
    requestId,
    "password",
    {
      capToken: input.capToken,
      credential: createPasswordLoginCredential({
        username: input.username,
        password: input.password,
        wechatQrRequestId: requestId,
      }),
    },
    input.imageCaptchaProof,
  );
  return WechatQrCompleteResponseSchema.parse(body).data;
}

type BindingSmsInput = { phoneNumber: string; capToken?: string; imageCaptchaProof?: string };

export async function sendWechatQrSms(
  continuation: WechatQrContinuation,
  requestId: string,
  { imageCaptchaProof, ...input }: BindingSmsInput,
) {
  const body = await postBinding(continuation, requestId, "sms/send", input, imageCaptchaProof);
  return WechatQrSendSmsResponseSchema.parse(body).data;
}

export async function bindWechatQrSms(
  continuation: WechatQrContinuation,
  requestId: string,
  { imageCaptchaProof, ...input }: BindingSmsInput & { code: string },
) {
  const body = await postBinding(continuation, requestId, "sms", input, imageCaptchaProof);
  return WechatQrCompleteResponseSchema.parse(body).data;
}

async function postBinding(
  continuation: WechatQrContinuation,
  requestId: string,
  method: "password" | "sms/send" | "sms",
  input: Record<string, string | undefined>,
  imageCaptchaProof?: string,
) {
  const request = imageCaptchaProofOptions(imageCaptchaProof);
  const headers = new Headers(request.headers);
  headers.set("Content-Type", "application/json");
  const response = await fetch(endpoint(continuation, `/${requestId}/bind/${method}`), {
    ...request,
    method: "POST",
    credentials: "same-origin",
    headers,
    signal: AbortSignal.timeout(15_000),
    body: JSON.stringify(input),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const code = body?.code ?? response.status;
    const ticket = response.headers.get(IMAGE_CAPTCHA_TICKET_HEADER) ?? undefined;
    const fallback = response.status === 401 ? "账号不可用" : "暂时无法验证并绑定企业微信，请重试";
    throw new ServiceError(
      body?.message || fallback,
      code,
      readRetryAfter(response),
      code === ApiErrorCode.HumanVerificationRequired ? ticket : undefined,
    );
  }
  return body;
}

export function subscribeWechatQr(
  continuation: WechatQrContinuation,
  requestId: string,
  onStatus: (status: WechatQrStatus) => void,
) {
  const source = new EventSource(endpoint(continuation, `/${requestId}/events`));
  source.onmessage = (event) => {
    try {
      const result = WechatQrEventSchema.safeParse(JSON.parse(event.data));
      if (result.success) {
        if (result.data.status === "restart" || result.data.status === "consumed") source.close();
        onStatus(result.data.status);
      }
    } catch {
      // Preserve the current UI if a proxy sends an invalid SSE message.
    }
  };
  source.onerror = () => {
    if (source.readyState === EventSource.CLOSED) onStatus("restart");
  };
  return () => source.close();
}
