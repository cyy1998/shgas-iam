import { z } from '@hono/zod-openapi';

export const EmploymentScalarFieldEnumSchema = z.enum(['id', 'userId', 'posId', 'deptId', 'compId', 'isPrimary', 'status', 'startTime', 'endTime', 'description', 'isDelete', 'createTime', 'updateTime'])

export type EmploymentScalarFieldEnum = z.infer<typeof EmploymentScalarFieldEnumSchema>;