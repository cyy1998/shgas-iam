import {
  ORGANIZATION_RESPONSIBILITY_TYPE_CATALOG,
  OrganizationResponsibilityAssignmentStatus,
  type OrganizationResponsibilityTypeCode,
} from '@iam/contracts';

const typeNames = new Map(
  ORGANIZATION_RESPONSIBILITY_TYPE_CATALOG.map((type) => [
    type.code,
    type.name,
  ]),
);
const statusNames: Record<OrganizationResponsibilityAssignmentStatus, string> =
  {
    [OrganizationResponsibilityAssignmentStatus.Enable]: '启用',
    [OrganizationResponsibilityAssignmentStatus.Pause]: '暂停',
    [OrganizationResponsibilityAssignmentStatus.Disable]: '已结束',
  };

export function formatOrganizationResponsibilityType(
  typeCode: OrganizationResponsibilityTypeCode,
) {
  return `${typeNames.get(typeCode) ?? typeCode}（${typeCode}）`;
}

export function formatOrganizationResponsibilityStatus(
  status: OrganizationResponsibilityAssignmentStatus,
) {
  return statusNames[status];
}
