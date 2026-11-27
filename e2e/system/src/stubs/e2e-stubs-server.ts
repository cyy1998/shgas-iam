import { timingSafeEqual } from "node:crypto";
import { createSmsStub } from "./sms-provider.ts";
import { createWecomStub } from "./wecom-provider.ts";

export interface E2EStubsServerOptions {
  runId: string;
  token: string;
  rpTerminalHtml: string;
}

export function createE2EStubsServer(options: E2EStubsServerOptions) {
  const authorization = Buffer.from(`Bearer ${options.token}`);
  const wecom = createWecomStub(options.runId);
  const sms = createSmsStub();

  function isAuthorized(request: Request) {
    const presented = Buffer.from(request.headers.get("authorization") ?? "");
    return presented.length === authorization.length && timingSafeEqual(presented, authorization);
  }

  return {
    handleWecom(request: Request) {
      return wecom.handle(request);
    },

    async handleHttp(request: Request): Promise<Response> {
      const url = new URL(request.url);
      if (url.pathname === "/health") {
        if (request.method !== "GET" && request.method !== "HEAD") {
          return new Response(null, { status: 405, headers: { allow: "GET, HEAD" } });
        }
        return Response.json({ status: "ok" }, { headers: { "cache-control": "no-store" } });
      }

      if (url.pathname === "/portal/e2e-rp.html") {
        if (request.method !== "GET" && request.method !== "HEAD") {
          return new Response(null, { status: 405, headers: { allow: "GET, HEAD" } });
        }
        return new Response(request.method === "HEAD" ? null : options.rpTerminalHtml, {
          status: 200,
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-store",
          },
        });
      }

      if (url.pathname === "/test-sms") {
        return sms.handle(request);
      }

      if (url.pathname === "/_stubs/sms") {
        if (!isAuthorized(request)) return new Response(null, { status: 401 });
        if (request.method !== "GET") return new Response(null, { status: 405, headers: { allow: "GET" } });
        return Response.json({ code: sms.latestCode() }, { headers: { "cache-control": "no-store" } });
      }

      if (url.pathname === "/_stubs/reset") {
        if (!isAuthorized(request)) return new Response(null, { status: 401 });
        if (request.method !== "POST") return new Response(null, { status: 405, headers: { allow: "POST" } });
        let nextRunId: string | undefined;
        const rawBody = await request.text();
        if (rawBody.trim() !== "") {
          let parsed: unknown;
          try {
            parsed = JSON.parse(rawBody);
          } catch {
            return new Response(null, { status: 400 });
          }
          if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
            return new Response(null, { status: 400 });
          }
          if ("runId" in parsed && parsed.runId !== undefined) {
            if (typeof parsed.runId !== "string" || parsed.runId.trim() === "") {
              return new Response(null, { status: 400 });
            }
            nextRunId = parsed.runId;
          }
        }
        wecom.reset(nextRunId);
        sms.reset();
        return new Response(null, { status: 204 });
      }

      return new Response(null, { status: 404 });
    },

    reset(nextRunId?: string) {
      wecom.reset(nextRunId);
      sms.reset();
    },
  };
}
