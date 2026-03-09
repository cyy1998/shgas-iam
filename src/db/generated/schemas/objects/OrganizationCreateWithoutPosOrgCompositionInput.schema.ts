import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { EmploymentCreateNestedManyWithoutDeptartmentInputObjectSchema as EmploymentCreateNestedManyWithoutDeptartmentInputObjectSchema } from './EmploymentCreateNestedManyWithoutDeptartmentInput.schema';
import { EmploymentCreateNestedManyWithoutCompanyInputObjectSchema as EmploymentCreateNestedManyWithoutCompanyInputObjectSchema } from './EmploymentCreateNestedManyWithoutCompanyInput.schema';
import { OrganizationRoleCreateNestedManyWithoutOrganizationInputObjectSchema as OrganizationRoleCreateNestedManyWithoutOrganizationInputObjectSchema } from './OrganizationRoleCreateNestedManyWithoutOrganizationInput.schema';
import { OrganizationCreateNestedOneWithoutChildrenInputObjectSchema as OrganizationCreateNestedOneWithoutChildrenInputObjectSchema } from './OrganizationCreateNestedOneWithoutChildrenInput.schema';
import { OrganizationCreateNestedManyWithoutParentInputObjectSchema as OrganizationCreateNestedManyWithoutParentInputObjectSchema } from './OrganizationCreateNestedManyWithoutParentInput.schema';
import { OrganizationClosureCreateNestedManyWithoutAncestorInputObjectSchema as OrganizationClosureCreateNestedManyWithoutAncestorInputObjectSchema } from './OrganizationClosureCreateNestedManyWithoutAncestorInput.schema';
import { OrganizationClosureCreateNestedManyWithoutDescendantInputObjectSchema as OrganizationClosureCreateNestedManyWithoutDescendantInputObjectSchema } from './OrganizationClosureCreateNestedManyWithoutDescendantInput.schema';
import { PrivilegeDelegationCreateNestedManyWithoutOrganizationScopeInputObjectSchema as PrivilegeDelegationCreateNestedManyWithoutOrganizationScopeInputObjectSchema } from './PrivilegeDelegationCreateNestedManyWithoutOrganizationScopeInput.schema'

const makeSchema = () => z.object({
  orgCode: z.string(),
  orgName: z.string(),
  businessParentId: z.number().int().optional(),
  path: z.string(),
  level: z.number().int(),
  orgType: z.string(),
  orderNum: z.number().int().optional(),
  isVirtual: z.boolean().optional(),
  isEntity: z.boolean().optional(),
  status: z.number().int().optional(),
  isDelete: z.boolean().optional(),
  createTime: z.coerce.date().optional(),
  updateTime: z.coerce.date().optional(),
  deptEmployments: z.lazy(() => EmploymentCreateNestedManyWithoutDeptartmentInputObjectSchema).optional(),
  compEmployments: z.lazy(() => EmploymentCreateNestedManyWithoutCompanyInputObjectSchema).optional(),
  roles: z.lazy(() => OrganizationRoleCreateNestedManyWithoutOrganizationInputObjectSchema).optional(),
  parent: z.lazy(() => OrganizationCreateNestedOneWithoutChildrenInputObjectSchema).optional(),
  children: z.lazy(() => OrganizationCreateNestedManyWithoutParentInputObjectSchema).optional(),
  ancestorClosures: z.lazy(() => OrganizationClosureCreateNestedManyWithoutAncestorInputObjectSchema).optional(),
  descendantClosures: z.lazy(() => OrganizationClosureCreateNestedManyWithoutDescendantInputObjectSchema).optional(),
  privilegeDelegations: z.lazy(() => PrivilegeDelegationCreateNestedManyWithoutOrganizationScopeInputObjectSchema).optional()
}).strict();
export const OrganizationCreateWithoutPosOrgCompositionInputObjectSchema: z.ZodType<Prisma.OrganizationCreateWithoutPosOrgCompositionInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationCreateWithoutPosOrgCompositionInput>;
export const OrganizationCreateWithoutPosOrgCompositionInputObjectZodSchema = makeSchema();
