import { OrganizationType } from "@iam/contracts";
import type { CustomSsoEmployment } from "@iam/custom-sso/wire";

type PresentationEmployment = Omit<CustomSsoEmployment, "organization"> & {
  readonly organization: Omit<CustomSsoEmployment["organization"], "path"> & {
    readonly path: Readonly<CustomSsoEmployment["organization"]["path"]>;
  };
};

export function formatProjectionCompany(employment: PresentationEmployment) {
  const companyNodes = employment.organization.path.filter((node) => node.type === OrganizationType.Company);
  return companyNodes[companyNodes.length - 1]?.name ?? "—";
}

export function formatProjectionOrganizationPath(employment: PresentationEmployment) {
  return employment.organization.path.map((node) => node.name).join(" / ") || employment.organization.name || "—";
}

export function formatProjectionPosition(employment: PresentationEmployment) {
  return `${employment.position.name} (${employment.position.code})`;
}
