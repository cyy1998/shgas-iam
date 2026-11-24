import { expect, type Page } from "@playwright/test";
import { createWecomAuthorizationCode, wecomAgent, wecomCorp, wecomMobileCallbackPath } from "./wecom-provider.ts";

const authorizationEndpoint = "https://open.weixin.qq.com/connect/oauth2/authorize";

/** Emulate only the WeCom browser redirect. IAM URLs are handled by the real gateway and application. */
export async function standInForWecomAuthorization(
  page: Page,
  input: { mobileOrigin: string; member: string; runId: string },
) {
  const allowedCallback = new URL(wecomMobileCallbackPath, input.mobileOrigin).href;
  // Playwright route handlers see only the first request in a redirect chain.
  const provider = await page.context().newCDPSession(page);
  await provider.send("Fetch.enable", {
    patterns: [{ urlPattern: "https://open.weixin.qq.com/*", requestStage: "Request" }],
  });
  provider.on("Fetch.requestPaused", async ({ requestId, request }) => {
    const url = new URL(request.url);
    const state = url.searchParams.get("state");
    try {
      expect(`${url.origin}${url.pathname}`).toBe(authorizationEndpoint);
      expect(request.method).toBe("GET");
      expect(Object.fromEntries(url.searchParams)).toEqual({
        appid: wecomCorp,
        redirect_uri: allowedCallback,
        response_type: "code",
        scope: "snsapi_base",
        agentid: wecomAgent,
        state: expect.stringMatching(/^[a-zA-Z0-9]{1,128}$/u),
      });
      expect(url.searchParams.size).toBe(6);
      if (!state) throw new Error("WeCom authorization redirect omitted state");
      const callback = new URL(allowedCallback);
      callback.searchParams.set("state", state);
      callback.searchParams.set("code", createWecomAuthorizationCode(input.member, state, input.runId));
      await provider.send("Fetch.fulfillRequest", {
        requestId,
        responseCode: 302,
        // An explicit empty fragment prevents Chromium from inheriting WeCom's #wechat_redirect.
        responseHeaders: [{ name: "location", value: `${callback.href}#` }],
      });
    } catch (error) {
      await provider.send("Fetch.failRequest", { requestId, errorReason: "BlockedByClient" });
      throw error;
    }
  });
}
