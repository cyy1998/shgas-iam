import type { ClientRouteHandler } from "./client.type";
import * as ops from "./client.ops";

export const clientsSearch: ClientRouteHandler<"clientsSearch"> = async c =>
  c.json(await ops.searchClientOp.run(c.req.valid("json")));

export const clientDetail: ClientRouteHandler<"clientDetail"> = async c =>
  c.json(await ops.getClientOp.run(c.req.valid("param")));

export const clientCreate: ClientRouteHandler<"clientCreate"> = async (c) => {
  return c.json(await ops.createClientOp.run(c.req.valid("json")));
};

export const clientUpdate: ClientRouteHandler<"clientUpdate"> = async c =>
  c.json(await ops.updateClientOp.run({
    clientCode: c.req.valid("param").clientCode,
    data: c.req.valid("json"),
  }));

export const clientStatusUpdate: ClientRouteHandler<"clientStatusUpdate"> = async c =>
  c.json(await ops.updateClientStatusOp.run({
    clientCode: c.req.valid("param").clientCode,
    status: c.req.valid("json").status,
  }));

export const clientDelete: ClientRouteHandler<"clientDelete"> = async c =>
  c.json(await ops.deleteClientOp.run(c.req.valid("param")));

export const clientCreateLegacy: ClientRouteHandler<"clientCreateLegacy"> = async c =>
  c.json(await ops.createClientOp.run(c.req.valid("json")));

export const clientUpdateLegacy: ClientRouteHandler<"clientUpdateLegacy"> = async c =>
  c.json(await ops.updateClientByIdOp.run(c.req.valid("json")));
