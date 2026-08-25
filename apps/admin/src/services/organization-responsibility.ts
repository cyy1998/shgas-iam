import { apiClient } from '@admin/lib/api-client';
import type { AppRouter } from '@iam/admin-api/trpc';
import { ApiErrorCode } from '@iam/contracts';
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';

type AdminOrganizationResponsibilityInputs =
  inferRouterInputs<AppRouter>['admin']['organizationResponsibility'];
type AdminOrganizationResponsibilityOutputs =
  inferRouterOutputs<AppRouter>['admin']['organizationResponsibility'];

export type OrganizationResponsibilityTypeView =
  AdminOrganizationResponsibilityOutputs['listTypes'][number];

export function listOrganizationResponsibilityTypes() {
  return apiClient.admin.organizationResponsibility.listTypes.query({});
}

export type OrganizationResponsibilityAssignmentListInput =
  AdminOrganizationResponsibilityInputs['listAssignments'];
export type OrganizationResponsibilityAssignmentListResult =
  AdminOrganizationResponsibilityOutputs['listAssignments'];
export type OrganizationResponsibilityAssignmentSearchInput =
  AdminOrganizationResponsibilityInputs['searchAssignments'];
export type OrganizationResponsibilityAssignmentSearchResult =
  AdminOrganizationResponsibilityOutputs['searchAssignments'];
export type OrganizationResponsibilityAssignmentLifecycle = NonNullable<
  OrganizationResponsibilityAssignmentSearchInput['lifecycle']
>;
export const ORGANIZATION_RESPONSIBILITY_ASSIGNMENT_LIFECYCLES = [
  'open',
  'ended',
  'all',
] as const satisfies readonly OrganizationResponsibilityAssignmentLifecycle[];
export type OrganizationResponsibilityAssignmentView =
  OrganizationResponsibilityAssignmentSearchResult['items'][number];
export type OrganizationResponsibilityAssignmentCreateInput =
  AdminOrganizationResponsibilityInputs['createAssignment'];
export type OrganizationResponsibilityAssignmentLifecycleInput =
  AdminOrganizationResponsibilityInputs['pauseAssignment'];

export const OrganizationResponsibilityMutationErrorKind = {
  Validation: 'validation',
  NotFound: 'not-found',
  HolderUnavailable: 'holder-unavailable',
  TargetUnavailable: 'target-unavailable',
  NotOpen: 'not-open',
  Duplicate: 'duplicate',
  Cardinality: 'cardinality',
  Unmanageable: 'unmanageable',
  Forbidden: 'forbidden',
  Internal: 'internal',
  Network: 'network',
} as const;

type OrganizationResponsibilityMutationErrorKindValue =
  (typeof OrganizationResponsibilityMutationErrorKind)[keyof typeof OrganizationResponsibilityMutationErrorKind];

export class OrganizationResponsibilityMutationError extends Error {
  readonly kind: OrganizationResponsibilityMutationErrorKindValue;

  constructor(
    kind: OrganizationResponsibilityMutationErrorKindValue,
    cause?: unknown,
  ) {
    super(getOrganizationResponsibilityMutationErrorMessage(kind));
    this.name = OrganizationResponsibilityMutationError.name;
    this.kind = kind;
    this.cause = cause;
  }
}

export function listOrganizationResponsibilityAssignments(
  input: OrganizationResponsibilityAssignmentListInput,
) {
  return apiClient.admin.organizationResponsibility.listAssignments.query(
    input,
  );
}

export function searchOrganizationResponsibilityAssignments(
  input: OrganizationResponsibilityAssignmentSearchInput,
) {
  return apiClient.admin.organizationResponsibility.searchAssignments.query(
    input,
  );
}

export function getOrganizationResponsibilityAssignment(
  input: AdminOrganizationResponsibilityInputs['detailAssignment'],
) {
  return apiClient.admin.organizationResponsibility.detailAssignment.query(
    input,
  );
}

export async function createOrganizationResponsibilityAssignment(
  input: OrganizationResponsibilityAssignmentCreateInput,
) {
  return runOrganizationResponsibilityMutation(() =>
    apiClient.admin.organizationResponsibility.createAssignment.mutate(input),
  );
}

export async function pauseOrganizationResponsibilityAssignment(
  input: OrganizationResponsibilityAssignmentLifecycleInput,
) {
  return runOrganizationResponsibilityMutation(() =>
    apiClient.admin.organizationResponsibility.pauseAssignment.mutate(input),
  );
}

export async function resumeOrganizationResponsibilityAssignment(
  input: OrganizationResponsibilityAssignmentLifecycleInput,
) {
  return runOrganizationResponsibilityMutation(() =>
    apiClient.admin.organizationResponsibility.resumeAssignment.mutate(input),
  );
}

export async function endOrganizationResponsibilityAssignment(
  input: OrganizationResponsibilityAssignmentLifecycleInput,
) {
  return runOrganizationResponsibilityMutation(() =>
    apiClient.admin.organizationResponsibility.endAssignment.mutate(input),
  );
}

async function runOrganizationResponsibilityMutation<T>(
  mutation: () => Promise<T>,
) {
  try {
    return await mutation();
  } catch (error) {
    throw new OrganizationResponsibilityMutationError(
      toOrganizationResponsibilityMutationErrorKind(error),
      error,
    );
  }
}

function toOrganizationResponsibilityMutationErrorKind(
  error: unknown,
): OrganizationResponsibilityMutationErrorKindValue {
  const data = getTransportErrorData(error);
  const serviceCode = data?.serviceCode;
  if (serviceCode === ApiErrorCode.ValidationFailed)
    return OrganizationResponsibilityMutationErrorKind.Validation;
  if (
    serviceCode === ApiErrorCode.OrganizationResponsibilityAssignmentNotFound ||
    serviceCode === ApiErrorCode.EmploymentNotFound ||
    serviceCode === ApiErrorCode.OrganizationNotFound
  ) {
    return OrganizationResponsibilityMutationErrorKind.NotFound;
  }
  if (
    serviceCode ===
    ApiErrorCode.OrganizationResponsibilityHolderEmploymentUnavailable
  )
    return OrganizationResponsibilityMutationErrorKind.HolderUnavailable;
  if (
    serviceCode ===
    ApiErrorCode.OrganizationResponsibilityTargetOrganizationUnavailable
  )
    return OrganizationResponsibilityMutationErrorKind.TargetUnavailable;
  if (serviceCode === ApiErrorCode.OrganizationResponsibilityAssignmentNotOpen)
    return OrganizationResponsibilityMutationErrorKind.NotOpen;
  if (
    serviceCode ===
    ApiErrorCode.OrganizationResponsibilityAssignmentDuplicateOpen
  )
    return OrganizationResponsibilityMutationErrorKind.Duplicate;
  if (
    serviceCode ===
    ApiErrorCode.OrganizationResponsibilityAssignmentCardinalityConflict
  )
    return OrganizationResponsibilityMutationErrorKind.Cardinality;
  if (
    serviceCode ===
    ApiErrorCode.OrganizationResponsibilityAssignmentUnmanageableConflict
  )
    return OrganizationResponsibilityMutationErrorKind.Unmanageable;
  if (serviceCode === ApiErrorCode.Forbidden)
    return OrganizationResponsibilityMutationErrorKind.Forbidden;
  return data === undefined
    ? OrganizationResponsibilityMutationErrorKind.Network
    : OrganizationResponsibilityMutationErrorKind.Internal;
}

function getTransportErrorData(error: unknown) {
  if (typeof error !== 'object' || error === null) return undefined;
  const data = (error as { data?: unknown }).data;
  if (typeof data !== 'object' || data === null) return undefined;
  return data as { serviceCode?: unknown };
}

function getOrganizationResponsibilityMutationErrorMessage(
  kind: OrganizationResponsibilityMutationErrorKindValue,
) {
  const messages: Record<
    OrganizationResponsibilityMutationErrorKindValue,
    string
  > = {
    [OrganizationResponsibilityMutationErrorKind.Validation]:
      '请检查责任任命参数',
    [OrganizationResponsibilityMutationErrorKind.NotFound]:
      '责任任命或关联对象不存在',
    [OrganizationResponsibilityMutationErrorKind.HolderUnavailable]:
      '责任持有任职当前不可用',
    [OrganizationResponsibilityMutationErrorKind.TargetUnavailable]:
      '责任目标组织当前不可用',
    [OrganizationResponsibilityMutationErrorKind.NotOpen]: '责任任命已结束',
    [OrganizationResponsibilityMutationErrorKind.Duplicate]:
      '同一任职已持有该责任',
    [OrganizationResponsibilityMutationErrorKind.Cardinality]:
      '目标组织的责任已达到基数上限',
    [OrganizationResponsibilityMutationErrorKind.Unmanageable]:
      '责任槽位已占用；如果当前列表没有可管理记录，请联系完整管理员',
    [OrganizationResponsibilityMutationErrorKind.Forbidden]:
      '无权管理组织责任任命',
    [OrganizationResponsibilityMutationErrorKind.Internal]:
      '责任任命服务异常，已刷新权威状态',
    [OrganizationResponsibilityMutationErrorKind.Network]:
      '网络连接失败，已刷新权威状态',
  };
  return messages[kind];
}
