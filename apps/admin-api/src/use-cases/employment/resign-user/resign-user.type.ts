import type { AdminUserAuthorization } from "@admin-api/services/admin-authorization/admin-user-authorization.type";
import type { AdminAuditContext } from "@admin-api/services/audit/audit.context";

export interface ResignUserInput {
  username: string;
}

export interface ResignUserOptions {
  auditContext?: AdminAuditContext;
  authorization?: AdminUserAuthorization;
}
