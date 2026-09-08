import type { AuditRequestContext } from "@iam/domain/audit";
import { normalizeSessionOrigin } from "@iam/session-kernel";

export type { SessionOrigin } from "@iam/session-kernel";

export function toSessionOrigin(
  requestContext: Pick<AuditRequestContext, "ip" | "userAgent"> | null | undefined,
) {
  return normalizeSessionOrigin(requestContext);
}
