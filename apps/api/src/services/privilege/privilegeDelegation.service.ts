import type { Prettify } from "@api/utils/lint.util";
import type { PrivilegeDelegationServiceDeps, PrivilegeDelegationTransactionStorePort } from "./privilegeDelegation.port";
import type { PrivilegeDelegationCommandContext, PrivilegeDelegationCreateDto, PrivilegeDelegationQueryDto, PrivilegeDelegationRecord, PrivilegeDelegationUpdateDto } from "./privilegeDelegation.type";
import { withApiRequestContext } from "@api/services/audit/audit.context";
import { buildInternalDelegationCreateAudit, buildInternalDelegationUpdateAudit } from "@api/services/audit/events/internal.audit";
import { BadRequestError } from "@iam/api-core/errors/BadRequestError";
import { PrivilegeDelegationStatus } from "@iam/contracts";
import { OrganizationNotFoundError } from "@iam/domain/organization";
import {
  PrivilegeAlreadyDelegatedError,
  PrivilegeDelegationEndedError,
  PrivilegeDelegationNotFoundError,
  PrivilegeNotFoundError,
  validatePrivilegeDelegationCandidate,
} from "@iam/domain/privilege";
import { UserNotFoundError } from "@iam/domain/user";
import { PrivilegeDelegationCreateDtoSchema, PrivilegeDelegationUpdateDtoSchema, toPrivilegeDelegationDetailDto } from "./privilegeDelegation.schema";

export function createPrivilegeDelegationService(deps: PrivilegeDelegationServiceDeps) {
  async function queryPrivilegeDelegations(query: PrivilegeDelegationQueryDto) {
    const delegations = await deps.privilegeDelegationRepository.searchDelegations(query);
    return delegations.map(d => toPrivilegeDelegationDetailDto(d));
  }

  async function updateDelegation(
    id: number,
    input: PrivilegeDelegationUpdateDto,
    context: PrivilegeDelegationCommandContext,
  ) {
    const dto = PrivilegeDelegationUpdateDtoSchema.parse(input);
    return await deps.uow.transaction(async (tx) => {
      // This read only locates the immutable lock owner; no business state survives the lock wait.
      const delegatorUserId = await tx.privilegeDelegationRepository.getDelegatorUserId(id);
      if (delegatorUserId === null) {
        throw new PrivilegeDelegationNotFoundError(`委托记录不存在: ${id}`);
      }
      const delegator = await tx.userRepository.lockUserById(delegatorUserId);
      if (!delegator)
        throw new UserNotFoundError("委托人不存在");
      const existing = await tx.privilegeDelegationRepository.lockDelegationById(id);
      if (!existing)
        throw new PrivilegeDelegationNotFoundError(`委托记录不存在: ${id}`);
      if (existing.delegatorUserId !== delegator.id)
        throw new Error("Privilege Delegation lock owner changed");
      const fields = Object.keys(dto).filter(key => dto[key as keyof typeof dto] !== undefined);
      let changed = false;
      if (existing.status === PrivilegeDelegationStatus.Disable) {
        if (fields.length !== 1 || dto.status !== PrivilegeDelegationStatus.Disable)
          throw new PrivilegeDelegationEndedError("该委托已结束，不允许再修改");
      }
      else {
        if (fields.length === 0)
          throw new BadRequestError("更新参数不能为空");
        const candidate = {
          ...existing,
          startTime: dto.startTime ?? existing.startTime,
          endTime: dto.endTime ?? existing.endTime,
          status: dto.status ?? existing.status,
          description: dto.description === undefined ? existing.description : dto.description,
        };
        validatePrivilegeDelegationCandidate(candidate);
        await assertNoConflict(tx.privilegeDelegationRepository, candidate, id);
        changed = candidate.startTime.getTime() !== existing.startTime.getTime()
          || candidate.endTime.getTime() !== existing.endTime.getTime()
          || candidate.status !== existing.status
          || candidate.description !== existing.description;
        if (changed) {
          const updated = await tx.privilegeDelegationRepository.updateDelegation(id, dto);
          if (!updated)
            throw new Error("Locked Privilege Delegation update returned no row");
        }
      }
      await tx.auditLogWriter.recordAuditLog(withApiRequestContext(
        context.requestContext,
        buildInternalDelegationUpdateAudit(context.actor, id, dto, changed),
      ));
      return true;
    }, { observability: context.requestContext });
  }

  async function createPrivilegeDelegation(
    input: Prettify<PrivilegeDelegationCreateDto>,
    context: PrivilegeDelegationCommandContext,
  ) {
    const dto = PrivilegeDelegationCreateDtoSchema.parse(input);
    return await deps.uow.transaction(async (tx) => {
      const delegator = await tx.userRepository.lockUserByUsername(dto.delegatorUsername);
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

      const candidate = {
        ...dto,
        delegatorUserId: delegator.id,
        delegateeUserId: delegatee.id,
        organizationScopeId: organization.id,
        privilegeIds: privileges.map(p => p.id),
        status: PrivilegeDelegationStatus.Enable,
      };
      validatePrivilegeDelegationCandidate(candidate);
      await assertNoConflict(tx.privilegeDelegationRepository, candidate);
      const delegation = await tx.privilegeDelegationRepository.setPrivilegeDelegation(candidate);
      const result = toPrivilegeDelegationDetailDto(delegation);
      await tx.auditLogWriter.recordAuditLog(withApiRequestContext(
        context.requestContext,
        buildInternalDelegationCreateAudit(context.actor, {
          ...result,
          orgCode: dto.orgCode,
          privilegeCodes: dto.privilegeCodes,
        }),
      ));
      return result;
    }, { observability: context.requestContext });
  }

  return {
    queryPrivilegeDelegations,
    updateDelegation,
    createPrivilegeDelegation,
  };
}

export type PrivilegeDelegationService = ReturnType<typeof createPrivilegeDelegationService>;

type Candidate = Pick<PrivilegeDelegationRecord, "delegatorUserId" | "delegateeUserId" | "organizationScopeId" | "privilegeIds" | "startTime" | "endTime" | "status">;

async function assertNoConflict(
  repository: PrivilegeDelegationTransactionStorePort,
  candidate: Candidate,
  excludeId?: number,
) {
  if (candidate.status === PrivilegeDelegationStatus.Disable)
    return;
  const conflicting = await repository.hasConflictingDelegation(
    candidate.delegatorUserId,
    candidate.privilegeIds,
    candidate.startTime,
    candidate.endTime,
    candidate.organizationScopeId,
    excludeId,
  );
  if (conflicting)
    throw new PrivilegeAlreadyDelegatedError("权限在相交的组织范围和期间内已被授权");
}
