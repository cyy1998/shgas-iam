import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@iam/api/trpc";
import { apiClient } from "@/lib/api-client";

type AdminPositionOutputs = inferRouterOutputs<AppRouter>["admin"]["position"];
export type PositionVo = AdminPositionOutputs["search"]["result"][number];
export type PositionDetailVo = AdminPositionOutputs["detail"];

export type PositionSearchParams = {
  pageNum: number;
  pageSize: number;
  conditions: {
    fuzzyConditions: { text?: string };
    exactConditions: Record<string, never>;
  };
};

export function searchPositions(params: PositionSearchParams) {
  return apiClient.admin.position.search.query(params);
}

export function getPosition(posCode: string) {
  return apiClient.admin.position.detail.query({ posCode });
}

export function createPosition(body: {
  posCode: string;
  posName: string;
  description?: string;
  status?: number;
}) {
  return apiClient.admin.position.create.mutate(body);
}

export function updatePosition(
  posCode: string,
  data: { posName?: string; description?: string | null; status?: number },
) {
  return apiClient.admin.position.update.mutate({ posCode, data });
}

export function updatePositionStatus(posCode: string, status: number) {
  return apiClient.admin.position.updateStatus.mutate({ posCode, status });
}

export function deletePosition(posCode: string) {
  return apiClient.admin.position.delete.mutate({ posCode });
}
