import type { ContentfulStatusCode } from "hono/utils/http-status";

export class GatewayError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: ContentfulStatusCode,
    readonly data?: unknown,
  ) {
    super(message);
  }
}
