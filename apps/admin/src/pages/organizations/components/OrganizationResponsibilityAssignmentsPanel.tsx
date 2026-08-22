import OrganizationResponsibilityAssignmentModule from '@admin/components/organization-responsibility/OrganizationResponsibilityAssignmentModule';

export default function OrganizationResponsibilityAssignmentsPanel({
  orgCode,
}: {
  orgCode: string;
}) {
  return (
    <OrganizationResponsibilityAssignmentModule
      key={orgCode}
      host={{ kind: 'organization', targetOrganizationCode: orgCode }}
    />
  );
}
