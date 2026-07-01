import type { UserDelegationQueryDeps } from "./user.port";
import type { UserQueryWithPrivilegeDelegationDto } from "./user.type";
import { toPrivilegeDelegationDto } from "@api/services/privilege/privilegeDelegation.schema";
import { CustomError } from "@iam/api-core/errors/CustomError";

export function createUserDelegationQuery(deps: UserDelegationQueryDeps) {
  async function searchUsersWithDelegations(query: UserQueryWithPrivilegeDelegationDto) {
    const [orgCode] = query.ancestorOrgCodes;
    if (query.ancestorOrgCodes.length !== 1 || orgCode === undefined) {
      throw new CustomError("该接口ancestorOrgCodes元素数量只支持为1");
    }
    const userDtos = await deps.profileQuery.searchLegacyUsers(query);
    const delegations = (await deps.privilegeDelegationRepository.getDelegationsByUserAndOrganizationScopeAndPrivilege(
      userDtos.map(u => u.username),
      orgCode,
      query.privilegeCode,
    )).map(pd => toPrivilegeDelegationDto(pd));
    return {
      users: userDtos,
      delegations,
    };
  }

  return { searchUsersWithDelegations };
}

export type UserDelegationQuery = ReturnType<typeof createUserDelegationQuery>;
