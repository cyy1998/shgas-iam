import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { UserCreateNestedOneWithoutDelegationToInputObjectSchema as UserCreateNestedOneWithoutDelegationToInputObjectSchema } from './UserCreateNestedOneWithoutDelegationToInput.schema';
import { OrganizationCreateNestedOneWithoutPrivilegeDelegationsInputObjectSchema as OrganizationCreateNestedOneWithoutPrivilegeDelegationsInputObjectSchema } from './OrganizationCreateNestedOneWithoutPrivilegeDelegationsInput.schema';
import { DelegationDetailCreateNestedManyWithoutDelegationInputObjectSchema as DelegationDetailCreateNestedManyWithoutDelegationInputObjectSchema } from './DelegationDetailCreateNestedManyWithoutDelegationInput.schema'

const makeSchema = () => z.object({
  startTime: z.coerce.date(),
  endTime: z.coerce.date(),
  status: z.number().int().optional(),
  description: z.string().max(500).optional().nullable(),
  isDelete: z.boolean().optional(),
  createTime: z.coerce.date().optional(),
  updateTime: z.coerce.date().optional(),
  delegatorUser: z.lazy(() => UserCreateNestedOneWithoutDelegationToInputObjectSchema),
  organizationScope: z.lazy(() => OrganizationCreateNestedOneWithoutPrivilegeDelegationsInputObjectSchema),
  delegationDetails: z.lazy(() => DelegationDetailCreateNestedManyWithoutDelegationInputObjectSchema).optional()
}).strict();
export const PrivilegeDelegationCreateWithoutDelegateeUserInputObjectSchema: z.ZodType<Prisma.PrivilegeDelegationCreateWithoutDelegateeUserInput> = makeSchema() as unknown as z.ZodType<Prisma.PrivilegeDelegationCreateWithoutDelegateeUserInput>;
export const PrivilegeDelegationCreateWithoutDelegateeUserInputObjectZodSchema = makeSchema();
