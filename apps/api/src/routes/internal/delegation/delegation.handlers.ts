import type { AuditLogWriterPort } from "@api/services/audit/audit.service";
import type { PrivilegeDelegationService } from "@api/services/privilege/privilegeDelegation.service";
import type { DelegationRouteHandler } from "./delegation.type";
import { getInternalAuditActor } from "@api/services/audit/audit.service";
import {
  buildInternalDelegationCreateAudit,
  buildInternalDelegationUpdateAudit,
} from "@api/services/audit/events/internal.audit";
import * as resp from "@iam/api-core/http";

export interface CreateDelegationHandlersDeps {
  auditLogWriter: AuditLogWriterPort;
  privilegeDelegationService: Pick<
    PrivilegeDelegationService,
    "createPrivilegeDelegation" | "queryPrivilegeDelegations" | "updateDelegation"
  >;
}

export function createDelegationHandlers(deps: CreateDelegationHandlersDeps) {
  const privilegeDelegationsQuery: DelegationRouteHandler<"privilegeDelegationsQuery"> = async (c) => {
    const query = c.req.valid("json");
    const data = await deps.privilegeDelegationService.queryPrivilegeDelegations(query);
    return c.json(resp.ok(data));
  };

  const privilegeDelegationUpdate: DelegationRouteHandler<"privilegeDelegationUpdate"> = async (c) => {
    const { id } = c.req.valid("param");
    const dto = c.req.valid("json");
    const data = await deps.privilegeDelegationService.updateDelegation(id, dto);
    await deps.auditLogWriter.recordAuditLogFromContext(
      c,
      buildInternalDelegationUpdateAudit(getInternalAuditActor(c), id, dto),
    );
    return c.json(resp.ok(data));
  };

  const privilegeDelegationSet: DelegationRouteHandler<"privilegeDelegationSet"> = async (c) => {
    const dto = c.req.valid("json");
    const data = await deps.privilegeDelegationService.createPrivilegeDelegation(dto);
    await deps.auditLogWriter.recordAuditLogFromContext(
      c,
      buildInternalDelegationCreateAudit(getInternalAuditActor(c), {
        id: data.id,
        delegatorUsername: data.delegatorUsername,
        delegateeUsername: data.delegateeUsername,
        orgCode: dto.orgCode,
        privilegeCodes: dto.privilegeCodes,
        startTime: data.startTime,
        endTime: data.endTime,
      }),
    );
    return c.json(resp.ok(data));
  };

  return {
    privilegeDelegationSet,
    privilegeDelegationUpdate,
    privilegeDelegationsQuery,
  };
}

export type DelegationHandlers = ReturnType<typeof createDelegationHandlers>;
