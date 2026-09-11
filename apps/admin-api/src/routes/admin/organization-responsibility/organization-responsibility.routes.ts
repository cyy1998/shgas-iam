import type { OrganizationResponsibilityAssignmentLifecycleCommand as OrganizationResponsibilityAssignmentLifecycleCommandType } from "@iam/contracts";
import {
  OrganizationResponsibilityAssignmentCreateDtoSchema,
  OrganizationResponsibilityAssignmentCursorPageSchema,
  OrganizationResponsibilityAssignmentListQuerySchema,
  OrganizationResponsibilityAssignmentSearchPageSchema,
  OrganizationResponsibilityAssignmentSearchQuerySchema,
  OrganizationResponsibilityAssignmentViewSchema,
} from "@admin-api/services/organization-responsibility/organization-responsibility.schema";
import { createRoute, z } from "@hono/zod-openapi";
import * as HttpStatusCodes from "@iam/api-core/core/http-status-codes";
import { commonErrorResponses } from "@iam/api-core/core/openapi/helpers/common-error-responses";
import jsonContent from "@iam/api-core/core/openapi/helpers/json-content";
import jsonContentRequired from "@iam/api-core/core/openapi/helpers/json-content-required";
import createSuccessResponseSchema from "@iam/api-core/core/openapi/schemas/create-success-schema";
import {
  createAdminMutationResultSchema,
  ORGANIZATION_RESPONSIBILITY_ASSIGNMENT_LIFECYCLE_COMMANDS,

} from "@iam/contracts";
import { OrganizationResponsibilityTypeViewSchema } from "@iam/domain/organization-responsibility";

const tags = ["Admin/Organization Responsibility"];
const organizationParam = z.object({ orgCode: z.string() });
const assignmentParam = organizationParam.extend({
  id: z.coerce.number().int().positive(),
});
const globalAssignmentParam = z.object({
  id: z.coerce.number().int().positive(),
});

export const organizationResponsibilityTypesList = createRoute({
  method: "get",
  path: "/organization-responsibilities/types",
  tags,
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(
      createSuccessResponseSchema(
        z.array(OrganizationResponsibilityTypeViewSchema),
      ),
      "组织责任类型目录",
    ),
  },
});

export const organizationResponsibilityAssignmentsList = createRoute({
  method: "get",
  path: "/organizations/:orgCode/responsibility-assignments",
  tags,
  request: {
    params: organizationParam,
    query: OrganizationResponsibilityAssignmentListQuerySchema,
  },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(
      createSuccessResponseSchema(
        OrganizationResponsibilityAssignmentCursorPageSchema,
      ),
      "组织的 Open 责任任命游标列表",
    ),
  },
});

export const organizationResponsibilityAssignmentsSearch = createRoute({
  method: "get",
  path: "/organization-responsibilities/assignments",
  tags,
  request: {
    query: OrganizationResponsibilityAssignmentSearchQuerySchema,
  },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(
      createSuccessResponseSchema(
        OrganizationResponsibilityAssignmentSearchPageSchema,
      ),
      "全局组织责任任命搜索（支持页码或游标分页）",
    ),
  },
});

export const organizationResponsibilityAssignmentDetail = createRoute({
  method: "get",
  path: "/organizations/:orgCode/responsibility-assignments/:id",
  tags,
  request: { params: assignmentParam },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(
      createSuccessResponseSchema(
        OrganizationResponsibilityAssignmentViewSchema,
      ),
      "组织责任任命详情",
    ),
  },
});

export const organizationResponsibilityGlobalAssignmentDetail = createRoute({
  method: "get",
  path: "/organization-responsibilities/assignments/:id",
  tags,
  request: { params: globalAssignmentParam },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(
      createSuccessResponseSchema(
        OrganizationResponsibilityAssignmentViewSchema,
      ),
      "全局组织责任任命详情",
    ),
  },
});

export const organizationResponsibilityAssignmentCreate = createRoute({
  method: "post",
  path: "/organizations/:orgCode/responsibility-assignments",
  tags,
  request: {
    params: organizationParam,
    body: jsonContentRequired(
      OrganizationResponsibilityAssignmentCreateDtoSchema,
      "组织责任任命创建参数",
    ),
  },
  responses: {
    ...commonErrorResponses,
    [HttpStatusCodes.OK]: jsonContent(
      createSuccessResponseSchema(
        createAdminMutationResultSchema(z.object({ id: z.number().int().positive() })),
      ),
      "组织责任任命创建成功",
    ),
  },
});

function createOrganizationResponsibilityLifecycleRoute(
  command: OrganizationResponsibilityAssignmentLifecycleCommandType,
  description: string,
) {
  return createRoute({
    method: "post",
    path: `/organization-responsibilities/assignments/:id/${command}`,
    tags,
    request: { params: globalAssignmentParam },
    responses: {
      ...commonErrorResponses,
      [HttpStatusCodes.OK]: jsonContent(
        createSuccessResponseSchema(createAdminMutationResultSchema(z.null())),
        description,
      ),
    },
  });
}

export const organizationResponsibilityAssignmentPause
  = createOrganizationResponsibilityLifecycleRoute(
    ORGANIZATION_RESPONSIBILITY_ASSIGNMENT_LIFECYCLE_COMMANDS.Pause,
    "组织责任任命暂停成功",
  );

export const organizationResponsibilityAssignmentResume
  = createOrganizationResponsibilityLifecycleRoute(
    ORGANIZATION_RESPONSIBILITY_ASSIGNMENT_LIFECYCLE_COMMANDS.Resume,
    "组织责任任命恢复成功",
  );

export const organizationResponsibilityAssignmentEnd
  = createOrganizationResponsibilityLifecycleRoute(
    ORGANIZATION_RESPONSIBILITY_ASSIGNMENT_LIFECYCLE_COMMANDS.End,
    "组织责任任命结束成功",
  );
