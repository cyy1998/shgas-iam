import { exposeImageCaptchaTicket } from "@auth-api/middlewares/image-captcha-response";
import type { ApiRequestContext } from "@auth-api/services/audit/audit.context";
import { getApiAuditRequestContext } from "@auth-api/services/audit/audit.context";
import type { AuthorizedWechatQrBinding, WechatQrState } from "@auth-api/services/authentication/wechat-qr.state";
import type { WechatQrUseCase } from "@auth-api/use-cases/authentication/wechat-qr/wechat-qr.use-case";
import type { WechatQrBindingUseCase } from "@auth-api/use-cases/authentication/wechat-qr/wechat-qr-binding.use-case";
import type {
  PrepareWechatQrContinuation,
  WechatQrCompletionUseCase,
  WechatQrDesktopContinuation,
} from "@auth-api/use-cases/authentication/wechat-qr/wechat-qr-completion.use-case";
import { createRouter } from "@iam/api-core/core/create-router";
import * as resp from "@iam/api-core/http";
import { createSubjectAccessHttpAdapter } from "@iam/api-core/http/subject-access";
import {
  ApiErrorCode,
  IMAGE_CAPTCHA_PROOF_HEADER,
  WechatQrBindPasswordSchema,
  WechatQrBindSmsSchema,
  WechatQrIdSchema,
  WechatQrSendSmsSchema,
  WechatQrStartResultSchema,
} from "@iam/contracts";
import { HttpStatusCodes } from "@iam/contracts/http";
import type { Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { html } from "hono/html";
import { streamSSE } from "hono/streaming";
import type { z } from "zod";
import { registerWechatQrDesktopPaths, registerWechatQrMobilePaths } from "./wechat-qr.openapi";

export type InspectWechatQrContinuation = (c: Context) => Promise<WechatQrDesktopContinuation>;

function privateHeaders(c: Context) {
  c.header("Cache-Control", "no-store");
  c.header("Referrer-Policy", "no-referrer");
}

function coarseDevice(userAgent = "") {
  if (/Android|iPhone|iPad/u.test(userAgent)) return "移动设备";
  if (/Windows/u.test(userAgent)) return "Windows 电脑";
  if (/Macintosh/u.test(userAgent)) return "Mac 电脑";
  if (/Linux/u.test(userAgent)) return "Linux 电脑";
  return "电脑";
}

export function createWechatQrDesktopRouter(options: {
  inspect: InspectWechatQrContinuation;
  qr: WechatQrUseCase;
  state: Pick<WechatQrState, "readDesktop">;
  internalOrigin?: string;
  complete?: WechatQrCompletionUseCase;
  binding?: WechatQrBindingUseCase;
  prepareContinuation?: (c: Context, root: Parameters<PrepareWechatQrContinuation>[0]) => Promise<void>;
}) {
  const router = createRouter();
  registerWechatQrDesktopPaths(router);
  const subjectAccess = createSubjectAccessHttpAdapter();
  const secure = options.internalOrigin?.startsWith("https:") ?? false;
  router.use("*", async (c, next) => {
    privateHeaders(c);
    if (c.req.header("X-IAM-Entry-Network") !== "internal") return c.notFound();
    if (c.req.method === "POST") {
      const origin = c.req.header("Origin");
      if (
        c.req.header("Sec-Fetch-Site") === "cross-site" ||
        (origin && options.internalOrigin && origin !== options.internalOrigin)
      ) {
        return c.json(resp.fail(ApiErrorCode.BadRequest, "登录请求无效"), HttpStatusCodes.BAD_REQUEST);
      }
    }
    await next();
  });
  router.post("/", async (c) => {
    const continuation = await options.inspect(c);
    if (continuation.root) {
      await options.prepareContinuation?.(c, { kind: "existing", observation: continuation.root });
      return c.json(resp.ok({ decision: "continue" }));
    }
    const request = await options.qr.startDesktop({
      browser: continuation.browser,
      clientCode: continuation.clientCode,
      expiresAt: continuation.expiresAt,
      device: coarseDevice(c.req.header("User-Agent")),
    });
    if (!request) return c.json(resp.fail(ApiErrorCode.BadRequest, "登录请求已失效"), HttpStatusCodes.BAD_REQUEST);
    return c.json(resp.ok(WechatQrStartResultSchema.parse({ decision: "scan", ...request })));
  });
  const { complete, binding, prepareContinuation } = options;
  if (complete) {
    const finish = async (
      c: Context,
      continuation: WechatQrDesktopContinuation,
      requestId: string,
      requestContext: ApiRequestContext,
    ) => {
      const result = await subjectAccess.run(c, {}, () =>
        complete.execute(
          continuation,
          requestId,
          requestContext,
          prepareContinuation && ((root) => prepareContinuation(c, root)),
        ),
      );
      if (result.kind === "pending" || result.kind === "restart") return c.json(resp.ok({ decision: result.kind }));
      if (result.kind === "created") {
        setCookie(c, "global_session", result.token, {
          httpOnly: true,
          sameSite: "Lax",
          secure: secure || new URL(c.req.url).protocol === "https:",
          maxAge: result.remainingSeconds,
          path: "/",
        });
      }
      return c.json(resp.ok({ decision: "continue" }));
    };
    function auditContext(c: Context, suffix: string) {
      return { ...getApiAuditRequestContext(c), route: `/auth/wechat-qr/:requestId/${suffix}` };
    }
    router.post("/:requestId/complete", async (c) => {
      const requestId = WechatQrIdSchema.safeParse(c.req.param("requestId"));
      if (!requestId.success)
        return c.json(resp.fail(ApiErrorCode.BadRequest, "登录请求无效"), HttpStatusCodes.BAD_REQUEST);
      const continuation = await options.inspect(c);
      return await finish(c, continuation, requestId.data, auditContext(c, "complete"));
    });
    if (binding) {
      const registerBindingRoute = <T extends object>(
        suffix: string,
        schema: z.ZodType<T>,
        handle: (
          binding: AuthorizedWechatQrBinding,
          input: T & { imageCaptchaProof?: string },
          context: ApiRequestContext,
        ) => Promise<"ready" | "pending" | "restart" | "sent">,
        completesLogin = true,
      ) => {
        router.post(`/:requestId/${suffix}`, bodyLimit({ maxSize: 12_288 }), async (c) => {
          const requestId = WechatQrIdSchema.safeParse(c.req.param("requestId"));
          if (!requestId.success)
            return c.json(resp.fail(ApiErrorCode.BadRequest, "登录请求无效"), HttpStatusCodes.BAD_REQUEST);
          const continuation = await options.inspect(c);
          const requestContext = auditContext(c, suffix);
          const authorization = await binding.authorize(continuation, requestId.data);
          if (authorization.kind === "ready") {
            if (completesLogin) return await finish(c, continuation, requestId.data, requestContext);
            return c.json(resp.ok({ decision: "pending" }));
          }
          if (authorization.kind !== "authorized") return c.json(resp.ok({ decision: authorization.kind }));
          if (c.req.header("Content-Type")?.split(";")[0]?.trim().toLowerCase() !== "application/json") {
            return c.json(resp.fail(ApiErrorCode.BadRequest, "绑定请求无效"), HttpStatusCodes.BAD_REQUEST);
          }
          const input = schema.safeParse(await c.req.json().catch(() => null));
          if (!input.success) {
            return c.json(resp.fail(ApiErrorCode.BadRequest, "绑定请求无效"), HttpStatusCodes.BAD_REQUEST);
          }
          const proof = c.req.header(IMAGE_CAPTCHA_PROOF_HEADER);
          const result = await subjectAccess
            .run(c, {}, () =>
              handle(authorization.binding, { ...input.data, imageCaptchaProof: proof }, requestContext),
            )
            .catch((error: unknown) => exposeImageCaptchaTicket(c, error));
          if (result !== "ready") return c.json(resp.ok({ decision: result }));
          return await finish(c, continuation, requestId.data, requestContext);
        });
      };
      registerBindingRoute("bind/password", WechatQrBindPasswordSchema, async (authorized, input, context) => {
        const account = await binding.verifyPassword(authorized, input, context);
        return await binding.bind(authorized, account, context);
      });
      registerBindingRoute("bind/sms/send", WechatQrSendSmsSchema, binding.sendSms, false);
      registerBindingRoute("bind/sms", WechatQrBindSmsSchema, async (authorized, input, context) => {
        const account = await binding.verifySms(authorized, input, context);
        return await binding.bind(authorized, account, context);
      });
    }
  }
  router.get("/:requestId/status", async (c) => {
    const { browser } = await options.inspect(c);
    const status = (await options.state.readDesktop(browser, c.req.param("requestId")))?.status ?? "restart";
    return c.json(resp.ok({ status }));
  });
  router.get("/:requestId/events", async (c) => {
    const { browser } = await options.inspect(c);
    const requestId = c.req.param("requestId");
    const initial = (await options.state.readDesktop(browser, requestId))?.status ?? "restart";
    c.header("X-Accel-Buffering", "no");
    const response = streamSSE(c, async (stream) => {
      let status = initial;
      let lastSent: typeof status | undefined;
      let heartbeat = 0;
      while (!stream.aborted && !stream.closed) {
        if (status !== lastSent) {
          await stream.writeSSE({ data: JSON.stringify({ status }) });
          lastSent = status;
          heartbeat = 0;
        }
        if (status === "restart" || status === "consumed") break;
        if (++heartbeat % 4 === 0) await stream.write(": heartbeat\n\n");
        await stream.sleep(1000);
        if (stream.aborted || stream.closed) break;
        try {
          status = (await options.state.readDesktop(browser, requestId))?.status ?? "restart";
        } catch {
          // Close on unknown state so EventSource reconnects and rereads Redis.
          break;
        }
      }
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  });
  return router;
}

const mobilePath = "/sso/wechat-qr/mobile";
const cookieSettings = { httpOnly: true, sameSite: "Lax" as const, secure: true, maxAge: 300, path: "/" };
const stateCookie = (state: string) => `__Host-wecom_oauth_${state}`;
const confirmationCookie = (flow: string) => `__Host-wecom_confirm_${flow}`;

function acceptsMobilePost(c: Context, publicOrigin: string) {
  const origin = c.req.header("Origin");
  // A no-referrer form submission can have an opaque Origin.
  if (origin && origin !== "null" && origin !== publicOrigin) return false;
  return c.req.header("Sec-Fetch-Site") !== "cross-site";
}

function mobilePage(title: string, content: unknown) {
  return html`<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · 上海燃气 IAM</title>
<style>
body{font:1rem/1.5 system-ui,sans-serif;background:#f4f6fa;color:#13283d;margin:0;padding:2rem 1rem}
main{margin:2rem auto;max-width:24rem;background:white;padding:1.5rem;border:1px solid #dbe2eb;border-radius:.75rem}
h1{font-size:1.5rem;margin-top:0} dt{color:#435569} dd{margin:0 0 1rem;overflow-wrap:anywhere}
form{display:flex;gap:.75rem;margin-top:1.5rem} button{font:inherit;min-height:2.75rem;padding:.5rem 1rem;border:1px solid #244c79;border-radius:.35rem;background:white;color:#244c79}
button[value=confirm]{background:#244c79;color:white}
</style></head><body><main><h1>${title}</h1>${content}</main></body></html>`;
}

export function createWechatQrMobileRouter(qr: WechatQrUseCase) {
  const router = createRouter();
  registerWechatQrMobilePaths(router);
  router.use("*", async (c, next) => {
    privateHeaders(c);
    if (c.req.header("X-IAM-Entry-Network") !== "external") return c.notFound();
    c.header(
      "Content-Security-Policy",
      "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
    );
    await next();
  });
  router.onError((_error, c) =>
    c.html(mobilePage("暂时无法继续", html`<p>请从电脑重新扫描二维码。</p>`), HttpStatusCodes.SERVICE_UNAVAILABLE),
  );
  function invalid(c: Context) {
    return c.html(mobilePage("扫码请求已失效", html`<p>请返回电脑重新扫码。</p>`), HttpStatusCodes.BAD_REQUEST);
  }
  router.get("/callback", async (c) => {
    const state = WechatQrIdSchema.safeParse(c.req.query("state"));
    if (!state.success) return invalid(c);
    const name = stateCookie(state.data);
    const proof = getCookie(c, name);
    if (!proof || c.req.queries("state")?.length !== 1) return invalid(c);
    deleteCookie(c, name, cookieSettings);
    const code = c.req.queries("code");
    const confirmation = await qr.finishMobile({
      state: state.data,
      proof,
      code: code?.length === 1 ? (code[0] ?? "") : "",
    });
    if (!confirmation) return invalid(c);
    setCookie(c, confirmationCookie(confirmation.flowId), confirmation.proof, cookieSettings);
    return c.redirect(`${mobilePath}/confirm/${confirmation.flowId}`, HttpStatusCodes.SEE_OTHER);
  });
  router.get("/confirm/:flowId", async (c) => {
    const flow = WechatQrIdSchema.safeParse(c.req.param("flowId"));
    if (!flow.success) return invalid(c);
    const proof = getCookie(c, confirmationCookie(flow.data));
    if (!proof) return invalid(c);
    const confirmation = await qr.readConfirmation(flow.data, proof);
    if (!confirmation) return invalid(c);
    return c.html(
      mobilePage(
        "确认企业微信登录",
        html`
      <dl><dt>目标应用</dt><dd>${confirmation.applicationName}</dd><dt>发起设备</dt><dd>${confirmation.device}</dd></dl>
      <p>如果这次登录由你发起，请确认后返回电脑。</p>
      <form method="post" action="${mobilePath}/decision">
        <input type="hidden" name="flow" value="${flow.data}">
        <button name="action" value="confirm" type="submit">确认登录</button>
        <button name="action" value="cancel" type="submit">取消</button>
      </form>
    `,
      ),
    );
  });
  router.post("/decision", bodyLimit({ maxSize: 1024 }), async (c) => {
    if (!acceptsMobilePost(c, qr.publicOrigin)) return invalid(c);
    if (c.req.header("Content-Type")?.split(";")[0] !== "application/x-www-form-urlencoded") return invalid(c);
    const form = new URLSearchParams(await c.req.text());
    const flow = WechatQrIdSchema.safeParse(form.get("flow"));
    const action = form.get("action");
    if (!flow.success || (action !== "confirm" && action !== "cancel")) return invalid(c);
    const name = confirmationCookie(flow.data);
    const proof = getCookie(c, name);
    if (!proof || !(await qr.decideMobile({ flowId: flow.data, proof, action }))) return invalid(c);
    deleteCookie(c, name, cookieSettings);
    const cancelled = action === "cancel";
    return c.html(
      mobilePage(
        cancelled ? "已取消登录" : "已确认登录",
        html`<p>${cancelled ? "请返回电脑重新扫码。" : "请在发起登录的电脑上继续。"}</p>`,
      ),
    );
  });
  router.get("/:requestId", async (c) => {
    const authorization = await qr.startMobile(c.req.param("requestId"));
    if (!authorization) return invalid(c);
    setCookie(c, stateCookie(authorization.state), authorization.proof, cookieSettings);
    return c.redirect(authorization.target);
  });
  return router;
}
