import type { Context } from "hono";
import { getTraceIdFromHeaders } from "../logger";

function firstHeaderValue(value: string | undefined): string | null {
  const [first] = value?.split(",") ?? [];
  const normalized = first?.trim();
  return normalized || null;
}

export function getContextValue<T>(c: Context, key: string): T | undefined {
  try {
    return c.get(key as never) as T | undefined;
  }
  catch {
    return undefined;
  }
}

export function getRequestId(c: Context): string | undefined {
  return getContextValue<string>(c, "requestId");
}

export function getRequestIp(c: Context): string | null {
  return firstHeaderValue(c.req.header("x-forwarded-for"))
    ?? firstHeaderValue(c.req.header("x-real-ip"))
    ?? firstHeaderValue(c.req.header("cf-connecting-ip"));
}

export function getTraceId(c: Context): string | null {
  return getTraceIdFromHeaders(name => c.req.header(name)) ?? null;
}
