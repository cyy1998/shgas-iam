import { createRoute, z } from "@hono/zod-openapi";
import * as HttpStatusCodes from "@lib/core/http-status-codes";
import jsonContent from "@lib/core/openapi/helpers/json-content";
import jsonContentRequired from "@lib/core/openapi/helpers/json-content-required";
import createSuccessResponseSchema from "@lib/core/openapi/schemas/create-success-schema";
import { Status } from "@/enums/status";
import { EmploymentDtoSchema } from "@/services/employment/employment.schema";
import { OrganizationDtoSchema, OrganizationQueryDtoSchema } from "@/services/organization/organization.schema";
import { PrivilegeDelegationCreateDtoSchema, PrivilegeDelegationDetailDtoSchema, PrivilegeDelegationDtoSchema, PrivilegeDelegationQueryDtoSchema } from "@/services/privilege/privilegeDelegation.schema";
import { UserDetailDtoSchema, UserDtoSchema, UserQueryDtoSchema, UserQueryWithPrivilegeDelegationDtoSchema } from "@/services/user/user.schema";

const routePrefix = "";
const tags = ["Internal"];

export const userInfo = createRoute({
  method: "get",
  path: `${routePrefix}/user-info`,
  tags,
  request: {
    query: z.object({
      username: z.string().openapi({ example: "123456" }),
    }),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(UserDetailDtoSchema), "用户详细信息"),
  },
});

export const usersQueryByOrgPosition = createRoute({
  method: "get",
  path: `${routePrefix}/search-users/org-position`,
  tags,
  request: {
    query: z.object({
      posCode: z.string().openapi({ example: "E001" }),
      orgCode: z.string().openapi({ example: "SR23" }),
      orgScope: z.enum(["direct", "recursive"]).default("direct").openapi({ example: "direct or recursive" }),
      resourceCode: z.string().optional().openapi({ example: "tender:flow:SR_CZLX" }),
    }),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.array(UserDtoSchema)), "用户搜索结果"),
  },
});

export const usersSearch = createRoute({
  method: "post",
  path: `${routePrefix}/users/search`,
  tags,
  request: {
    body: jsonContentRequired(UserQueryDtoSchema, "用户搜索条件"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.array(UserDtoSchema)), "用户搜索结果"),
  },
});

export const usersSearchWithPrivilegeDelegation = createRoute({
  method: "post",
  path: `${routePrefix}/users/searchWithPrivilegeDelegation`,
  tags,
  request: {
    body: jsonContent(UserQueryWithPrivilegeDelegationDtoSchema, "用户搜索条件"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(
      z.object(
        {
          users: z.array(UserDtoSchema),
          delegations: z.array(PrivilegeDelegationDtoSchema),
        },
      ),
    ), "用户搜索结果"),
  },
});

export const usersQueryByOrgRole = createRoute({
  method: "get",
  path: `${routePrefix}/search-users/org-roles`,
  tags,
  request: {
    query: z.object({
      roleCode: z.string().openapi({ example: "tender:dept-approval" }),
      orgCode: z.string().openapi({ example: "SR23" }),
      orgScope: z.enum(["direct", "recursive"]).default("direct").openapi({ example: "direct or recursive" }),
      resourceCode: z.string().optional().openapi({ example: "tender:flow:SR_CZLX" }),
    }),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.array(UserDtoSchema)), "用户搜索结果"),
  },
});

export const usersQueryByOrg = createRoute({
  method: "get",
  path: `${routePrefix}/search-users/under-org`,
  tags,
  request: {
    query: z.object({
      orgCode: z.string().openapi({ example: "SR23" }),
      orgScope: z.enum(["direct", "recursive"]).default("direct").openapi({ example: "direct or recursive" }),
    }),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.array(UserDtoSchema)), "用户搜索结果"),
  },
});

export const employmentsQueryByUserPriv = createRoute({
  method: "get",
  path: `${routePrefix}/search-employments/user-privilege`,
  tags,
  request: {
    query: z.object({
      username: z.string().openapi({ example: "138550" }),
      privCode: z.string().openapi({ example: "123" }),
    }),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.array(EmploymentDtoSchema)), "任职关系搜索结果"),
  },
});

export const purveyorRegister = createRoute({
  method: "post",
  path: `${routePrefix}/purveyor/register`,
  tags,
  request: {
    body: jsonContentRequired(z.object({
      orgCode: z.string().openapi({ example: "统一社会信用代码" }),
      orgName: z.string().openapi({ example: "供应商A" }),
      parentOrg: z.enum(["GY", "GT"]).default("GY"),
    }), "组织创建参数"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.boolean()), "供应商注册结果"),
  },
});

export const contactRegister = createRoute({
  method: "post",
  path: `${routePrefix}/purveyor/contact/register`,
  tags,
  request: {
    body: jsonContentRequired(z.object({
      username: z.string().openapi({ example: "身份证号" }),
      orgCode: z.string().openapi({ example: "供应商统一社会信用代码" }),
      mobile: z.string().openapi({ example: "12345678" }),
      name: z.string().openapi({ example: "1234" }),
    }), "用户创建参数"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.boolean()), "联系人注册结果"),
  },
});

export const organizationsSearch = createRoute({
  method: "post",
  path: `${routePrefix}/organizations/search`,
  tags,
  request: {
    body: jsonContentRequired(OrganizationQueryDtoSchema, "组织搜索参数"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.array(OrganizationDtoSchema)), "组织搜索结果"),
  },
});

export const organizationGetByCode = createRoute({
  method: "get",
  path: `${routePrefix}/organizations/getByCode`,
  tags,
  request: {
    query: z.object({
      orgCode: z.string(),
    }),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(OrganizationDtoSchema), "组织查询结果"),
  },
});

export const privilegeDelegationsQuery = createRoute({
  method: "post",
  path: `${routePrefix}/delegations/search`,
  tags,
  request: {
    body: jsonContentRequired(PrivilegeDelegationQueryDtoSchema, "权限代理搜索参数"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.array(PrivilegeDelegationDetailDtoSchema)), "权限Delegation列表"),
  },
});

export const privilegeDelegationUpdateStatus = createRoute({
  method: "post",
  path: `${routePrefix}/delegations/update-status`,
  tags,
  request: {
    body: jsonContentRequired(z.object({
      id: z.coerce.number().int().describe("权限Delegation ID").openapi({ example: 1 }),
      status: z.enum(Status).describe("权限Delegation状态(正常1、暂停2、结束3)").openapi({ example: Status.Disable }),
    }), "权限Delegation状态更新参数"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.boolean()), "权限Delegation状态更新结果"),
  },
});

export const privilegeDelegationSet = createRoute({
  method: "post",
  path: `${routePrefix}/delegations/set`,
  tags,
  request: {
    body: jsonContentRequired(PrivilegeDelegationCreateDtoSchema, "权限Delegation设置参数"),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(PrivilegeDelegationDetailDtoSchema), "权限Delegation设置结果"),
  },
});
