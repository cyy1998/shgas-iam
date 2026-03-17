import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { IntFieldUpdateOperationsInputObjectSchema as IntFieldUpdateOperationsInputObjectSchema } from './IntFieldUpdateOperationsInput.schema';
import { StringFieldUpdateOperationsInputObjectSchema as StringFieldUpdateOperationsInputObjectSchema } from './StringFieldUpdateOperationsInput.schema';
import { BoolFieldUpdateOperationsInputObjectSchema as BoolFieldUpdateOperationsInputObjectSchema } from './BoolFieldUpdateOperationsInput.schema';
import { DateTimeFieldUpdateOperationsInputObjectSchema as DateTimeFieldUpdateOperationsInputObjectSchema } from './DateTimeFieldUpdateOperationsInput.schema';
import { EmploymentUncheckedUpdateManyWithoutDeptartmentNestedInputObjectSchema as EmploymentUncheckedUpdateManyWithoutDeptartmentNestedInputObjectSchema } from './EmploymentUncheckedUpdateManyWithoutDeptartmentNestedInput.schema';
import { EmploymentUncheckedUpdateManyWithoutCompanyNestedInputObjectSchema as EmploymentUncheckedUpdateManyWithoutCompanyNestedInputObjectSchema } from './EmploymentUncheckedUpdateManyWithoutCompanyNestedInput.schema';
import { OrganizationRoleUncheckedUpdateManyWithoutOrganizationNestedInputObjectSchema as OrganizationRoleUncheckedUpdateManyWithoutOrganizationNestedInputObjectSchema } from './OrganizationRoleUncheckedUpdateManyWithoutOrganizationNestedInput.schema';
import { PosOrgCompositionUncheckedUpdateManyWithoutOrganizationNestedInputObjectSchema as PosOrgCompositionUncheckedUpdateManyWithoutOrganizationNestedInputObjectSchema } from './PosOrgCompositionUncheckedUpdateManyWithoutOrganizationNestedInput.schema';
import { OrganizationClosureUncheckedUpdateManyWithoutAncestorNestedInputObjectSchema as OrganizationClosureUncheckedUpdateManyWithoutAncestorNestedInputObjectSchema } from './OrganizationClosureUncheckedUpdateManyWithoutAncestorNestedInput.schema';
import { OrganizationClosureUncheckedUpdateManyWithoutDescendantNestedInputObjectSchema as OrganizationClosureUncheckedUpdateManyWithoutDescendantNestedInputObjectSchema } from './OrganizationClosureUncheckedUpdateManyWithoutDescendantNestedInput.schema';
import { PrivilegeDelegationUncheckedUpdateManyWithoutOrganizationScopeNestedInputObjectSchema as PrivilegeDelegationUncheckedUpdateManyWithoutOrganizationScopeNestedInputObjectSchema } from './PrivilegeDelegationUncheckedUpdateManyWithoutOrganizationScopeNestedInput.schema'

const makeSchema = () => z.object({
  id: z.union([z.number().int(), z.lazy(() => IntFieldUpdateOperationsInputObjectSchema)]).optional(),
  orgCode: z.union([z.string(), z.lazy(() => StringFieldUpdateOperationsInputObjectSchema)]).optional(),
  orgName: z.union([z.string(), z.lazy(() => StringFieldUpdateOperationsInputObjectSchema)]).optional(),
  parentId: z.union([z.number().int(), z.lazy(() => IntFieldUpdateOperationsInputObjectSchema)]).optional(),
  businessParentId: z.union([z.number().int(), z.lazy(() => IntFieldUpdateOperationsInputObjectSchema)]).optional(),
  path: z.union([z.string(), z.lazy(() => StringFieldUpdateOperationsInputObjectSchema)]).optional(),
  level: z.union([z.number().int(), z.lazy(() => IntFieldUpdateOperationsInputObjectSchema)]).optional(),
  orgType: z.union([z.string(), z.lazy(() => StringFieldUpdateOperationsInputObjectSchema)]).optional(),
  orderNum: z.union([z.number().int(), z.lazy(() => IntFieldUpdateOperationsInputObjectSchema)]).optional(),
  isVirtual: z.union([z.boolean(), z.lazy(() => BoolFieldUpdateOperationsInputObjectSchema)]).optional(),
  isEntity: z.union([z.boolean(), z.lazy(() => BoolFieldUpdateOperationsInputObjectSchema)]).optional(),
  status: z.union([z.number().int(), z.lazy(() => IntFieldUpdateOperationsInputObjectSchema)]).optional(),
  isDelete: z.union([z.boolean(), z.lazy(() => BoolFieldUpdateOperationsInputObjectSchema)]).optional(),
  createTime: z.union([z.coerce.date(), z.lazy(() => DateTimeFieldUpdateOperationsInputObjectSchema)]).optional(),
  updateTime: z.union([z.coerce.date(), z.lazy(() => DateTimeFieldUpdateOperationsInputObjectSchema)]).optional(),
  deptEmployments: z.lazy(() => EmploymentUncheckedUpdateManyWithoutDeptartmentNestedInputObjectSchema).optional(),
  compEmployments: z.lazy(() => EmploymentUncheckedUpdateManyWithoutCompanyNestedInputObjectSchema).optional(),
  roles: z.lazy(() => OrganizationRoleUncheckedUpdateManyWithoutOrganizationNestedInputObjectSchema).optional(),
  posOrgComposition: z.lazy(() => PosOrgCompositionUncheckedUpdateManyWithoutOrganizationNestedInputObjectSchema).optional(),
  ancestorClosures: z.lazy(() => OrganizationClosureUncheckedUpdateManyWithoutAncestorNestedInputObjectSchema).optional(),
  descendantClosures: z.lazy(() => OrganizationClosureUncheckedUpdateManyWithoutDescendantNestedInputObjectSchema).optional(),
  privilegeDelegations: z.lazy(() => PrivilegeDelegationUncheckedUpdateManyWithoutOrganizationScopeNestedInputObjectSchema).optional()
}).strict();
export const OrganizationUncheckedUpdateWithoutChildrenInputObjectSchema: z.ZodType<Prisma.OrganizationUncheckedUpdateWithoutChildrenInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationUncheckedUpdateWithoutChildrenInput>;
export const OrganizationUncheckedUpdateWithoutChildrenInputObjectZodSchema = makeSchema();
