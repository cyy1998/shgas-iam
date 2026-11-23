import { HttpResponse, http } from "msw";
import { adminPositionSearchResult, adminUserSearchResult } from "./fixtures";

function trpc<T>(data: T) {
  return HttpResponse.json([{ result: { data } }]);
}

export const handlers = [
  http.get("*/rpc/admin.user.search", () => trpc(adminUserSearchResult)),
  http.get("*/rpc/admin.position.search", () => trpc(adminPositionSearchResult)),
  http.get("*/rpc/admin.position.detail", () => trpc(adminPositionSearchResult.result[0])),
  http.get("*/rpc/admin.customAttribute.list", () => trpc([])),
];
