import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { StringFieldUpdateOperationsInputObjectSchema as StringFieldUpdateOperationsInputObjectSchema } from './StringFieldUpdateOperationsInput.schema';
import { IntFieldUpdateOperationsInputObjectSchema as IntFieldUpdateOperationsInputObjectSchema } from './IntFieldUpdateOperationsInput.schema';
import { BoolFieldUpdateOperationsInputObjectSchema as BoolFieldUpdateOperationsInputObjectSchema } from './BoolFieldUpdateOperationsInput.schema';
import { DateTimeFieldUpdateOperationsInputObjectSchema as DateTimeFieldUpdateOperationsInputObjectSchema } from './DateTimeFieldUpdateOperationsInput.schema';
import { EmploymentUpdateManyWithoutDeptartmentNestedInputObjectSchema as EmploymentUpdateManyWithoutDeptartmentNestedInputObjectSchema } from './EmploymentUpdateManyWithoutDeptartmentNestedInput.schema';
import { EmploymentUpdateManyWithoutCompanyNestedInputObjectSchema as EmploymentUpdateManyWithoutCompanyNestedInputObjectSchema } from './EmploymentUpdateManyWithoutCompanyNestedInput.schema';
import { OrganizationRoleUpdateManyWithoutOrganizationNestedInputObjectSchema as OrganizationRoleUpdateManyWithoutOrganizationNestedInputObjectSchema } from './OrganizationRoleUpdateManyWithoutOrganizationNestedInput.schema';
import { PosOrgCompositionUpdateManyWithoutOrganizationNestedInputObjectSchema as PosOrgCompositionUpdateManyWithoutOrganizationNestedInputObjectSchema } from './PosOrgCompositionUpdateManyWithoutOrganizationNestedInput.schema';
import { OrganizationUpdateOneWithoutChildrenNestedInputObjectSchema as OrganizationUpdateOneWithoutChildrenNestedInputObjectSchema } from './OrganizationUpdateOneWithoutChildrenNestedInput.schema';
import { OrganizationClosureUpdateManyWithoutAncestorNestedInputObjectSchema as OrganizationClosureUpdateManyWithoutAncestorNestedInputObjectSchema } from './OrganizationClosureUpdateManyWithoutAncestorNestedInput.schema';
import { OrganizationClosureUpdateManyWithoutDescendantNestedInputObjectSchema as OrganizationClosureUpdateManyWithoutDescendantNestedInputObjectSchema } from './OrganizationClosureUpdateManyWithoutDescendantNestedInput.schema';
import { PrivilegeDelegationUpdateManyWithoutOrganizationScopeNestedInputObjectSchema as PrivilegeDelegationUpdateManyWithoutOrganizationScopeNestedInputObjectSchema } from './PrivilegeDelegationUpdateManyWithoutOrganizationScopeNestedInput.schema'

const makeSchema = () => z.object({
  orgCode: z.union([z.string(), z.lazy(() => StringFieldUpdateOperationsInputObjectSchema)]).optional(),
  orgName: z.union([z.string(), z.lazy(() => StringFieldUpdateOperationsInputObjectSchema)]).optional(),
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
  deptEmployments: z.lazy(() => EmploymentUpdateManyWithoutDeptartmentNestedInputObjectSchema).optional(),
  compEmployments: z.lazy(() => EmploymentUpdateManyWithoutCompanyNestedInputObjectSchema).optional(),
  roles: z.lazy(() => OrganizationRoleUpdateManyWithoutOrganizationNestedInputObjectSchema).optional(),
  posOrgComposition: z.lazy(() => PosOrgCompositionUpdateManyWithoutOrganizationNestedInputObjectSchema).optional(),
  parent: z.lazy(() => OrganizationUpdateOneWithoutChildrenNestedInputObjectSchema).optional(),
  ancestorClosures: z.lazy(() => OrganizationClosureUpdateManyWithoutAncestorNestedInputObjectSchema).optional(),
  descendantClosures: z.lazy(() => OrganizationClosureUpdateManyWithoutDescendantNestedInputObjectSchema).optional(),
  privilegeDelegations: z.lazy(() => PrivilegeDelegationUpdateManyWithoutOrganizationScopeNestedInputObjectSchema).optional()
}).strict();
export const OrganizationUpdateWithoutChildrenInputObjectSchema: z.ZodType<Prisma.OrganizationUpdateWithoutChildrenInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationUpdateWithoutChildrenInput>;
export const OrganizationUpdateWithoutChildrenInputObjectZodSchema = makeSchema();
