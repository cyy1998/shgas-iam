import type { AdminOrganizationAuthorization } from "@admin-api/services/admin-authorization/admin-organization-authorization.type";
import type { AdminAuditContext } from "@admin-api/services/audit/audit.context";
import type {
  OrganizationCreateDto,
  OrganizationPaginationQueryDto,
  OrganizationSelectorQueryDto,
  OrganizationTreeNodeDto,
  OrganizationUpdateDto,
} from "@admin-api/services/organization/organization.type";
import type {
  AdminOrganizationReadScope,
  AdminOrganizationServiceDeps,
} from "./organization.port";
import { adminAuditTransactionOptions } from "@admin-api/services/audit/audit.context";
import { buildOrganizationAudit } from "@admin-api/services/audit/events/organization.audit";
import { toOrganizationDto } from "@admin-api/services/organization/organization.schema";
import { paginate } from "@iam/api-core/utils";
import { OrganizationLevel, OrganizationStatus, organizationStatusToString } from "@iam/contracts";
import {
  OrganizationAlreadyExistsError,
  OrganizationCodeExistsError,
  OrganizationHasChildrenError,
  OrganizationHasEmploymentError,
  OrganizationNotFoundError,
} from "@iam/domain/organization";

export function createOrganizationService(deps: AdminOrganizationServiceDeps) {
  function readScope(
    authorization?: AdminOrganizationAuthorization,
  ): AdminOrganizationReadScope | undefined {
    return authorization?.kind === "scoped"
      ? {
          organizationIds: authorization.organizationIds,
          rootOrganizationIds: authorization.rootOrganizationIds,
        }
      : undefined;
  }

  async function setOrganization(
    organizationCreateDto: OrganizationCreateDto,
    auditContext?: AdminAuditContext,
    authorization?: AdminOrganizationAuthorization,
  ) {
    return await deps.uow.transaction(async (tx) => {
      const newOrg = await tx.organizationRepository.getOrganizationByCode(organizationCreateDto.orgCode);
      let parentOrg = organizationCreateDto.parentCode
        ? await tx.organizationRepository.getOrganizationByCode(organizationCreateDto.parentCode)
        : null;
      if (authorization?.kind === "scoped") {
        const parentCode = organizationCreateDto.parentCode;
        if (typeof parentCode !== "string" || parentCode.length === 0) {
          return authorization.denyMutation({
            operationId: "admin.organization.create",
            resourceIdentifier: organizationCreateDto.orgCode,
            reason: "ACTION_NOT_GRANTED",
          });
        }
        const candidateParent = await tx.organizationRepository
          .getOrganizationByCodeForAdmin(parentCode);
        if (
          candidateParent === null
          || !authorization.organizationIds.includes(candidateParent.id)
        ) {
          authorization.denyMutation({
            operationId: "admin.organization.create",
            resourceIdentifier: parentCode,
            reason: "RESOURCE_OUT_OF_SCOPE",
            concealExistence: true,
          });
        }
        if (candidateParent === null)
          throw new OrganizationNotFoundError();
        if (
          candidateParent.status !== OrganizationStatus.Enable
          || candidateParent.level === OrganizationLevel.Five
        ) {
          authorization.denyMutation({
            operationId: "admin.organization.create",
            resourceIdentifier: parentCode,
            reason: "RESOURCE_STATE_NOT_ACTIONABLE",
          });
        }
        parentOrg = candidateParent;
      }
      if (
        authorization?.kind === "scoped"
        && newOrg !== null
        && !authorization.organizationIds.includes(newOrg.id)
      ) {
        authorization.denyMutation({
          operationId: "admin.organization.create",
          resourceIdentifier: organizationCreateDto.orgCode,
          reason: "RESOURCE_OUT_OF_SCOPE",
          concealExistence: true,
        });
      }
      if (newOrg !== null) {
        throw new OrganizationAlreadyExistsError("待创建组织已存在");
      }
      const created = await tx.organizationRepository.setOrganization(
        organizationCreateDto,
        parentOrg,
      );
      await tx.auditService.recordAuditLog(buildOrganizationAudit("admin.organization.create", created, {
        parentCode: organizationCreateDto.parentCode ?? null,
        orgType: organizationCreateDto.orgType,
      }, auditContext));
      return true;
    }, adminAuditTransactionOptions(auditContext));
  }

  async function getOrganizationChildrenForAdmin(
    parentOrgCode: string | null,
    pageNum: number,
    pageSize: number,
    authorization?: AdminOrganizationAuthorization,
  ) {
    const scope = readScope(authorization);
    if (
      scope
      && parentOrgCode !== null
      && await deps.organizationRepository.getOrganizationByCodeForAdmin(
        parentOrgCode,
        scope,
      ) === null
    ) {
      throw new OrganizationNotFoundError("组织不存在");
    }
    const { rows, total } = await deps.organizationRepository.listOrgChildrenByParentCode(
      parentOrgCode,
      pageNum,
      pageSize,
      scope,
    );
    const result: OrganizationTreeNodeDto[] = rows.map(r => ({
      id: r.id,
      orgCode: r.orgCode,
      orgName: r.orgName,
      orgType: r.orgType,
      status: r.status,
      level: r.level,
      parentId: r.parentId,
      orderNum: r.orderNum,
      isLeaf: r.childCount === 0,
    }));
    const pages = total === 0 ? 0 : Math.ceil(total / pageSize);
    return { result, total, pageNum, pageSize, pages };
  }

  async function getOrganizationDetailByCodeForAdmin(
    orgCode: string,
    authorization?: AdminOrganizationAuthorization,
  ) {
    const org = await deps.organizationRepository.getOrganizationByCodeForAdmin(
      orgCode,
      readScope(authorization),
    );
    if (org === null) {
      throw new OrganizationNotFoundError("组织不存在");
    }
    const [employmentCount, hasOpenResponsibilityAssignment] = await Promise.all([
      deps.organizationRepository.countOpenEmploymentsByOrgCode(orgCode),
      deps.responsibilityReader.hasOpenAssignmentTargetingOrganizationSubtree(org.id),
    ]);
    const dto = toOrganizationDto(org);
    return {
      ...dto,
      statusText: organizationStatusToString[dto.status] ?? "未知",
      childrenCount: org.children.length,
      employmentCount,
      authorizationFacts: {
        status: org.status,
        level: org.level,
        childrenCount: org.children.length,
        employmentCount,
        hasOpenResponsibilityAssignment,
      },
    };
  }

  async function searchOrganizationsForAdmin(
    query: OrganizationPaginationQueryDto,
    authorization?: AdminOrganizationAuthorization,
  ) {
    const orgs = await deps.organizationRepository.searchOrganizationsForAdmin(
      query,
      readScope(authorization),
    );
    const vos = orgs.map((o) => {
      const dto = toOrganizationDto(o);
      return {
        ...dto,
        statusText: organizationStatusToString[dto.status] ?? "未知",
        childrenCount: o.children.length,
      };
    });
    return paginate(vos, query);
  }

  async function getOrganizationSelectorNodesForAdmin(
    query: OrganizationSelectorQueryDto,
    authorization?: AdminOrganizationAuthorization,
  ) {
    return await deps.organizationRepository.getOrganizationSelectorNodesForAdmin(
      query,
      readScope(authorization),
    );
  }

  async function updateOrganization(
    orgCode: string,
    data: OrganizationUpdateDto,
    auditContext?: AdminAuditContext,
    authorization?: AdminOrganizationAuthorization,
    action = "admin.organization.update",
  ) {
    return await deps.uow.transaction(async (tx) => {
      const existing = await tx.organizationRepository.getOrganizationByCodeForAdmin(orgCode);
      if (existing === null) {
        throw new OrganizationNotFoundError("组织不存在");
      }
      if (
        authorization?.kind === "scoped"
        && !authorization.organizationIds.includes(existing.id)
      ) {
        authorization.denyMutation({
          operationId: action === "admin.organization.status_update"
            ? "admin.organization.updateStatus"
            : "admin.organization.update",
          resourceIdentifier: orgCode,
          reason: "RESOURCE_OUT_OF_SCOPE",
          concealExistence: true,
        });
      }
      if (
        authorization?.kind === "scoped"
        && data.orgCode !== undefined
        && data.orgCode !== orgCode
      ) {
        authorization.denyMutation({
          operationId: "admin.organization.update",
          resourceIdentifier: orgCode,
          reason: "ACTION_NOT_GRANTED",
        });
      }
      if (data.orgCode && data.orgCode !== orgCode) {
        const conflict = await tx.organizationRepository.getOrganizationByCode(data.orgCode);
        if (conflict !== null) {
          throw new OrganizationCodeExistsError(`组织编码已存在: ${data.orgCode}`);
        }
      }
      if (
        data.status !== undefined
        && data.status !== existing.status
        && data.status !== OrganizationStatus.Enable
      ) {
        await tx.responsibilityParentLifecycle
          .assertNoOpenAssignmentsTargetingOrganizationSubtree({
            organizationId: existing.id,
          });
        const employmentCount = await tx.organizationRepository.countOpenEmploymentsByOrgCode(orgCode);
        if (employmentCount > 0) {
          throw new OrganizationHasEmploymentError();
        }
      }
      await tx.organizationRepository.updateOrganizationByCode(orgCode, data);
      await tx.auditService.recordAuditLog(buildOrganizationAudit(action, {
        ...existing,
        orgCode: data.orgCode ?? existing.orgCode,
        orgName: data.orgName ?? existing.orgName,
        status: data.status ?? existing.status,
      }, {
        patch: data,
        previousOrgCode: orgCode,
      }, auditContext));
      await tx.userProfileInvalidation.recordChanges([
        { kind: "organization", organizationId: existing.id },
      ]);
      return true;
    }, adminAuditTransactionOptions(auditContext));
  }

  async function updateOrganizationStatus(
    orgCode: string,
    status: OrganizationStatus,
    auditContext?: AdminAuditContext,
    authorization?: AdminOrganizationAuthorization,
  ) {
    return await updateOrganization(
      orgCode,
      { status },
      auditContext,
      authorization,
      "admin.organization.status_update",
    );
  }

  async function deleteOrganization(
    orgCode: string,
    auditContext?: AdminAuditContext,
    authorization?: AdminOrganizationAuthorization,
  ) {
    return await deps.uow.transaction(async (tx) => {
      const existing = await tx.organizationRepository.getOrganizationByCodeForAdmin(orgCode);
      if (existing === null) {
        throw new OrganizationNotFoundError("组织不存在");
      }
      if (
        authorization?.kind === "scoped"
        && !authorization.organizationIds.includes(existing.id)
      ) {
        authorization.denyMutation({
          operationId: "admin.organization.delete",
          resourceIdentifier: orgCode,
          reason: "RESOURCE_OUT_OF_SCOPE",
          concealExistence: true,
        });
      }
      await tx.responsibilityParentLifecycle
        .assertNoOpenAssignmentsTargetingOrganizationSubtree({
          organizationId: existing.id,
        });
      const childrenCount = await tx.organizationRepository.countActiveChildrenByOrgCode(orgCode);
      if (childrenCount > 0) {
        throw new OrganizationHasChildrenError();
      }
      const employmentCount = await tx.organizationRepository.countOpenEmploymentsByOrgCode(orgCode);
      if (employmentCount > 0) {
        throw new OrganizationHasEmploymentError();
      }
      await tx.organizationRepository.softDeleteOrganizationByCode(orgCode);
      await tx.auditService.recordAuditLog(buildOrganizationAudit("admin.organization.delete", existing, {
        deleted: true,
      }, auditContext));
      await tx.userProfileInvalidation.recordChanges([
        { kind: "organization", organizationId: existing.id },
      ]);
      return true;
    }, adminAuditTransactionOptions(auditContext));
  }

  return {
    deleteOrganization,
    getOrganizationChildrenForAdmin,
    getOrganizationDetailByCodeForAdmin,
    getOrganizationSelectorNodesForAdmin,
    searchOrganizationsForAdmin,
    setOrganization,
    updateOrganization,
    updateOrganizationStatus,
  };
}

export type OrganizationService = ReturnType<typeof createOrganizationService>;
