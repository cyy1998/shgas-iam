import type { DelegationRouteHandler } from "./delegation.type";
import * as privilegeDelegationService from "@/services/privilege/privilegeDelegation.service";
import * as resp from "@/utils/http/response";

export const privilegeDelegationsQuery: DelegationRouteHandler<"privilegeDelegationsQuery"> = async (c) => {
  const query = c.req.valid("json");
  const data = await privilegeDelegationService.queryPrivilegeDelegations(query);
  return c.json(resp.ok(data));
};

export const privilegeDelegationUpdate: DelegationRouteHandler<"privilegeDelegationUpdate"> = async (c) => {
  const { id } = c.req.valid("param");
  const dto = c.req.valid("json");
  const data = await privilegeDelegationService.updateDelegation(id, dto);
  return c.json(resp.ok(data));
};

export const privilegeDelegationSet: DelegationRouteHandler<"privilegeDelegationSet"> = async (c) => {
  const dto = c.req.valid("json");
  const data = await privilegeDelegationService.createPrivilegeDelegation(dto);
  return c.json(resp.ok(data));
};
