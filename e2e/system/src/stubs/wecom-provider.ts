import { createHmac, timingSafeEqual } from "node:crypto";

export const wecomCorp = "ww-e2e-local";
export const wecomAgent = "1000002";
export const wecomSecret = "wecom-e2e-secret-only";
export const wecomUnboundMember = "wecom-e2e-unbound";
export const wecomBoundMember = "wecom-e2e-bound";
export const wecomUnlinkMember = "wecom-e2e-unlink";
export const wecomMobileCallbackPath = "/sso/wechat-qr/mobile/callback";

const token = "wecom-e2e-application-token";
const providerOrigin = "https://qyapi.weixin.qq.com";

export function createWecomAuthorizationCode(member: string, state: string, runId: string) {
  const claims = `${member}.${state}`;
  return `${claims}.${createHmac("sha256", `wecom-e2e:${runId}`).update(claims).digest("hex")}`;
}

export function createWecomStub(initialRunId: string) {
  let runId = initialRunId;
  const consumed = new Set<string>();

  const exchangeCode = (code: string | null) => {
    if (!code || !runId) return null;
    const fields = code.split(".");
    if (fields.length !== 3) return null;
    const [member, state, signature] = fields;
    if (
      !member ||
      !/^[a-zA-Z0-9_-]{1,80}$/u.test(member) ||
      !state ||
      !/^[a-zA-Z0-9]{1,128}$/u.test(state) ||
      !signature ||
      !/^[0-9a-f]{64}$/u.test(signature) ||
      consumed.has(code)
    )
      return null;
    const expected = createWecomAuthorizationCode(member, state, runId);
    const actualBytes = Buffer.from(code);
    const expectedBytes = Buffer.from(expected);
    if (actualBytes.length !== expectedBytes.length || !timingSafeEqual(actualBytes, expectedBytes)) return null;
    consumed.add(code);
    return member;
  };

  return {
    async handle(request: Request): Promise<Response> {
      const url = new URL(request.url);
      if (request.method !== "GET" || url.origin !== providerOrigin || request.body)
        return Response.json({ errcode: 400, errmsg: "unexpected provider request" }, { status: 400 });
      const query = url.searchParams;
      if (
        url.pathname === "/cgi-bin/gettoken" &&
        query.size === 2 &&
        query.get("corpid") === wecomCorp &&
        query.get("corpsecret") === wecomSecret
      ) {
        return Response.json({ errcode: 0, errmsg: "ok", access_token: token, expires_in: 7200 });
      }
      if (url.pathname === "/cgi-bin/auth/getuserinfo" && query.size === 2 && query.get("access_token") === token) {
        const member = exchangeCode(query.get("code"));
        if (member) return Response.json({ errcode: 0, errmsg: "ok", userid: member });
        return Response.json({ errcode: 40029, errmsg: "invalid or consumed authorization code" });
      }
      return Response.json({ errcode: 404, errmsg: "unexpected provider endpoint" }, { status: 404 });
    },
    reset(nextRunId?: string) {
      consumed.clear();
      if (nextRunId !== undefined) runId = nextRunId;
    },
  };
}

export function createWecomProvider(runId: string): typeof fetch {
  const stub = createWecomStub(runId);
  const request = async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
    stub.handle(new Request(input, init));
  return Object.assign(request, {
    preconnect() {
      throw new Error("E2E WeCom provider does not open network connections");
    },
  });
}
