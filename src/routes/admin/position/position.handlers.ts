import type { PositionRouteHandler } from "./position.type";
import * as positionRepository from "@/services/position/position.repository";
import * as resp from "@/utils/http/response";
import { paginate } from "@/utils/page.util";
import { PositionVoConverterSchema } from "./position.schema";

export const positionsSearch: PositionRouteHandler<"positionsSearch"> = async (c) => {
  const positionPaginationQuery = c.req.valid("json");
  const positions = await positionRepository.searchPositionsFuzzy(positionPaginationQuery);

  const positionVos = positions.map(p => PositionVoConverterSchema.parse(p));
  //   const data = await positionService.searchPositionsFuzzy(positionQueryDto);
  return c.json(resp.ok(paginate(positionVos, positionPaginationQuery)));
};
