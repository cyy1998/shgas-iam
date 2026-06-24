import type { Prettify } from "@api/utils/lint.util";
import type { PrivilegeDelegationServiceDeps } from "./privilegeDelegation.port";
import type { PrivilegeDelegationCreateDto, PrivilegeDelegationQueryDto, PrivilegeDelegationUpdateDto } from "./privilegeDelegation.type";
import { PrivilegeDelegationStatus } from "@iam/contracts";
import { OrganizationNotFoundError } from "@iam/domain/organization";
import {
  PrivilegeAlreadyDelegatedError,
  PrivilegeDelegationEndedError,
  PrivilegeDelegationNotFoundError,
  PrivilegeNotFoundError,
} from "@iam/domain/privilege";
import { UserNotFoundError } from "@iam/domain/user";
import { toPrivilegeDelegationDetailDto } from "./privilegeDelegation.schema";

export function createPrivilegeDelegationService(deps: PrivilegeDelegationServiceDeps) {
  async function queryPrivilegeDelegations(query: PrivilegeDelegationQueryDto) {
    const delegations = await deps.privilegeDelegationRepository.searchDelegations(query);
    return delegations.map(d => toPrivilegeDelegationDetailDto(d));
  }

  async function updateDelegation(id: number, dto: PrivilegeDelegationUpdateDto) {
    return await deps.uow.transaction(async (tx) => {
      const existing = await tx.privilegeDelegationRepository.getDelegationById(id);
      if (!existing) {
        throw new PrivilegeDelegationNotFoundError(`委托记录不存在: ${id}`);
      }
      if (existing.status === PrivilegeDelegationStatus.Disable) {
        throw new PrivilegeDelegationEndedError("该委托已结束，不允许再修改");
      }
      await tx.privilegeDelegationRepository.updateDelegation(id, dto);
      return true;
    });
  }

  async function createPrivilegeDelegation(
    dto: Prettify<PrivilegeDelegationCreateDto>,
  ) {
    return await deps.uow.transaction(async (tx) => {
      const delegator = await tx.userRepository.getUserByUsername(dto.delegatorUsername);
      if (!delegator) {
        throw new UserNotFoundError(`委托人不存在: ${dto.delegatorUsername}`);
      }
      const delegatee = await tx.userRepository.getUserByUsername(dto.delegateeUsername);
      if (!delegatee) {
        throw new UserNotFoundError(`受托人不存在: ${dto.delegateeUsername}`);
      }

      const organization = await tx.organizationRepository.getOrganizationByCode(dto.orgCode);
      if (!organization) {
        throw new OrganizationNotFoundError(`组织不存在: ${dto.orgCode}`);
      }
      const privileges = await tx.privilegeRepository.searchPrivileges({
        privilegeCodes: dto.privilegeCodes,
      });
      if (privileges.length !== dto.privilegeCodes.length) {
        const foundCodes = privileges.map(p => p.privilegeCode);
        const notFound = dto.privilegeCodes.filter(c => !foundCodes.includes(c));
        throw new PrivilegeNotFoundError(`权限不存在: ${notFound.join(", ")}`);
      }

      const conflicting = await tx.privilegeDelegationRepository.getActiveDelegationsByDelegatorAndPrivileges(
        delegator.id,
        privileges.map(p => p.id),
        dto.startTime,
        dto.endTime,
      );
      if (conflicting.length > 0) {
        const delegatedCodes = [...new Set(
          conflicting.flatMap(d => d.delegationDetails.map(dd => dd.privilege.privilegeCode)),
        )].filter(code => dto.privilegeCodes.includes(code));
        throw new PrivilegeAlreadyDelegatedError(`以下权限已被授权: ${delegatedCodes.join(", ")}`);
      }

      const delegation = await tx.privilegeDelegationRepository.setPrivilegeDelegation({
        ...dto,
        delegatorUserId: delegator.id,
        delegateeUserId: delegatee.id,
        organizationScopeId: organization.id,
        privilegeIds: privileges.map(p => p.id),
      });
      return toPrivilegeDelegationDetailDto(delegation);
    });
  }

  return {
    queryPrivilegeDelegations,
    updateDelegation,
    createPrivilegeDelegation,
  };
}

export type PrivilegeDelegationService = ReturnType<typeof createPrivilegeDelegationService>;
