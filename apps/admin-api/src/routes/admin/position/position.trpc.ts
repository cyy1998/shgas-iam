import type { PositionAdapter } from "./position.adapter";

export function createPositionAdminRouter(adapter: PositionAdapter) {
  return adapter.positionAdminRouter;
}
