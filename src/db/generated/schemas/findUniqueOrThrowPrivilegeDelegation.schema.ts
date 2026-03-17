import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { PrivilegeDelegationSelectObjectSchema as PrivilegeDelegationSelectObjectSchema } from './objects/PrivilegeDelegationSelect.schema';
import { PrivilegeDelegationIncludeObjectSchema as PrivilegeDelegationIncludeObjectSchema } from './objects/PrivilegeDelegationInclude.schema';
import { PrivilegeDelegationWhereUniqueInputObjectSchema as PrivilegeDelegationWhereUniqueInputObjectSchema } from './objects/PrivilegeDelegationWhereUniqueInput.schema';

export const PrivilegeDelegationFindUniqueOrThrowSchema: z.ZodType<Prisma.PrivilegeDelegationFindUniqueOrThrowArgs> = z.object({ select: PrivilegeDelegationSelectObjectSchema.optional(), include: PrivilegeDelegationIncludeObjectSchema.optional(), where: PrivilegeDelegationWhereUniqueInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.PrivilegeDelegationFindUniqueOrThrowArgs>;

export const PrivilegeDelegationFindUniqueOrThrowZodSchema = z.object({ select: PrivilegeDelegationSelectObjectSchema.optional(), include: PrivilegeDelegationIncludeObjectSchema.optional(), where: PrivilegeDelegationWhereUniqueInputObjectSchema }).strict();