export type OidcAuthorizationClaim = {
  employments: Array<{
    organization: {
      orgCode: string;
      orgName: string;
      orgType: string;
      fullOrgPath: Array<{
        orgCode: string;
        orgName: string;
        orgType: string;
      }>;
    };
    position: {
      posCode: string;
      posName: string;
    };
    roles: string[];
    privileges: string[];
  }>;
  roles: string[];
  privileges: string[];
};

export type OidcAuthorizationEmployment = OidcAuthorizationClaim["employments"][number] & {
  orderNum: number;
};

const sortCodes = (values: Iterable<string>) => [...new Set(values)].sort((a, b) => a.localeCompare(b));

export function buildOidcAuthorizationEmployment(
  employment: Omit<OidcAuthorizationEmployment, "roles" | "privileges"> & { roleIds: number[] },
  activeRoles: ReadonlyMap<number, string>,
  privilegesByRole: ReadonlyMap<number, string[]>,
): OidcAuthorizationEmployment {
  const roleIds = employment.roleIds.filter(roleId => activeRoles.has(roleId));
  return {
    orderNum: employment.orderNum,
    organization: employment.organization,
    position: employment.position,
    roles: sortCodes(roleIds.map(roleId => activeRoles.get(roleId)!).filter(Boolean)),
    privileges: sortCodes(roleIds.flatMap(roleId => privilegesByRole.get(roleId) ?? [])),
  };
}

export function assembleOidcAuthorizationClaim(employments: OidcAuthorizationEmployment[]): OidcAuthorizationClaim {
  const sorted = [...employments].sort((a, b) => a.orderNum - b.orderNum
    || a.organization.orgCode.localeCompare(b.organization.orgCode)
    || a.position.posCode.localeCompare(b.position.posCode));
  return {
    employments: sorted.map(({ orderNum: _orderNum, ...employment }) => employment),
    roles: sortCodes(sorted.flatMap(employment => employment.roles)),
    privileges: sortCodes(sorted.flatMap(employment => employment.privileges)),
  };
}
