import { HttpResponse, http } from "msw";
import {
  adminCapabilitySummary,
  adminEmploymentSearchResult,
  adminPositionSearchResult,
  adminUserSearchResult,
  currentAdminUser,
} from "./fixtures";

function ok<T>(data: T) {
  return HttpResponse.json({ code: 200, message: "OK", data });
}

function trpc<T>(data: T) {
  return HttpResponse.json([{ result: { data } }]);
}

export const handlers = [
  http.get("*/public/user-info", () => ok(currentAdminUser)),
  http.get("*/rpc/admin.authorization.capabilitySummary", () => trpc(adminCapabilitySummary)),
  http.get("*/rpc/admin.user.search", () => trpc(adminUserSearchResult)),
  http.get("*/rpc/admin.position.search", () => trpc(adminPositionSearchResult)),
  http.get("*/rpc/admin.employment.search", () => trpc(adminEmploymentSearchResult)),
];
