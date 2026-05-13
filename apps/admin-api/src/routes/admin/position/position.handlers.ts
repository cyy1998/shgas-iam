import type { PositionRouteHandler } from "./position.type";
import * as ops from "./position.ops";

export const positionsSearch: PositionRouteHandler<"positionsSearch"> = async c =>
  c.json(await ops.searchPositionOp.run(c.req.valid("json")));

export const positionDetail: PositionRouteHandler<"positionDetail"> = async c =>
  c.json(await ops.getPositionOp.run(c.req.valid("param")));

export const positionCreate: PositionRouteHandler<"positionCreate"> = async c =>
  c.json(await ops.createPositionOp.run(c.req.valid("json")));

export const positionUpdate: PositionRouteHandler<"positionUpdate"> = async c =>
  c.json(await ops.updatePositionOp.run({
    posCode: c.req.valid("param").posCode,
    data: c.req.valid("json"),
  }));

export const positionStatusUpdate: PositionRouteHandler<"positionStatusUpdate"> = async c =>
  c.json(await ops.updatePositionStatusOp.run({
    posCode: c.req.valid("param").posCode,
    status: c.req.valid("json").status,
  }));

export const positionDelete: PositionRouteHandler<"positionDelete"> = async c =>
  c.json(await ops.deletePositionOp.run(c.req.valid("param")));
