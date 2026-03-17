import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { EmploymentUncheckedCreateNestedManyWithoutDeptartmentInputObjectSchema as EmploymentUncheckedCreateNestedManyWithoutDeptartmentInputObjectSchema } from './EmploymentUncheckedCreateNestedManyWithoutDeptartmentInput.schema';
import { EmploymentUncheckedCreateNestedManyWithoutCompanyInputObjectSchema as EmploymentUncheckedCreateNestedManyWithoutCompanyInputObjectSchema } from './EmploymentUncheckedCreateNestedManyWithoutCompanyInput.schema';
import { OrganizationRoleUncheckedCreateNestedManyWithoutOrganizationInputObjectSchema as OrganizationRoleUncheckedCreateNestedManyWithoutOrganizationInputObjectSchema } from './OrganizationRoleUncheckedCreateNestedManyWithoutOrganizationInput.schema';
import { PosOrgCompositionUncheckedCreateNestedManyWithoutOrganizationInputObjectSchema as PosOrgCompositionUncheckedCreateNestedManyWithoutOrganizationInputObjectSchema } from './PosOrgCompositionUncheckedCreateNestedManyWithoutOrganizationInput.schema';
import { OrganizationClosureUncheckedCreateNestedManyWithoutAncestorInputObjectSchema as OrganizationClosureUncheckedCreateNestedManyWithoutAncestorInputObjectSchema } from './OrganizationClosureUncheckedCreateNestedManyWithoutAncestorInput.schema';
import { OrganizationClosureUncheckedCreateNestedManyWithoutDescendantInputObjectSchema as OrganizationClosureUncheckedCreateNestedManyWithoutDescendantInputObjectSchema } from './OrganizationClosureUncheckedCreateNestedManyWithoutDescendantInput.schema';
import { PrivilegeDelegationUncheckedCreateNestedManyWithoutOrganizationScopeInputObjectSchema as PrivilegeDelegationUncheckedCreateNestedManyWithoutOrganizationScopeInputObjectSchema } from './PrivilegeDelegationUncheckedCreateNestedManyWithoutOrganizationScopeInput.schema'

const makeSchema = () => z.object({
  id: z.number().int().optional(),
  orgCode: z.string(),
  orgName: z.string(),
  parentId: z.number().int().optional(),
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
  deptEmployments: z.lazy(() => EmploymentUncheckedCreateNestedManyWithoutDeptartmentInputObjectSchema).optional(),
  compEmployments: z.lazy(() => EmploymentUncheckedCreateNestedManyWithoutCompanyInputObjectSchema).optional(),
  roles: z.lazy(() => OrganizationRoleUncheckedCreateNestedManyWithoutOrganizationInputObjectSchema).optional(),
  posOrgComposition: z.lazy(() => PosOrgCompositionUncheckedCreateNestedManyWithoutOrganizationInputObjectSchema).optional(),
  ancestorClosures: z.lazy(() => OrganizationClosureUncheckedCreateNestedManyWithoutAncestorInputObjectSchema).optional(),
  descendantClosures: z.lazy(() => OrganizationClosureUncheckedCreateNestedManyWithoutDescendantInputObjectSchema).optional(),
  privilegeDelegations: z.lazy(() => PrivilegeDelegationUncheckedCreateNestedManyWithoutOrganizationScopeInputObjectSchema).optional()
}).strict();
export const OrganizationUncheckedCreateWithoutChildrenInputObjectSchema: z.ZodType<Prisma.OrganizationUncheckedCreateWithoutChildrenInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationUncheckedCreateWithoutChildrenInput>;
export const OrganizationUncheckedCreateWithoutChildrenInputObjectZodSchema = makeSchema();
