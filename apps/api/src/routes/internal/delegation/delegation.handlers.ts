import type { DelegationRouteHandler } from "./delegation.type";
import * as auditService from "@api/services/audit/audit.service";
import * as privilegeDelegationService from "@api/services/privilege/privilegeDelegation.service";
import * as resp from "@iam/api-core/http";

export const privilegeDelegationsQuery: DelegationRouteHandler<"privilegeDelegationsQuery"> = async (c) => {
  const query = c.req.valid("json");
  const data = await privilegeDelegationService.queryPrivilegeDelegations(query);
  return c.json(resp.ok(data));
};

export const privilegeDelegationUpdate: DelegationRouteHandler<"privilegeDelegationUpdate"> = async (c) => {
  const { id } = c.req.valid("param");
  const dto = c.req.valid("json");
  const data = await privilegeDelegationService.updateDelegation(id, dto);
  await auditService.recordAuditLogFromContext(c, {
    action: "internal.delegation.update",
    outcome: "success",
    ...auditService.getInternalAuditActor(c),
    targetType: "delegation",
    targetId: id,
    details: {
      patch: dto,
    },
  });
  return c.json(resp.ok(data));
};

export const privilegeDelegationSet: DelegationRouteHandler<"privilegeDelegationSet"> = async (c) => {
  const dto = c.req.valid("json");
  const data = await privilegeDelegationService.createPrivilegeDelegation(dto);
  await auditService.recordAuditLogFromContext(c, {
    action: "internal.delegation.create",
    outcome: "success",
    ...auditService.getInternalAuditActor(c),
    targetType: "delegation",
    targetId: data.id,
    details: {
      delegatorUsername: data.delegatorUsername,
      delegateeUsername: data.delegateeUsername,
      orgCode: dto.orgCode,
      privilegeCodes: dto.privilegeCodes,
      startTime: data.startTime,
      endTime: data.endTime,
    },
  });
  return c.json(resp.ok(data));
};
