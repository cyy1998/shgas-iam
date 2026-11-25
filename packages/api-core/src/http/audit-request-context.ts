import type { AuditRequestContext } from "@iam/contracts/audit";
import type { Context } from "hono";
import { getRequestId, getRequestIp, getTraceId } from "../core/request-context";

export function getAuditRequestContext(c: Context, sourceApp: string): AuditRequestContext {
  return {
    sourceApp,
    requestId: getRequestId(c) ?? c.req.header("x-request-id") ?? null,
    traceId: getTraceId(c),
    ip: getRequestIp(c),
    userAgent: c.req.header("user-agent") ?? null,
    route: c.req.path,
    method: c.req.method,
  };
}
