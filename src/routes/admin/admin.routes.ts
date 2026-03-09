import { createRoute, z } from '@hono/zod-openapi';
import { EmploymentAdminQueryDtoSchema, EmploymentAdminVoSchema } from '@schemas/employment.admin.type';
import { OrganizationDtoSchema, OrganizationQueryDtoSchema } from '@schemas/organization.common.type';
import { createPageResultSchema } from '@schemas/page.type';
import { PositionAdminQueryDtoSchema, PositionAdminVoSchema } from '@schemas/position.admin.type';
import { UserAdminDetailVoSchema, UserAdminQueryDtoSchema, UserAdminVoSchema } from '@schemas/user.admin.type';
import * as HttpStatusCodes from 'src/libs/core/http-status-codes';
import jsonContent from 'src/libs/core/openapi/helpers/json-content';
import jsonContentRequired from 'src/libs/core/openapi/helpers/json-content-required';
import createSuccessResponseSchema from 'src/libs/core/openapi/schemas/create-success-schema';

const tags = ['Admin'];

export const usersSearch = createRoute({
  method: 'post',
  path: '/users/search',
  tags,
  request: {
    body: jsonContentRequired(UserAdminQueryDtoSchema, '管理员用户查询'),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(createPageResultSchema(UserAdminVoSchema)), '搜索结果'),
  },
});

export const organizationsSearch = createRoute({
  method: 'post',
  path: '/organizations/search',
  tags,
  request: {
    body: jsonContentRequired(OrganizationQueryDtoSchema, '管理员组织查询'),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.array(OrganizationDtoSchema)), '搜索结果'),
  },
});

export const employmentsSearch = createRoute({
  method: 'post',
  path: '/employments/search',
  tags,
  request: {
    body: jsonContentRequired(EmploymentAdminQueryDtoSchema, '管理员任职关系查询'),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.array(EmploymentAdminVoSchema)), '搜索结果'),
  },
});

export const positionSearch = createRoute({
  method: 'post',
  path: '/positions/search',
  tags,
  request: {
    body: jsonContentRequired(PositionAdminQueryDtoSchema, '管理员岗位查询'),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(z.array(PositionAdminVoSchema)), '查询结果'),
  },
});

export const usersDetail = createRoute({
  method: 'get',
  path: '/users/detail',
  tags,
  request: {
    query: z.object({
      username: z.string().openapi({ example: '123456' }),
    }),
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(UserAdminDetailVoSchema), '用户详情'),
  },
});
