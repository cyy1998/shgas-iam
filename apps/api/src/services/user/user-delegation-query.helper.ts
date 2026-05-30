import type { UserQueryWithPrivilegeDelegationDto } from "./user.type";
import * as privilegeDelegationRepository from "@api/services/privilege/privilegeDelegation.repository";
import { toPrivilegeDelegationDto } from "@api/services/privilege/privilegeDelegation.schema";
import * as userRepository from "@api/services/user/user.repository";
import { CustomError } from "@iam/api-core/errors/CustomError";
import { UserDtoSchema } from "./user.schema";

export async function searchUsersWithDelegations(query: UserQueryWithPrivilegeDelegationDto) {
  const [orgCode] = query.ancestorOrgCodes;
  if (query.ancestorOrgCodes.length !== 1 || orgCode === undefined) {
    throw new CustomError("该接口ancestorOrgCodes元素数量只支持为1");
  }
  const users = await userRepository.searchUsers(query);
  const userDtos = users.map(u => UserDtoSchema.parse(u));
  const delegations = (await privilegeDelegationRepository.getDelegationsByUserAndOrganizationScopeAndPrivilege(
    userDtos.map(u => u.username),
    orgCode,
    query.privilegeCode,
  )).map(pd => toPrivilegeDelegationDto(pd));
  return {
    users: userDtos,
    delegations,
  };
}
