import type {
  LoginRestrictionListInput,
  LoginRestrictionListResult,
  LoginRestrictionReleaseInput,
  LoginRestrictionReleaseResult,
  SessionListInput,
  SessionListResult,
  SessionRevokeInput,
  SessionRevokeResult,
} from '@admin/services/session-management';
import {
  ApiErrorCode,
  ORGANIZATION_RESPONSIBILITY_TYPE_CATALOG,
} from '@iam/contracts';
// Mock-backend fixtures owned by the browser Integration collection.
import type { Page, Route } from '@playwright/test';
import {
  adminCapabilitySummary,
  adminClientDetail,
  adminClientSearchResult,
  adminPositionSearchResult,
  adminUserDetail,
  adminUserSearchResult,
  currentAdminUser,
} from '../../test/mocks/fixtures';

function ok<T>(data: T) {
  return { code: 200, message: 'OK', data };
}

export async function fulfillJson(route: Route, data: unknown) {
  await route.fulfill({
    contentType: 'application/json',
    json: data,
    status: 200,
  });
}

export async function fulfillTrpc(route: Route, data: unknown) {
  await fulfillJson(route, [{ result: { data } }]);
}

type TrpcFailureResponse = {
  httpStatus: number;
  serviceCode: string;
  serviceMessage: string;
};

type TrpcOperationResponse<TResult, TFailure extends string> =
  { type: 'success'; data: TResult } | { type: TFailure };

type TrpcOperationResponder<TInput, TResult, TFailure extends string> = (
  input: TInput,
  requestNumber: number,
) =>
  | TrpcOperationResponse<TResult, TFailure>
  | Promise<TrpcOperationResponse<TResult, TFailure>>;

const loginStateUnavailableFailure = {
  httpStatus: 503,
  serviceCode: ApiErrorCode.AdminLoginStateUnavailable,
  serviceMessage: '登录状态服务暂时不可用',
} satisfies TrpcFailureResponse;

const auditFailedAfterEffectFailure = {
  httpStatus: 500,
  serviceCode: ApiErrorCode.AdminLoginStateAuditFailedAfterEffect,
  serviceMessage: '登录状态已变更，但审计记录失败；请刷新确认且不要自动重试',
} satisfies TrpcFailureResponse;

const requestFailedFailure = {
  httpStatus: 500,
  serviceCode: 'COMMON.INTERNAL_ERROR',
  serviceMessage: 'internal detail must stay hidden',
} satisfies TrpcFailureResponse;

async function mockTrpcOperationRoute<TInput, TResult, TFailure extends string>(
  page: Page,
  operation: string,
  respond: TrpcOperationResponder<TInput, TResult, TFailure>,
  failures: Record<TFailure, TrpcFailureResponse>,
) {
  const inputs: TInput[] = [];
  await page.route(`**/rpc/${operation}**`, async (route) => {
    const input = parseTrpcBatchInput<TInput>(route);
    inputs.push(input);
    const response = await respond(input, inputs.length);
    if ('data' in response) {
      await fulfillTrpc(route, response.data);
      return;
    }
    const failure = failures[response.type];
    await fulfillJson(route, [
      {
        error: {
          message: failure.serviceMessage,
          code: -32603,
          data: {
            code: 'INTERNAL_SERVER_ERROR',
            httpStatus: failure.httpStatus,
            path: operation,
            serviceCode: failure.serviceCode,
            serviceMessage: failure.serviceMessage,
          },
        },
      },
    ]);
  });
  return inputs;
}

function mockTrpcQueryRoute<TInput, TResult>(
  page: Page,
  operation: string,
  respond: TrpcOperationResponder<TInput, TResult, 'login-state-unavailable'>,
) {
  return mockTrpcOperationRoute(page, operation, respond, {
    'login-state-unavailable': loginStateUnavailableFailure,
  });
}

function mockTrpcMutationRoute<TInput, TResult, TFailure extends string>(
  page: Page,
  operation: string,
  respond: TrpcOperationResponder<TInput, TResult, TFailure>,
  failures: Record<TFailure, TrpcFailureResponse>,
) {
  return mockTrpcOperationRoute(page, operation, respond, failures);
}

type SessionListRouteResponse = TrpcOperationResponse<
  SessionListResult,
  'login-state-unavailable'
>;

export async function mockSessionListRoute(
  page: Page,
  respond: (
    input: SessionListInput,
    requestNumber: number,
  ) => SessionListRouteResponse | Promise<SessionListRouteResponse>,
) {
  return mockTrpcQueryRoute(
    page,
    'admin.sessionManagement.listSessions',
    respond,
  );
}

type LoginRestrictionListRouteResponse = TrpcOperationResponse<
  LoginRestrictionListResult,
  'login-state-unavailable'
>;

export async function mockLoginRestrictionListRoute(
  page: Page,
  respond: (
    input: LoginRestrictionListInput,
    requestNumber: number,
  ) =>
    | LoginRestrictionListRouteResponse
    | Promise<LoginRestrictionListRouteResponse>,
) {
  return mockTrpcQueryRoute(
    page,
    'admin.sessionManagement.listLoginRestrictions',
    respond,
  );
}

type LoginRestrictionReleaseFailure =
  'audit-failed-after-effect' | 'login-state-unavailable' | 'request-failed';

type LoginRestrictionReleaseRouteResponse = TrpcOperationResponse<
  LoginRestrictionReleaseResult,
  LoginRestrictionReleaseFailure
>;

export async function mockLoginRestrictionReleaseRoute(
  page: Page,
  respond: (
    input: LoginRestrictionReleaseInput,
    requestNumber: number,
  ) =>
    | LoginRestrictionReleaseRouteResponse
    | Promise<LoginRestrictionReleaseRouteResponse>,
) {
  return mockTrpcMutationRoute(
    page,
    'admin.sessionManagement.releaseLoginRestriction',
    respond,
    {
      'audit-failed-after-effect': auditFailedAfterEffectFailure,
      'login-state-unavailable': loginStateUnavailableFailure,
      'request-failed': requestFailedFailure,
    },
  );
}

type SessionRevokeFailure =
  | 'audit-failed-after-effect'
  | 'current-session-protected'
  | 'login-state-unavailable'
  | 'request-failed';

type SessionRevokeRouteResponse = TrpcOperationResponse<
  SessionRevokeResult,
  SessionRevokeFailure
>;

export async function mockSessionRevokeRoute(
  page: Page,
  respond: (
    input: SessionRevokeInput,
    requestNumber: number,
  ) => SessionRevokeRouteResponse | Promise<SessionRevokeRouteResponse>,
) {
  return mockTrpcMutationRoute(
    page,
    'admin.sessionManagement.revokeSessions',
    respond,
    {
      'audit-failed-after-effect': auditFailedAfterEffectFailure,
      'current-session-protected': {
        httpStatus: 409,
        serviceCode: ApiErrorCode.AdminSessionCurrentProtected,
        serviceMessage: '当前管理会话不能被强制下线',
      },
      'login-state-unavailable': loginStateUnavailableFailure,
      'request-failed': requestFailedFailure,
    },
  );
}

export async function mockAdminApi(
  page: Page,
  options: {
    capabilitySummary?: unknown;
    currentUser?: unknown;
    positionSearchResult?: unknown;
    userDetail?: unknown;
    userSearchResult?: unknown;
  } = {},
) {
  await page.route('**/public/user-info', (route) =>
    fulfillJson(route, ok(options.currentUser ?? currentAdminUser)),
  );
  await page.route('**/rpc/admin.user.search**', (route) =>
    fulfillTrpc(route, options.userSearchResult ?? adminUserSearchResult),
  );
  await page.route('**/rpc/admin.user.detail**', (route) =>
    fulfillTrpc(route, options.userDetail ?? adminUserDetail),
  );
  await page.route('**/rpc/admin.position.search**', (route) =>
    fulfillTrpc(
      route,
      options.positionSearchResult ?? adminPositionSearchResult,
    ),
  );
  await page.route('**/rpc/admin.authorization.capabilitySummary**', (route) =>
    fulfillTrpc(route, options.capabilitySummary ?? adminCapabilitySummary),
  );
  await page.route(
    '**/rpc/admin.organizationResponsibility.listTypes**',
    (route) =>
      fulfillTrpc(
        route,
        ORGANIZATION_RESPONSIBILITY_TYPE_CATALOG.map((entry) => ({ ...entry })),
      ),
  );
  await page.route('**/rpc/admin.client.search**', (route) =>
    fulfillTrpc(route, adminClientSearchResult),
  );
  await page.route('**/rpc/admin.client.detail**', (route) =>
    fulfillTrpc(route, adminClientDetail),
  );
  await page.route('**/rpc/admin.client.create**', (route) => {
    const input = parseTrpcBatchInput<{ clientCode?: string }>(route);
    return fulfillTrpc(route, {
      ...adminClientDetail,
      clientCode: input.clientCode ?? adminClientDetail.clientCode,
    });
  });
  await page.route('**/rpc/admin.client.update**', (route) =>
    fulfillTrpc(route, adminClientDetail),
  );
  await page.route('**/rpc/admin.client.updateStatus**', (route) =>
    fulfillTrpc(route, adminClientDetail),
  );
  await page.route('**/rpc/admin.client.delete**', (route) =>
    fulfillTrpc(route, adminClientDetail),
  );
  await page.route('**/rpc/admin.client.customSsoConfigure**', (route) =>
    fulfillTrpc(route, {
      client: adminClientDetail,
      customSsoSecret: 'iam_sso_once_secret',
    }),
  );
  await page.route('**/rpc/admin.client.customSsoEnable**', (route) =>
    fulfillTrpc(route, { client: adminClientDetail }),
  );
  await page.route('**/rpc/admin.client.customSsoDisable**', (route) =>
    fulfillTrpc(route, { client: adminClientDetail }),
  );
  await page.route('**/rpc/admin.client.customSsoRemove**', (route) =>
    fulfillTrpc(route, { client: adminClientDetail }),
  );
  await page.route('**/rpc/admin.client.customSsoRotateSecret**', (route) =>
    fulfillTrpc(route, {
      client: adminClientDetail,
      customSsoSecret: 'iam_sso_rotated_once_secret',
    }),
  );
  await page.route('**/rpc/admin.client.oidcConfigure**', (route) =>
    fulfillTrpc(route, { client: adminClientDetail }),
  );
  await page.route('**/rpc/admin.client.oidcEnable**', (route) =>
    fulfillTrpc(route, { client: adminClientDetail }),
  );
  await page.route('**/rpc/admin.client.oidcDisable**', (route) =>
    fulfillTrpc(route, { client: adminClientDetail }),
  );
  await page.route('**/rpc/admin.client.oidcRemove**', (route) =>
    fulfillTrpc(route, { client: adminClientDetail }),
  );
  await page.route('**/rpc/admin.client.oidcRotateSecret**', (route) =>
    fulfillTrpc(route, {
      client: adminClientDetail,
      clientSecret: 'oidc_once_secret',
    }),
  );
}

export function parseTrpcBatchInput<T>(route: Route): T {
  const request = route.request();
  const encodedInput = new URL(request.url()).searchParams.get('input');
  const batch = encodedInput
    ? JSON.parse(encodedInput)
    : request.postDataJSON();
  return batch?.['0']?.json ?? batch?.['0'] ?? batch?.json ?? batch ?? {};
}
