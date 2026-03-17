import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { PrivilegeDelegationWhereInputObjectSchema as PrivilegeDelegationWhereInputObjectSchema } from './PrivilegeDelegationWhereInput.schema';
import { PrivilegeDelegationUpdateWithoutDelegationDetailsInputObjectSchema as PrivilegeDelegationUpdateWithoutDelegationDetailsInputObjectSchema } from './PrivilegeDelegationUpdateWithoutDelegationDetailsInput.schema';
import { PrivilegeDelegationUncheckedUpdateWithoutDelegationDetailsInputObjectSchema as PrivilegeDelegationUncheckedUpdateWithoutDelegationDetailsInputObjectSchema } from './PrivilegeDelegationUncheckedUpdateWithoutDelegationDetailsInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => PrivilegeDelegationWhereInputObjectSchema).optional(),
  data: z.union([z.lazy(() => PrivilegeDelegationUpdateWithoutDelegationDetailsInputObjectSchema), z.lazy(() => PrivilegeDelegationUncheckedUpdateWithoutDelegationDetailsInputObjectSchema)])
}).strict();
export const PrivilegeDelegationUpdateToOneWithWhereWithoutDelegationDetailsInputObjectSchema: z.ZodType<Prisma.PrivilegeDelegationUpdateToOneWithWhereWithoutDelegationDetailsInput> = makeSchema() as unknown as z.ZodType<Prisma.PrivilegeDelegationUpdateToOneWithWhereWithoutDelegationDetailsInput>;
export const PrivilegeDelegationUpdateToOneWithWhereWithoutDelegationDetailsInputObjectZodSchema = makeSchema();
