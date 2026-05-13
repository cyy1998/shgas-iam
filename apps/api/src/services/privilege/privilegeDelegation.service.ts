import type { Prettify } from "@api/utils/lint.util";
import type { PrivilegeDelegationCreateDto, PrivilegeDelegationQueryDto, PrivilegeDelegationUpdateDto } from "./privilegeDelegation.type";
import * as organizationRepository from "@api/services/organization/organization.repository";
import * as privilegeRepository from "@api/services/privilege/privilege.repository";
import * as delegationRepository from "@api/services/privilege/privilegeDelegation.repository";
import * as userRepository from "@api/services/user/user.repository";
import { CustomError } from "@iam/api-core/errors/CustomError";
import { Status } from "@iam/contracts";
import db from "@iam/db";
import { PrivilegeDelegationDetailDtoConverterSchema } from "./privilegeDelegation.schema";

export async function queryPrivilegeDelegations(query: PrivilegeDelegationQueryDto) {
  const delegations = await delegationRepository.searchDelegations(query);
  return delegations.map(d => PrivilegeDelegationDetailDtoConverterSchema.parse(d));
}

export async function updateDelegation(id: number, dto: PrivilegeDelegationUpdateDto) {
  return await db.transaction(async (tx) => {
    const existing = await tx.query.privilegeDelegations.findFirst({ where: { id } });
    if (!existing) {
      throw new CustomError(`委托记录不存在: ${id}`);
    }
    if (existing.status === Status.Disable) {
      throw new CustomError("该委托已结束，不允许再修改");
    }
    await delegationRepository.updateDelegation(id, dto, tx);
    return true;
  });
}

export async function createPrivilegeDelegation(
  dto: Prettify<PrivilegeDelegationCreateDto>,
) {
  return await db.transaction(async (tx) => {
    const delegator = await userRepository.getUserByUsername(dto.delegatorUsername, tx);
    if (!delegator) {
      throw new CustomError(`委托人不存在: ${dto.delegatorUsername}`);
    }
    const delegatee = await userRepository.getUserByUsername(dto.delegateeUsername, tx);
    if (!delegatee) {
      throw new CustomError(`受托人不存在: ${dto.delegateeUsername}`);
    }

    const organization = await organizationRepository.getOrganizationByCode(dto.orgCode, tx);
    if (!organization) {
      throw new CustomError(`组织不存在: ${dto.orgCode}`);
    }
    const privileges = await privilegeRepository.searchPrivileges({
      privilegeCodes: dto.privilegeCodes,
    }, tx);
    if (privileges.length !== dto.privilegeCodes.length) {
      const foundCodes = privileges.map(p => p.privilegeCode);
      const notFound = dto.privilegeCodes.filter(c => !foundCodes.includes(c));
      throw new CustomError(`权限不存在: ${notFound.join(", ")}`);
    }

    const conflicting = await delegationRepository.getActiveDelegationsByDelegatorAndPrivileges(
      delegator.id,
      privileges.map(p => p.id),
      dto.startTime,
      dto.endTime,
      tx,
    );
    if (conflicting.length > 0) {
      const delegatedCodes = [...new Set(
        conflicting.flatMap(d => d.delegationDetails.map(dd => dd.privilege.privilegeCode)),
      )].filter(code => dto.privilegeCodes.includes(code));
      throw new CustomError(`以下权限已被授权: ${delegatedCodes.join(", ")}`);
    }

    const delegation = await delegationRepository.setPrivilegeDelegation({
      ...dto,
      delegatorUserId: delegator.id,
      delegateeUserId: delegatee.id,
      organizationScopeId: organization.id,
      privilegeIds: privileges.map(p => p.id),
    }, tx);
    return PrivilegeDelegationDetailDtoConverterSchema.parse(delegation);
  });
}
