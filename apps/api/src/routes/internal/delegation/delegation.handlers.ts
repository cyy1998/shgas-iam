import type { DelegationRouteHandler } from "./delegation.type";
import * as internalAudit from "@api/services/audit/events/internal.audit";
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
  await internalAudit.recordInternalDelegationUpdate(c, id, dto);
  return c.json(resp.ok(data));
};

export const privilegeDelegationSet: DelegationRouteHandler<"privilegeDelegationSet"> = async (c) => {
  const dto = c.req.valid("json");
  const data = await privilegeDelegationService.createPrivilegeDelegation(dto);
  await internalAudit.recordInternalDelegationCreate(c, {
    id: data.id,
    delegatorUsername: data.delegatorUsername,
    delegateeUsername: data.delegateeUsername,
    orgCode: dto.orgCode,
    privilegeCodes: dto.privilegeCodes,
    startTime: data.startTime,
    endTime: data.endTime,
  });
  return c.json(resp.ok(data));
};
