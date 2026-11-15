import { Buffer } from "node:buffer";
import type { WechatQrState } from "@api/services/authentication/wechat-qr.state";
import { normalizeRegisteredIdentifier } from "@iam/domain/user";
import type { WechatQrConfig, WechatQrDirectoryPort } from "./wechat-qr.port";

export function createWechatQrUseCase(options: {
  config: WechatQrConfig;
  state: WechatQrState;
  directory: WechatQrDirectoryPort;
  wechat: { getWxUserId: (code: string) => Promise<string> };
}) {
  const { config, state, directory, wechat } = options;
  const publicOrigin = new URL(config.callbackUrl).origin;

  return {
    publicOrigin,
    async startDesktop(input: {
      browser: Parameters<WechatQrState["start"]>[0];
      expiresAt: number;
      clientCode: string;
      device: string;
    }) {
      const applicationName = (await directory.lookupApplicationName(input.clientCode)) ?? input.clientCode;
      const request = await state.start(input.browser, input.expiresAt, { applicationName, device: input.device });
      if (!request) return null;
      return { ...request, mobileUrl: `${publicOrigin}/sso/wechat-qr/mobile/${request.requestId}` };
    },
    async startMobile(requestId: string) {
      const authorization = await state.startAuthorization(requestId);
      if (!authorization) return null;
      const target = new URL("https://open.weixin.qq.com/connect/oauth2/authorize");
      target.search = new URLSearchParams({
        appid: config.corpId,
        redirect_uri: config.callbackUrl,
        response_type: "code",
        scope: "snsapi_base",
        state: authorization.state,
        agentid: config.agentId,
      }).toString();
      target.hash = "wechat_redirect";
      return { ...authorization, target: target.href };
    },
    async finishMobile(input: { state: string; proof: string; code: string }) {
      const requestId = await state.consumeAuthorization(input.state, input.proof);
      if (!requestId) return null;
      // Denial still consumes the matching OAuth state. Another phone may continue the QR request.
      if (input.code.length === 0 || Buffer.byteLength(input.code, "utf8") > 512) return null;
      const wxId = normalizeRegisteredIdentifier(await wechat.getWxUserId(input.code));
      if (wxId === null || Array.from(wxId).length > 255) return null;
      return await state.prepareConfirmation(requestId, wxId);
    },
    readConfirmation: state.readConfirmation,
    async decideMobile(input: { flowId: string; proof: string; action: "confirm" | "cancel" }) {
      const confirmation = await state.readConfirmation(input.flowId, input.proof);
      if (!confirmation) return false;
      if (input.action === "cancel") {
        return await state.decide(input.flowId, input.proof, confirmation.requestId, { status: "restart" });
      }
      const member = await directory.findRegisteredMember(confirmation.wxId);
      return await state.decide(
        input.flowId,
        input.proof,
        confirmation.requestId,
        member ? { status: "confirmed", member } : { status: "binding_required", wxId: confirmation.wxId },
      );
    },
  };
}

export type WechatQrUseCase = ReturnType<typeof createWechatQrUseCase>;
