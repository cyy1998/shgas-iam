import { UserType } from "@enums/user.type";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { authenicationHandler } from "@middlewares/authenication.handler";
import { EmploymentAdminQueryDtoSchema, EmploymentAdminVoSchema } from "@schemas/employment.admin.type";
import { createPageResultSchema } from "@schemas/page.type";
import { PositionAdminQueryDtoSchema, PositionAdminVoSchema } from "@schemas/position.admin.type";
import { createResponseSchema, ResponseSchema } from "@schemas/response.type";
import { UserAdminDetailVoSchema, UserAdminQueryDtoSchema, UserAdminVoSchema } from "@schemas/user.admin.type";
import { UserCreateDtoSchema } from "@schemas/user.common.type";
import { employmentAdminService } from "@services/employment.admin.service";
import { employmentService } from "@services/employment.common.service";
import { positionAdminService } from "@services/position.admin.service";
import { privilegeService } from "@services/privilege.service";
import { userAdminService } from "@services/user.admin.service";
import { generateRandomPassword } from "@utils/encryption.utils";
import { prisma } from "@/db";
import { ClientDtoSchema, ClientInputDtoSchema } from "@/services/client/client.schema";
import * as clientService from "@/services/client/client.service";
import { OrganizationCreateDtoSchema, OrganizationDtoSchema, OrganizationQueryDtoSchema } from "@/services/organization/organization.schema";
import * as organizationService from "@/services/organization/organization.service";
import { roleService } from "@/services/role/role.service";
import * as resp from "@/utils/http/response";

const app = new OpenAPIHono();

app.use("/*", authenicationHandler);

/*
path: /users/search
function: 应用更新
*/
app.openapi(
  createRoute({
    method: "post",
    path: "/users/search",
    tags: ["Admin"],
    request: {
      body: {
        content: {
          "application/json": {
            schema: UserAdminQueryDtoSchema,
          },
        },
      },
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: createResponseSchema(createPageResultSchema(UserAdminVoSchema)),
          },
        },
        description: "符合条件用户列表",
      },
    },
  }),
  async (c) => {
    const body = c.req.valid("json");
    const data = await userAdminService.searchUsersFuzzy(body);
    return c.json(resp.ok(data));
  },
);

/*
path: /organizations/search
method: POST
function: 按条件搜索某组织
*/
app.openapi(
  createRoute({
    method: "post",
    path: "/organizations/search",
    tags: ["Admin"],
    request: {
      body: {
        content: {
          "application/json": {
            schema: OrganizationQueryDtoSchema,
          },
        },
      },
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: createResponseSchema(z.array(OrganizationDtoSchema)),
          },
        },
        description: "所有符合条件组织列表",
      },
    },
  }),
  async (c) => {
    const organizationQueryDto = c.req.valid("json");
    const data = await organizationService.searchOrganizations(organizationQueryDto);
    return c.json(resp.ok(data));
  },
);

/*
path: /employments/search
method: POST
function: 按条件搜索任职关系
*/
app.openapi(
  createRoute({
    method: "post",
    path: "/employments/search",
    tags: ["Admin"],
    request: {
      body: {
        content: {
          "application/json": {
            schema: EmploymentAdminQueryDtoSchema,
          },
        },
      },
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: createResponseSchema(z.array(EmploymentAdminVoSchema)),
          },
        },
        description: "所有符合条件组织列表",
      },
    },
  }),
  async (c) => {
    const employmentQueryDto = c.req.valid("json");
    const data = await employmentAdminService.searchEmployments(employmentQueryDto);
    return c.json(resp.ok(data));
  },
);

/*
path: /positions/search
method: POST
function: 按条件搜索岗位
*/
app.openapi(
  createRoute({
    method: "post",
    path: "/positions/search",
    tags: ["Admin"],
    request: {
      body: {
        content: {
          "application/json": {
            schema: PositionAdminQueryDtoSchema,
          },
        },
      },
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: createResponseSchema(z.array(PositionAdminVoSchema)),
          },
        },
        description: "所有符合条件组织列表",
      },
    },
  }),
  async (c) => {
    const positionQueryDto = c.req.valid("json");
    const data = await positionAdminService.searchPositionsFuzzy(positionQueryDto);
    return c.json(resp.ok(data));
  },
);

/*
path: /users/detail
function: 应用更新
*/
app.openapi(
  createRoute({
    method: "get",
    path: "/users/detail",
    tags: ["Admin"],
    request: {
      query: z.object({
        username: z.string().openapi({ example: "123456" }),
      }),
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: createResponseSchema(UserAdminDetailVoSchema),
          },
        },
        description: "用户详情",
      },
    },
  }),
  async (c) => {
    const { username } = c.req.valid("query");
    const data = await userAdminService.getUserDetail(username);
    return c.json(resp.ok(data));
  },
);

/*
path: /users/password/reset
method: POST
function: 应用更新
*/
app.openapi(
  createRoute({
    method: "post",
    path: "/users/password/reset",
    tags: ["Admin"],
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              username: z.string().openapi({ example: "138550" }),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: createResponseSchema(z.string()),
          },
        },
        description: "用户新密码",
      },
    },
  }),
  async (c) => {
    const { username } = c.req.valid("json");
    const data = await userAdminService.resetPassword(username);
    return c.json(resp.ok(data));
  },
);

/*
path: /users/set
method: POST
function: 创建用户
*/
app.openapi(
  createRoute({
    method: "post",
    path: "/users/set",
    tags: ["Admin"],
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              data: z.array(UserCreateDtoSchema),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: createResponseSchema(z.string()),
          },
        },
        description: "用户新密码",
      },
    },
  }),
  async (c) => {
    const users = c.req.valid("json").data;
    const data = await userAdminService.setUsers(users);
    return c.json(resp.ok(data));
  },
);

/*
path: /users/password/generate
method: POST
function: 应用更新
*/
app.openapi(
  createRoute({
    method: "post",
    path: "/users/password/generate",
    tags: ["Admin"],
    responses: {
      200: {
        content: {
          "application/json": {
            schema: createResponseSchema(z.string()),
          },
        },
        description: "用户新密码",
      },
    },
  }),
  async (c) => {
    const data = generateRandomPassword(8);
    return c.json(resp.ok(data));
  },
);

/*
path: /client/update
function: 应用更新
*/
app.openapi(
  createRoute({
    method: "post",
    path: "/client/update",
    tags: ["Admin"],
    request: {
      body: {
        content: {
          "application/json": {
            schema: ClientInputDtoSchema,
          },
        },
      },
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: createResponseSchema(ClientDtoSchema),
          },
        },
        description: "设置岗位成功",
      },
    },
  }),
  async (c) => {
    const body = c.req.valid("json");
    const data = await clientService.updateClient(body);
    return c.json(resp.ok(data));
  },
);
/*
path: /position/set
function: 设置新岗位
*/
app.openapi(
  createRoute({
    method: "post",
    path: "/position/set",
    tags: ["Admin"],
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              posCode: z.string().openapi({ example: "SR01-01" }),
              posName: z.string().openapi({ example: "党委书记" }),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: ResponseSchema,
          },
        },
        description: "设置岗位成功",
      },
    },
  }),
  async (c) => {
    const body = c.req.valid("json");
    await prisma.position.create({
      data: body,
    });
    return c.json(resp.ok());
  },
);
/*
path: /organizations/set
function: 设置新组织
*/
app.openapi(
  createRoute({
    method: "post",
    path: "/organizations/set",
    tags: ["Admin"],
    request: {
      body: {
        content: {
          "application/json": {
            schema: OrganizationCreateDtoSchema,
          },
        },
      },
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: ResponseSchema,
          },
        },
        description: "设置组织成功",
      },
    },
  }),
  async (c) => {
    const organizationCreateDto = c.req.valid("json");
    const data = await organizationService.setOrganization(organizationCreateDto);
    return c.json(resp.ok(data));
  },
);
/*
path: /employment/set
function: 设置新权限
*/
app.openapi(
  createRoute({
    method: "post",
    path: "/employment/set",
    tags: ["Admin"],
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              username: z.string().openapi({ example: "E01" }),
              posCode: z.string().openapi({ example: "SR01" }),
              orgCode: z.string().openapi({ example: "SR01" }),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: ResponseSchema,
          },
        },
        description: "设置任职关系成功",
      },
    },
  }),
  async (c) => {
    const { username, posCode, orgCode } = c.req.valid("json");
    const data = await employmentService.setEmployment(username, posCode, orgCode);
    return c.json(resp.ok(data));
  },
);
/*
path: /privilege/set
function: 设置新权限
*/
app.openapi(
  createRoute({
    method: "post",
    path: "/privilege/set",
    tags: ["Admin"],
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              privCode: z.string().openapi({ example: "E01" }),
              privName: z.string().openapi({ example: "SR01" }),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: ResponseSchema,
          },
        },
        description: "设置任职关系成功",
      },
    },
  }),
  async (c) => {
    const { privCode, privName } = c.req.valid("json");
    const data = await privilegeService.setPrivilege(privCode, privName);
    return c.json(resp.ok(data));
  },
);

/*
path: /role/set
function: 设置新角色
*/
app.openapi(
  createRoute({
    method: "post",
    path: "/role/set",
    tags: ["Admin"],
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              roleCode: z.string().openapi({ example: "E01" }),
              roleName: z.string().openapi({ example: "SR01" }),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: ResponseSchema,
          },
        },
        description: "设置任职关系成功",
      },
    },
  }),
  async (c) => {
    const { roleCode, roleName } = c.req.valid("json");
    const data = await roleService.setRole(roleCode, roleName);
    return c.json(resp.ok(data));
  },
);

/*
path: /role/privilege/set
function: 设置角色权限关系
*/
app.openapi(
  createRoute({
    method: "post",
    path: "/role/privilege/set",
    tags: ["Admin"],
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              roleCode: z.string().openapi({ example: "E01" }),
              privCode: z.string().openapi({ example: "E01" }),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: ResponseSchema,
          },
        },
        description: "设置任职关系成功",
      },
    },
  }),
  async (c) => {
    const { roleCode, privCode } = c.req.valid("json");
    const data = await roleService.setRolePrivilege(roleCode, privCode);
    return c.json(resp.ok(data));
  },
);

/*
path: /role/employment/set
function: 为任职关系设置角色
*/
app.openapi(
  createRoute({
    method: "post",
    path: "/role/employment/set",
    tags: ["Admin"],
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              posCode: z.string().openapi({ example: "E01" }),
              orgCode: z.string().openapi({ example: "SR01" }),
              username: z.string().openapi({ example: "138550" }),
              roleCode: z.string().openapi({ example: "138550" }),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: ResponseSchema,
          },
        },
        description: "角色设置成功",
      },
    },
  }),
  async (c) => {
    const { username, orgCode, posCode, roleCode } = c.req.valid("json");
    const data = await roleService.setRoleForEmployment(username, posCode, orgCode, roleCode);
    return c.json(resp.ok(data));
  },
);

/*
path: /role/organization/set
function: 为组织设置角色
*/
app.openapi(
  createRoute({
    method: "post",
    path: "/role/organization/set",
    tags: ["Admin"],
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              roleCode: z.string().openapi({ example: "E01" }),
              orgCode: z.string().openapi({ example: "SR01" }),
              isAllSub: z.boolean(),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: ResponseSchema,
          },
        },
        description: "角色设置成功",
      },
    },
  }),
  async (c) => {
    const { orgCode, roleCode } = c.req.valid("json");
    const data = await roleService.setRoleForOrganization(orgCode, roleCode);
    return c.json(resp.ok(data));
  },
);

/*
path: /role/position/set
function: 为组织设置角色
*/
app.openapi(
  createRoute({
    method: "post",
    path: "/role/position/set",
    tags: ["Admin"],
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              roleCode: z.string().openapi({ example: "E01" }),
              posCode: z.string().openapi({ example: "E001" }),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: ResponseSchema,
          },
        },
        description: "角色设置成功",
      },
    },
  }),
  async (c) => {
    const { posCode, roleCode } = c.req.valid("json");
    const data = await roleService.setRoleForPosition(posCode, roleCode);
    return c.json(resp.ok(data));
  },
);

/*
path: /role/pos-org/set
function: 为岗位-部门组合设置角色
*/
app.openapi(
  createRoute({
    method: "post",
    path: "/role/pos-org/set",
    tags: ["Admin"],
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              posCode: z.string().openapi({ example: "E01" }),
              orgCode: z.string().openapi({ example: "SR01" }),
              roleCode: z.string().openapi({ example: "dept-head" }),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: ResponseSchema,
          },
        },
        description: "设置角色成功",
      },
    },
  }),
  async (c) => {
    const { roleCode, orgCode, posCode } = c.req.valid("json");
    const data = await roleService.setRoleForPosOrg(orgCode, posCode, roleCode);
    return c.json(resp.ok(data));
  },
);

/*
path: /role/pos-org/delete
function: 为岗位-部门组合删除角色
*/
app.openapi(
  createRoute({
    method: "post",
    path: "/role/pos-org/delete",
    tags: ["Admin"],
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              posCode: z.string().openapi({ example: "E01" }),
              orgCode: z.string().openapi({ example: "SR01" }),
              roleCode: z.string().openapi({ example: "dept-head" }),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: ResponseSchema,
          },
        },
        description: "删除角色成功",
      },
    },
  }),
  async (c) => {
    const { roleCode, orgCode, posCode } = c.req.valid("json");
    const data = await roleService.deleteRoleForPosOrg(orgCode, posCode, roleCode);
    return c.json(resp.ok(data));
  },
);

/*
path: /role/employment/delete
function: 为任职关系设置角色
*/
app.openapi(
  createRoute({
    method: "post",
    path: "/role/employment/delete",
    tags: ["Admin"],
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              posCode: z.string().openapi({ example: "E01" }),
              orgCode: z.string().openapi({ example: "SR01" }),
              username: z.string().openapi({ example: "138550" }),
              roleCode: z.string().openapi({ example: "138550" }),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: ResponseSchema,
          },
        },
        description: "角色设置成功",
      },
    },
  }),
  async (c) => {
    const { username, orgCode, posCode, roleCode } = c.req.valid("json");
    const data = await roleService.deleteRoleForEmployment(username, posCode, orgCode, roleCode);
    return c.json(resp.ok(data));
  },
);

/*
path: /meta/userType
method: POST
function: 应用更新
*/
app.openapi(
  createRoute({
    method: "get",
    path: "/meta/userType",
    tags: ["Admin"],
    responses: {
      200: {
        content: {
          "application/json": {
            schema: createResponseSchema(z.array(z.string())),
          },
        },
        description: "用户新密码",
      },
    },
  }),
  async (c) => {
    const data = Object.values(UserType);
    return c.json(resp.ok(data));
  },
);

export default app;
