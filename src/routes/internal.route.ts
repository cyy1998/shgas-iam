import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { EmploymentDtoSchema } from '@schemas/employment.common.type';
import { OrganizationDtoSchema, OrganizationQueryDtoSchema } from '@schemas/organization.common.type';
import { PrivilegeDelegationDtoSchema } from '@schemas/privilegeDelegation.type';
import { createResponseSchema } from '@schemas/response.type';
import { UserDetailDtoSchema, UserDtoSchema, UserQueryDtoSchema, UserQueryWithPrivilegeDelegationDtoSchema } from '@schemas/user.common.type';
import { employmentService } from '@services/employment.common.service';
import { organizationService } from '@services/organization.service';
import { userService } from '@services/user.common.service';
import { success } from '@utils/response.utils';

const app = new OpenAPIHono();

/*
path: /user-info
method: GET
function: 获取用户详情
*/
app.openapi(
  createRoute({
    method: 'get',
    path: '/user-info',
    tags: ['Internal'],
    request: {
      query: z.object({
        username: z.string().openapi({ example: '123456' }),
      }),
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: createResponseSchema(UserDetailDtoSchema),
          },
        },
        description: '指定用户信息',
      },
    },
  }),
  async (c) => {
    const { username } = c.req.valid('query');
    const data = await userService.getUserDetailByUsername(username);
    return c.json(success(data));
  },
);

/*
path: /search-users/org-position
method: GET
function: 根据组织岗位搜索用户
*/
app.openapi(
  createRoute({
    method: 'get',
    path: '/search-users/org-position',
    tags: ['Internal'],
    request: {
      query: z.object({
        posCode: z.string().openapi({ example: 'E001' }),
        orgCode: z.string().openapi({ example: 'SR23' }),
        orgScope: z.enum(['direct', 'recursive']).default('direct').openapi({ example: 'direct or recursive' }),
        resourceCode: z.string().optional().openapi({ example: 'tender:flow:SR_CZLX' }),
      }),
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: createResponseSchema(z.array(UserDtoSchema)),
          },
        },
        description: '符合条件用户列表',
      },
    },
  }),
  async (c) => {
    const { posCode, orgCode, orgScope } = c.req.valid('query');
    const data = await userService.getUsersByOrgPos(orgCode, posCode, orgScope);
    return c.json(success(data));
  },
);

/*
path: /users/search
method: POST
function: 根据条件搜索用户
*/
app.openapi(
  createRoute({
    method: 'post',
    path: '/users/search',
    tags: ['Internal'],
    request: {
      body: {
        content: {
          'application/json': {
            schema: UserQueryDtoSchema,
          },
        },
      },
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: createResponseSchema(z.array(UserDtoSchema)),
          },
        },
        description: '用户列表',
      },
    },
  }),
  async (c) => {
    const userQueryDto = c.req.valid('json');
    const data = await userService.searchUsers(userQueryDto);
    return c.json(success(data));
  },
);

/*
path: /users/searchWithPrivilegeDelegation
method: POST
function: 根据条件搜索用户
*/
app.openapi(
  createRoute({
    method: 'post',
    path: '/users/searchWithPrivilegeDelegation',
    tags: ['Internal'],
    request: {
      body: {
        content: {
          'application/json': {
            schema: UserQueryWithPrivilegeDelegationDtoSchema,
          },
        },
      },
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: createResponseSchema(
              z.object(
                {
                  users: z.array(UserDtoSchema),
                  delegations: z.array(PrivilegeDelegationDtoSchema),
                },
              ),
            ),
          },
        },
        description: '用户列表',
      },
    },
  }),
  async (c) => {
    const userQueryDto = c.req.valid('json');
    const data = await userService.searchUsersWithPrivilegeDelegation(userQueryDto);
    return c.json(success(data));
  },
);

/*
path: /search-users/org-roles
method: GET
function: 根据组织角色搜索用户
*/
app.openapi(
  createRoute({
    method: 'get',
    path: '/search-users/org-roles',
    tags: ['Internal'],
    request: {
      query: z.object({
        roleCode: z.string().openapi({ example: 'tender:dept-approval' }),
        orgCode: z.string().openapi({ example: 'SR23' }),
        orgScope: z.enum(['direct', 'recursive']).default('direct').openapi({ example: 'direct or recursive' }),
        resourceCode: z.string().optional().openapi({ example: 'tender:flow:SR_CZLX' }),
      }),
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: createResponseSchema(z.array(UserDtoSchema)),
          },
        },
        description: '符合条件用户列表',
      },
    },
  }),
  async (c) => {
    const { roleCode, orgCode, orgScope } = c.req.valid('query');
    const data = await userService.getUsersByOrgRole(orgCode, roleCode, orgScope);
    return c.json(success(data));
  },
);

/*
path: /search-users/under-org
method: GET
function: 根据组织搜索用户
*/
app.openapi(
  createRoute({
    method: 'get',
    path: '/search-users/under-org',
    tags: ['Internal'],
    request: {
      query: z.object({
        orgCode: z.string().openapi({ example: 'SR23' }),
        orgScope: z.enum(['direct', 'recursive']).default('direct').openapi({ example: 'direct or recursive' }),
      }).openapi('Username'),
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: createResponseSchema(z.array(UserDtoSchema)),
          },
        },
        description: '符合条件用户列表',
      },
    },
  }),
  async (c) => {
    const { orgCode, orgScope } = c.req.valid('query');
    const data = await userService.getUsersByOrg(orgCode, orgScope);
    return c.json(success(data));
  },
);

/*
path: /search-employments/user-privilege
method: GET
function: 根据用户域权限搜索任职关系
*/
app.openapi(
  createRoute({
    method: 'get',
    path: '/search-employments/user-privilege',
    tags: ['Internal'],
    request: {
      query: z.object({
        username: z.string().openapi({ example: '138550' }),
        privCode: z.string().openapi({ example: '123' }),
      }),
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: createResponseSchema(z.array(EmploymentDtoSchema)),
          },
        },
        description: '符合条件用户列表',
      },
    },
  }),
  async (c) => {
    const { username, privCode } = c.req.valid('query');
    const data = await employmentService.getEmploymentsByUserAndPrivilege(username, privCode, 'full');
    return c.json(success(data));
  },
);

/*
path: /purveyor/register
method: POST
function: 供应商注册
*/
app.openapi(
  createRoute({
    method: 'post',
    path: '/purveyor/register',
    tags: ['Internal'],
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              orgCode: z.string().openapi({ example: '统一社会信用代码' }),
              orgName: z.string().openapi({ example: '供应商A' }),
              parentOrg: z.enum(['GY', 'GT']).default('GY'),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: createResponseSchema(z.boolean()),
          },
        },
        description: '供应商注册成功',
      },
    },
  }),
  async (c) => {
    const { orgCode, orgName, parentOrg } = c.req.valid('json');
    const data = await organizationService.purveyorRegister(orgCode, orgName, parentOrg);
    return c.json(success(data));
  },
);

/*
path: /purveyor/contact/register
method: POST
function: 供应商联系人注册
*/
app.openapi(
  createRoute({
    method: 'post',
    path: '/purveyor/contact/register',
    tags: ['Internal'],
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              username: z.string().openapi({ example: '身份证号' }),
              orgCode: z.string().openapi({ example: '供应商统一社会信用代码' }),
              mobile: z.string().openapi({ example: '12345678' }),
              name: z.string().openapi({ example: '1234' }),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: createResponseSchema(z.boolean()),
          },
        },
        description: '供应商注册成功',
      },
    },
  }),
  async (c) => {
    const { username, mobile, name, orgCode } = c.req.valid('json');
    const data = await userService.registerPurveyorConcat(username, mobile, name, orgCode);
    return c.json(success(data));
  },
);

/*
path: /organizations/search
method: POST
function: 按条件搜索某组织
*/
app.openapi(
  createRoute({
    method: 'post',
    path: '/organizations/search',
    tags: ['Internal'],
    request: {
      body: {
        content: {
          'application/json': {
            schema: OrganizationQueryDtoSchema,
          },
        },
      },
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: createResponseSchema(z.array(OrganizationDtoSchema)),
          },
        },
        description: '所有符合条件组织列表',
      },
    },
  }),
  async (c) => {
    const organizationQueryDto = c.req.valid('json');
    const data = await organizationService.searchOrganizations(organizationQueryDto);
    return c.json(success(data));
  },
);

// 待废弃
/*
path: /organizations/getByCode
method: GET
function: 根据代码获取组织
*/
app.openapi(
  createRoute({
    method: 'get',
    path: '/organizations/getByCode',
    tags: ['Internal'],
    request: {
      query: z.object({
        orgCode: z.string(),
      }),
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema:
                            createResponseSchema(OrganizationDtoSchema),
          },
        },
        description: '本公司下属组织列表',
      },
    },
  }),
  async (c) => {
    const { orgCode } = c.req.valid('query');
    const data = await organizationService.getOrganizationByCode(orgCode);
    return c.json(success(data));
  },
);

export default app;
