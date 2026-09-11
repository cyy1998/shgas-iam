import OrganizationResponsibilityAssignmentModule, {
  type OrganizationResponsibilityAssignmentState,
} from '@admin/components/organization-responsibility/OrganizationResponsibilityAssignmentModule';
import { ORGANIZATION_RESPONSIBILITY_ASSIGNMENT_LIFECYCLES } from '@admin/services/organization-responsibility';
import { PageContainer } from '@ant-design/pro-components';
import {
  ORGANIZATION_RESPONSIBILITY_TYPE_CATALOG,
  type OrganizationResponsibilityTypeCode,
} from '@iam/contracts';
import { history, useLocation } from '@umijs/max';
import { Alert } from 'antd';

const assignmentPath = '/organization-responsibilities/assignments';
const typeCodes = new Set<string>(
  ORGANIZATION_RESPONSIBILITY_TYPE_CATALOG.map((type) => type.code),
);
const lifecycles = new Set<string>(
  ORGANIZATION_RESPONSIBILITY_ASSIGNMENT_LIFECYCLES,
);

function parsePositiveInteger(value: string | null) {
  if (value === null) return undefined;
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseOrganizationResponsibilityAssignmentState(
  search: string,
): OrganizationResponsibilityAssignmentState | null {
  const params = new URLSearchParams(search);
  const employmentId = parsePositiveInteger(params.get('employment'));
  const assignmentId = parsePositiveInteger(params.get('assignment'));
  const pageNum = parsePositiveInteger(params.get('page'));
  const pageSize = parsePositiveInteger(params.get('pageSize'));
  const typeCode = params.get('type');
  const targetOrganizationCode = params.get('target');
  const lifecycle = params.get('lifecycle') ?? 'open';

  if (
    employmentId === null ||
    assignmentId === null ||
    pageNum === null ||
    pageSize === null ||
    (pageSize !== undefined && pageSize > 100) ||
    (params.has('target') && !targetOrganizationCode) ||
    (typeCode !== null && !typeCodes.has(typeCode)) ||
    !lifecycles.has(lifecycle)
  ) {
    return null;
  }

  return {
    ...(targetOrganizationCode ? { targetOrganizationCode } : {}),
    ...(employmentId === undefined ? {} : { employmentId }),
    ...(typeCode === null
      ? {}
      : { typeCode: typeCode as OrganizationResponsibilityTypeCode }),
    lifecycle:
      lifecycle as OrganizationResponsibilityAssignmentState['lifecycle'],
    assignmentId: assignmentId ?? null,
    ...(pageNum === undefined ? {} : { pageNum }),
    ...(pageSize === undefined ? {} : { pageSize }),
  };
}

function serializeState(state: OrganizationResponsibilityAssignmentState) {
  const params = new URLSearchParams();
  if (state.targetOrganizationCode) {
    params.set('target', state.targetOrganizationCode);
  }
  if (state.employmentId) params.set('employment', String(state.employmentId));
  if (state.typeCode) params.set('type', state.typeCode);
  params.set('lifecycle', state.lifecycle);
  if (state.assignmentId) params.set('assignment', String(state.assignmentId));
  if (state.pageNum && state.pageNum !== 1)
    params.set('page', String(state.pageNum));
  if (state.pageSize && state.pageSize !== 20)
    params.set('pageSize', String(state.pageSize));
  return `${assignmentPath}?${params.toString()}`;
}

export default function OrganizationResponsibilityAssignmentsPage() {
  const location = useLocation();
  const state = parseOrganizationResponsibilityAssignmentState(location.search);

  return (
    <PageContainer title="责任任命" breadcrumbRender={false}>
      {state === null ? (
        <Alert
          type="error"
          showIcon
          message="责任任命链接参数无效"
          description="请检查筛选条件或详情链接。"
        />
      ) : (
        <OrganizationResponsibilityAssignmentModule
          key={location.search}
          host={{
            kind: 'global',
            state,
            onStateChange: (nextState) => {
              history.replace(serializeState(nextState));
            },
          }}
        />
      )}
    </PageContainer>
  );
}
