import { EmploymentOrganizationScopeMismatchError } from "@iam/domain/employment";

export async function assertEmploymentOrganizationScope(
  organizationReader: {
    isOrganizationDescendantOf: (
      descendantOrgCode: string,
      ancestorOrgCode: string,
    ) => Promise<boolean>;
  },
  orgCode: string,
  expectedAncestorOrgCode: string | undefined,
  mismatchMessage: string,
) {
  if (expectedAncestorOrgCode === undefined) {
    return;
  }
  const matches = await organizationReader.isOrganizationDescendantOf(
    orgCode,
    expectedAncestorOrgCode,
  );
  if (!matches) {
    throw new EmploymentOrganizationScopeMismatchError(mismatchMessage);
  }
}
