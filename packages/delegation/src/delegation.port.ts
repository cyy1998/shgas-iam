import type { DbClient, DbTransaction } from "@iam/db";
import type { AuditActorType, AuditRequestContext } from "@iam/domain/audit";

export type DelegationWriteScope =
  | { kind: "all" }
  | { kind: "client"; clientId: number }
  | { kind: "delegator"; userId: number };
export type DelegationReadScope = DelegationWriteScope | { kind: "delegatee"; userId: number };
export type DelegationSelectorQuery = { purpose: "create" | "filter"; search?: string };
export type DelegationCommandContext = {
  actionPrefix: "admin" | "sso" | "internal";
  actor: {
    actorType: AuditActorType;
    actorUserId?: number | null;
    actorUsername?: string | null;
    actorClientCode?: string | null;
    actorSystemKey?: string | null;
  };
  requestContext?: Partial<AuditRequestContext> | null;
};
export type DelegationAuditEvent = DelegationCommandContext["actor"] &
  Partial<AuditRequestContext> & {
    action: string;
    outcome: "success";
    targetType: "delegation";
    targetId: number;
    details: Record<string, unknown>;
  };
export interface DelegationServiceDependencies {
  db: DbClient;
  recordAudit: (tx: DbTransaction, event: DelegationAuditEvent) => Promise<void>;
}
