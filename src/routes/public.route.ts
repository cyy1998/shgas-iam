import type { UserDetailDto } from '@schemas/user.common.type';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { OrganizationDtoSchema, OrganizationQueryDtoSchema } from '@schemas/organization.common.type';
import { createResponseSchema } from '@schemas/response.type';
import { UserDetailDtoSchema, UserDtoSchema, UserQueryDtoSchema } from '@schemas/user.common.type';
import { organizationService } from '@services/organization.service';
import { sessionService } from '@services/session.service';
import { userService } from '@services/user.common.service';

import { success } from '@utils/response.utils';
import { getCookie } from 'hono/cookie';
import { authenicationHandler } from 'src/middlewares/authenication.handler';

interface AppEnv {
  Variables: {
    userId: number;
    username: string;
    userDetailDto: UserDetailDto;
  };
}

const app = new OpenAPIHono<AppEnv>();

app.use('/*', authenicationHandler);

/*
path: /user-info
method: GET
function: 获取当前已登录用户信息
*/
app.openapi(
  createRoute({
    method: 'get',
    path: '/user-info',
    tags: ['Public'],
    responses: {
      200: {
        content: {
          'application/json': {
            schema: createResponseSchema(UserDetailDtoSchema),
          },
        },
        description: '本用户信息',
      },
    },
  }),
  async (c) => {
    // const sessionId = getCookie(c, 'session') ?? ''
    // const data = await cacheService.getSessionById(sessionId)
    const data = c.get('userDetailDto');
    return c.json(success(data));
  },
);

/*
path: /password/change
method: POST
function: 设置密码
*/
app.openapi(
  createRoute({
    method: 'post',
    path: '/password/change',
    tags: ['Public'],
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              oldPassword: z.string().openapi({ example: '1234' }),
              newPassword: z.string().openapi({ example: '1234' }),
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
        description: '密码设置成功',
      },
    },
  }),
  async (c) => {
    const { oldPassword, newPassword } = c.req.valid('json');
    const data = await userService.setPassword(c.get('username'), oldPassword, newPassword);
    return c.json(success(data));
  },
);

/*
path: /mobile/set
method: POST
function: 设置手机号
*/
app.openapi(
  createRoute({
    method: 'post',
    path: '/mobile/set',
    tags: ['Public'],
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              phoneNumber: z.string().openapi({ example: '17721462865' }),
              code: z.string().openapi({ example: '1234' }),
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
        description: '新手机设置成功',
      },
    },
  }),
  async (c) => {
    const { phoneNumber, code } = c.req.valid('json');
    const sessionId = getCookie(c, 'global_session') as string;
    const newUserDto = await userService.setMobile(c.get('userId'), phoneNumber, code);
    const data = await sessionService.updateSession(sessionId, JSON.stringify(newUserDto));
    return c.json(success(data));
  },
);

// 待废弃
/*
path: /employments/by-privilege
method: GET
function: 查询具有某个权限的任职关系
*/
// app.openapi(
//     createRoute({
//         method: 'get',
//         path: '/employments/by-privilege',
//         tags: ['Public'],
//         request: {
//             query: z.object({
//                 privCode: z.string().openapi({ example: '123' }),
//                 codeType: z.enum(['full', 'prefix', 'suffix']).default('full')
//             })
//         },
//         responses: {
//             200: {
//                 content: {
//                     'application/json': {
//                         schema: createResponseSchema(z.array(EmploymentDtoSchema)),
//                     },
//                 },
//                 description: '符合条件用户列表',
//             }
//         }
//     }),
//     async (c) => {
//         const { privCode, codeType } = c.req.valid('query')
//         const data = await employmentService.getEmploymentsByUserAndPrivilege(c.get('username'), privCode, codeType)
//         return c.json(success(data))
//     }
// )

/*
path: /organizations/search
method: POST
function: 按条件搜索某组织
*/
app.openapi(
  createRoute({
    method: 'post',
    path: '/organizations/search',
    tags: ['Public'],
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

/*
path: /users/search
method: POST
function: 根据条件搜索用户
*/
app.openapi(
  createRoute({
    method: 'post',
    path: '/users/search',
    tags: ['Public'],
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
path: /users/by-org
method: GET
function: 搜索某个组织下的所有用户
*/
app.openapi(
  createRoute({
    method: 'get',
    path: '/users/by-org',
    tags: ['Public'],
    request: {
      query: z.object({
        orgCode: z.string().openapi({ example: '123' }),
      }),
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: createResponseSchema(z.array(UserDtoSchema)),
          },
        },
        description: '本用户信息',
      },
    },
  }),
  async (c) => {
    const { orgCode } = c.req.valid('query');
    const data = await userService.getUsersByOrg(orgCode, 'direct');
    return c.json(success(data));
  },
);

// 待废弃
/*
path: /search-other-users/under-org
method: GET
function: 搜索某个组织下的其他用户
*/
// app.openapi(
//     createRoute({
//         method: 'get',
//         path: '/search-other-users/under-org',
//         tags: ['Public'],
//         request: {
//             query: z.object({
//                 orgCode: z.string().openapi({ example: 'SR23' }),
//             })
//         },
//         responses: {
//             200: {
//                 content: {
//                     'application/json': {
//                         schema: createResponseSchema(z.array(UserDtoSchema)),
//                     },
//                 },
//                 description: '符合条件用户列表',
//             },
//         },
//     }),
//     async (c) => {
//         const { orgCode } = c.req.valid('query')
//         const data = await userService.getOtherUsersByOrg(orgCode, c.get('userId'))
//         return c.json(success(data))
//     }
// )

export default app;
