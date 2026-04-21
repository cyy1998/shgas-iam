import { apiClient } from "@/lib/api-client";
import { unwrap } from "@/utils/request";

export type PositionVo = {
  id: number;
  posCode: string;
  posName: string;
  description?: string | null;
  status: number;
  statusText: string;
  memberNumber: number;
  isDelete: boolean;
  createTime: string;
  updateTime: string;
};

export type PositionSearchParams = {
  pageNum: number;
  pageSize: number;
  conditions: {
    fuzzyConditions: { text?: string };
    exactConditions: Record<string, never>;
  };
};

export async function searchPositions(params: PositionSearchParams) {
  return unwrap<{
    result: PositionVo[];
    total: number;
    pageNum: number;
    pageSize: number;
    pages: number;
  }>(apiClient.admin.positions.search.$post({ json: params }));
}

export async function getPosition(posCode: string) {
  return unwrap<PositionVo>(
    apiClient.admin.positions[":posCode"].$get({ param: { posCode } }),
  );
}

export async function createPosition(body: {
  posCode: string;
  posName: string;
  description?: string;
  status?: number;
}) {
  return unwrap<boolean>(apiClient.admin.positions.$post({ json: body }));
}

export async function updatePosition(
  posCode: string,
  body: { posName?: string; description?: string | null; status?: number },
) {
  return unwrap<boolean>(
    apiClient.admin.positions[":posCode"].$put({ param: { posCode }, json: body }),
  );
}

export async function updatePositionStatus(posCode: string, status: number) {
  return unwrap<boolean>(
    apiClient.admin.positions[":posCode"].status.$patch({
      param: { posCode },
      json: { status },
    }),
  );
}

export async function deletePosition(posCode: string) {
  return unwrap<boolean>(
    apiClient.admin.positions[":posCode"].$delete({ param: { posCode } }),
  );
}
