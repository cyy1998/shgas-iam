import type { ClientRouteHandler } from "./client.type";
import * as clientService from "@/services/client/client.service";
import * as resp from "@/utils/http/response";

export const clientUpdate: ClientRouteHandler<"clientUpdate"> = async (c) => {
  const body = c.req.valid("json");
  const data = await clientService.updateClient(body);
  return c.json(resp.ok(data));
};
