import type { CustomSsoEmploymentV1 } from '@iam/client-subject-projection/custom-sso';
import { OrganizationType } from '@iam/contracts';

export function formatProjectionCompany(
  employment: CustomSsoEmploymentV1,
) {
  const companyNodes = employment.organization.path.filter(
    node => node.type === OrganizationType.Company,
  );
  return companyNodes[companyNodes.length - 1]?.name ?? '—';
}

export function formatProjectionOrganizationPath(
  employment: CustomSsoEmploymentV1,
) {
  return (
    employment.organization.path.map(node => node.name).join(' / ')
    || employment.organization.name
    || '—'
  );
}

export function formatProjectionPosition(
  employment: CustomSsoEmploymentV1,
) {
  return `${employment.position.name} (${employment.position.code})`;
}
