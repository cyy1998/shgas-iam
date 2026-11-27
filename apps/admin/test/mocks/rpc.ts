import type { AppRouter } from "@admin/lib/api-client";
import { ApiErrorCode, ORGANIZATION_RESPONSIBILITY_TYPE_CATALOG } from "@iam/contracts";
import type { inferRouterInputs } from "@trpc/server";
import { HttpResponse, http } from "msw";
import {
  adminCapabilitySummary,
  adminClientDetail,
  adminClientSearchResult,
  adminPositionSearchResult,
  adminUserDetail,
  adminUserSearchResult,
  currentAdminUser,
} from "./fixtures";

type RpcRequest = {
  procedure: string;
  method: string;
  input: unknown;
};

type RpcFailure = {
  httpStatus: number;
  serviceCode?: ApiErrorCode;
  serviceMessage: string;
};

class RpcError {
  constructor(readonly failure: RpcFailure) {}
}

export function rpcFailure(httpStatus: number, serviceCode?: ApiErrorCode, serviceMessage = "操作失败") {
  return new RpcError({ httpStatus, serviceCode, serviceMessage });
}

export const loginStateUnavailable = rpcFailure(503, ApiErrorCode.AdminLoginStateUnavailable, "登录状态服务暂时不可用");
export const auditFailedAfterEffect = rpcFailure(
  500,
  ApiErrorCode.AdminLoginStateAuditFailedAfterEffect,
  "登录状态已变更，但审计记录失败；请刷新确认且不要自动重试",
);
export const mutationCommitted = rpcFailure(500, ApiErrorCode.AdminMutationCommitted);

type RouterInputs = inferRouterInputs<AppRouter>["admin"];
type ModuleResolvers<Module extends keyof RouterInputs> = {
  [Procedure in keyof RouterInputs[Module] & string as `admin.${Module}.${Procedure}`]?: (
    input: RouterInputs[Module][Procedure],
    request: RpcRequest,
  ) => unknown;
};
type ResolverUnion = { [Module in keyof RouterInputs]: ModuleResolvers<Module> }[keyof RouterInputs];
type AdminResolvers = (
  ResolverUnion extends infer Resolver
    ? Resolver extends unknown
      ? (value: Resolver) => void
      : never
    : never
) extends (value: infer Resolvers) => void
  ? Resolvers
  : never;

export type RpcResolvers = AdminResolvers & {
  [Procedure in keyof RouterInputs["role"]["assignments"] & string as `admin.role.assignments.${Procedure}`]?: (
    input: RouterInputs["role"]["assignments"][Procedure],
  ) => unknown;
};

const defaultResolvers: RpcResolvers = {
  "admin.authorization.capabilitySummary": () => adminCapabilitySummary,
  "admin.user.search": () => adminUserSearchResult,
  "admin.user.detail": () => adminUserDetail,
  "admin.position.search": () => adminPositionSearchResult,
  "admin.position.detail": () => adminPositionSearchResult.result[0],
  "admin.customAttribute.list": () => [],
  "admin.organizationResponsibility.listTypes": () => ORGANIZATION_RESPONSIBILITY_TYPE_CATALOG,
  "admin.client.search": () => adminClientSearchResult,
  "admin.client.detail": ({ clientCode }) => ({ ...adminClientDetail, clientCode }),
  "admin.client.create": ({ clientCode }) => ({ changed: true, result: { ...adminClientDetail, clientCode } }),
  "admin.client.delete": () => ({ changed: true, result: null }),
};

function unwrapInput(input: unknown) {
  return input && typeof input === "object" && "json" in input ? input.json : input;
}

export function mockAdminRpc(resolvers: RpcResolvers = {}) {
  const requests: RpcRequest[] = [];
  const proceduresByName = { ...defaultResolvers, ...resolvers } as Record<
    string,
    ((input: unknown, request: RpcRequest) => unknown) | undefined
  >;
  const handler = http.all("*/rpc/:procedures", async ({ request, params }) => {
    const url = new URL(request.url);
    const procedures = String(params.procedures).split(",");
    const batch = url.searchParams.get("batch") === "1" || procedures.length > 1;
    const rawInput: unknown =
      request.method === "GET" ? JSON.parse(url.searchParams.get("input") ?? "null") : await request.json();

    const statuses = new Set<number>();
    const responses = await Promise.all(
      procedures.map(async (procedure, index) => {
        const batchInput = batch && rawInput && typeof rawInput === "object" ? Reflect.get(rawInput, index) : rawInput;
        const call = { procedure, method: request.method, input: unwrapInput(batchInput) };
        requests.push(call);
        const resolve = proceduresByName[procedure];
        if (!resolve) throw new Error(`No mock for Admin RPC ${procedure}`);
        const response = await resolve(call.input, call);
        if (!(response instanceof RpcError)) {
          statuses.add(200);
          return { result: { data: response } };
        }
        const { httpStatus, serviceCode, serviceMessage } = response.failure;
        statuses.add(httpStatus);
        return {
          error: {
            code: -32603,
            message: serviceMessage,
            data: { code: "INTERNAL_SERVER_ERROR", httpStatus, path: procedure, serviceCode, serviceMessage },
          },
        };
      }),
    );
    return HttpResponse.json(batch ? responses : responses[0], {
      status: statuses.size > 1 ? 207 : statuses.values().next().value,
    });
  });
  return { handler, requests, collectMutationRequests: () => requests.filter(({ method }) => method === "POST") };
}

export function mockCurrentAdminUser(user: unknown = currentAdminUser) {
  return http.get("*/api/iam/sso/user-info", () => HttpResponse.json({ code: 200, message: "OK", data: user }));
}
