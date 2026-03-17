import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { PrivilegeDelegationSelectObjectSchema as PrivilegeDelegationSelectObjectSchema } from './objects/PrivilegeDelegationSelect.schema';
import { PrivilegeDelegationIncludeObjectSchema as PrivilegeDelegationIncludeObjectSchema } from './objects/PrivilegeDelegationInclude.schema';
import { PrivilegeDelegationUpdateInputObjectSchema as PrivilegeDelegationUpdateInputObjectSchema } from './objects/PrivilegeDelegationUpdateInput.schema';
import { PrivilegeDelegationUncheckedUpdateInputObjectSchema as PrivilegeDelegationUncheckedUpdateInputObjectSchema } from './objects/PrivilegeDelegationUncheckedUpdateInput.schema';
import { PrivilegeDelegationWhereUniqueInputObjectSchema as PrivilegeDelegationWhereUniqueInputObjectSchema } from './objects/PrivilegeDelegationWhereUniqueInput.schema';

export const PrivilegeDelegationUpdateOneSchema: z.ZodType<Prisma.PrivilegeDelegationUpdateArgs> = z.object({ select: PrivilegeDelegationSelectObjectSchema.optional(), include: PrivilegeDelegationIncludeObjectSchema.optional(), data: z.union([PrivilegeDelegationUpdateInputObjectSchema, PrivilegeDelegationUncheckedUpdateInputObjectSchema]), where: PrivilegeDelegationWhereUniqueInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.PrivilegeDelegationUpdateArgs>;

export const PrivilegeDelegationUpdateOneZodSchema = z.object({ select: PrivilegeDelegationSelectObjectSchema.optional(), include: PrivilegeDelegationIncludeObjectSchema.optional(), data: z.union([PrivilegeDelegationUpdateInputObjectSchema, PrivilegeDelegationUncheckedUpdateInputObjectSchema]), where: PrivilegeDelegationWhereUniqueInputObjectSchema }).strict();