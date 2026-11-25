import { createHmac } from "node:crypto";

export class SmsGatewayHttpError extends Error {
  constructor(readonly status: number) {
    super(`SMS gateway returned HTTP ${status}`);
    this.name = "SmsGatewayHttpError";
  }
}

export interface SmsTransportOptions {
  clock: { now: () => number };
  config: { smsUrl: string; signatureKey: string };
  fetch?: (url: string, init: RequestInit) => Promise<Response>;
}

export function createSmsTransport({ clock, config, fetch: fetchMessage = fetch }: SmsTransportOptions) {
  return {
    async sendMessage(mobile: string, message: string, signal?: AbortSignal): Promise<Response> {
      signal?.throwIfAborted();
      const timestamp = Math.floor(clock.now() / 1000);
      const origin = "SHGAS";
      const signature = createHmac("sha256", config.signatureKey)
        .update(`${timestamp}${origin}${mobile}${message}`)
        .digest("hex");
      const response = await fetchMessage(config.smsUrl, {
        signal,
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ mobile, message, timestamp, origin, signature }),
      });
      signal?.throwIfAborted();
      if (!response.ok) {
        void response.body?.cancel().catch(() => undefined);
        throw new SmsGatewayHttpError(response.status);
      }
      return response;
    },
  };
}
