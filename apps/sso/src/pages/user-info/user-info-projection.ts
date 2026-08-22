import type { CustomSsoEmployment } from '@iam/client-subject-projection/custom-sso';
import { OrganizationType } from '@iam/contracts';

export function formatProjectionCompany(
  employment: CustomSsoEmployment,
) {
  const companyNodes = employment.organization.path.filter(
    node => node.type === OrganizationType.Company,
  );
  return companyNodes[companyNodes.length - 1]?.name ?? '—';
}

export function formatProjectionOrganizationPath(
  employment: CustomSsoEmployment,
) {
  return (
    employment.organization.path.map(node => node.name).join(' / ')
    || employment.organization.name
    || '—'
  );
}

export function formatProjectionPosition(
  employment: CustomSsoEmployment,
) {
  return `${employment.position.name} (${employment.position.code})`;
}
