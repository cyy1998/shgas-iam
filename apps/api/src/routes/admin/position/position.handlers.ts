import type { PositionRouteHandler } from "./position.type";
import * as positionRepository from "@/services/position/position.repository";
import * as positionService from "@/services/position/position.service";
import * as resp from "@/utils/http/response";
import { paginate } from "@/utils/page.util";
import { PositionVoConverterSchema } from "./position.schema";

export const positionsSearch: PositionRouteHandler<"positionsSearch"> = async (c) => {
  const positionPaginationQuery = c.req.valid("json");
  const positions = await positionRepository.searchPositionsFuzzy(positionPaginationQuery);
  const positionVos = positions.map(p => PositionVoConverterSchema.parse(p));
  return c.json(resp.ok(paginate(positionVos, positionPaginationQuery)));
};

export const positionDetail: PositionRouteHandler<"positionDetail"> = async (c) => {
  const { posCode } = c.req.valid("param");
  const data = await positionService.getPositionDetailByCode(posCode);
  return c.json(resp.ok(data));
};

export const positionCreate: PositionRouteHandler<"positionCreate"> = async (c) => {
  const body = c.req.valid("json");
  const data = await positionService.setPosition(body);
  return c.json(resp.ok(data));
};

export const positionUpdate: PositionRouteHandler<"positionUpdate"> = async (c) => {
  const { posCode } = c.req.valid("param");
  const body = c.req.valid("json");
  const data = await positionService.updatePosition(posCode, body);
  return c.json(resp.ok(data));
};

export const positionStatusUpdate: PositionRouteHandler<"positionStatusUpdate"> = async (c) => {
  const { posCode } = c.req.valid("param");
  const { status } = c.req.valid("json");
  const data = await positionService.updatePositionStatus(posCode, status);
  return c.json(resp.ok(data));
};

export const positionDelete: PositionRouteHandler<"positionDelete"> = async (c) => {
  const { posCode } = c.req.valid("param");
  const data = await positionService.deletePosition(posCode);
  return c.json(resp.ok(data));
};
