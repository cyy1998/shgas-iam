import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { PrivilegeDelegationCreateNestedOneWithoutDelegationDetailsInputObjectSchema as PrivilegeDelegationCreateNestedOneWithoutDelegationDetailsInputObjectSchema } from './PrivilegeDelegationCreateNestedOneWithoutDelegationDetailsInput.schema';
import { PrivilegeCreateNestedOneWithoutDelegationsInputObjectSchema as PrivilegeCreateNestedOneWithoutDelegationsInputObjectSchema } from './PrivilegeCreateNestedOneWithoutDelegationsInput.schema'

const makeSchema = () => z.object({
  delegation: z.lazy(() => PrivilegeDelegationCreateNestedOneWithoutDelegationDetailsInputObjectSchema),
  privilege: z.lazy(() => PrivilegeCreateNestedOneWithoutDelegationsInputObjectSchema)
}).strict();
export const DelegationDetailCreateInputObjectSchema: z.ZodType<Prisma.DelegationDetailCreateInput> = makeSchema() as unknown as z.ZodType<Prisma.DelegationDetailCreateInput>;
export const DelegationDetailCreateInputObjectZodSchema = makeSchema();
