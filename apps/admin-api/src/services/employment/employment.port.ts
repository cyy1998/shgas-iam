import type {
  AdminEmploymentAuthorizationFacts,
  EmploymentAdminPaginationQueryDto,
  EmploymentDetail,
} from "./employment.type";

export interface AdminEmploymentReadScope {
  organizationIds: readonly number[];
}

export interface AdminEmploymentReaderPort {
  getEmploymentAuthorizationFactsByIdForAdmin: (id: number) => Promise<AdminEmploymentAuthorizationFacts | null>;
  getEmploymentByIdForAdmin: (id: number, scope?: AdminEmploymentReadScope) => Promise<EmploymentDetail | null>;
  searchEmploymentsFuzzyForAdminPaged: (
    query: EmploymentAdminPaginationQueryDto,
    scope?: AdminEmploymentReadScope,
  ) => Promise<{
    rows: EmploymentDetail[];
    total: number;
  }>;
}

export interface AdminEmploymentEffectiveRoleResolverPort {
  resolveEffectiveRoles: (input: { employmentIds: readonly number[] }) => Promise<
    ReadonlyMap<
      number,
      readonly {
        id: number;
        roleCode: string;
      }[]
    >
  >;
}

export interface AdminEmploymentServiceDeps {
  employmentRepository: AdminEmploymentReaderPort;
  roleAssignmentResolver: AdminEmploymentEffectiveRoleResolverPort;
  roleRepository: { getRoleNamesByIds: (ids: number[]) => Promise<Array<{ roleCode: string; roleName: string }>> };
}
