import type { ClientRouteHandler } from "./client.type";
import * as clientService from "@api/services/client/client.service";
import * as resp from "@api/utils/http/response";

export const clientCreate: ClientRouteHandler<"clientCreate"> = async (c) => {
  const body = c.req.valid("json");
  const data = await clientService.createClient(body);
  return c.json(resp.ok(data));
};

export const clientUpdate: ClientRouteHandler<"clientUpdate"> = async (c) => {
  const body = c.req.valid("json");
  const data = await clientService.updateClient(body);
  return c.json(resp.ok(data));
};
