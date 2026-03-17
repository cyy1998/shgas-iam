import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { EmploymentCreateNestedManyWithoutDeptartmentInputObjectSchema as EmploymentCreateNestedManyWithoutDeptartmentInputObjectSchema } from './EmploymentCreateNestedManyWithoutDeptartmentInput.schema';
import { EmploymentCreateNestedManyWithoutCompanyInputObjectSchema as EmploymentCreateNestedManyWithoutCompanyInputObjectSchema } from './EmploymentCreateNestedManyWithoutCompanyInput.schema';
import { PosOrgCompositionCreateNestedManyWithoutOrganizationInputObjectSchema as PosOrgCompositionCreateNestedManyWithoutOrganizationInputObjectSchema } from './PosOrgCompositionCreateNestedManyWithoutOrganizationInput.schema';
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
  posOrgComposition: z.lazy(() => PosOrgCompositionCreateNestedManyWithoutOrganizationInputObjectSchema).optional(),
  parent: z.lazy(() => OrganizationCreateNestedOneWithoutChildrenInputObjectSchema).optional(),
  children: z.lazy(() => OrganizationCreateNestedManyWithoutParentInputObjectSchema).optional(),
  ancestorClosures: z.lazy(() => OrganizationClosureCreateNestedManyWithoutAncestorInputObjectSchema).optional(),
  descendantClosures: z.lazy(() => OrganizationClosureCreateNestedManyWithoutDescendantInputObjectSchema).optional(),
  privilegeDelegations: z.lazy(() => PrivilegeDelegationCreateNestedManyWithoutOrganizationScopeInputObjectSchema).optional()
}).strict();
export const OrganizationCreateWithoutRolesInputObjectSchema: z.ZodType<Prisma.OrganizationCreateWithoutRolesInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationCreateWithoutRolesInput>;
export const OrganizationCreateWithoutRolesInputObjectZodSchema = makeSchema();
