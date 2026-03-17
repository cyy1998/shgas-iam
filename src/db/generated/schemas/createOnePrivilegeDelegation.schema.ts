import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { PrivilegeDelegationSelectObjectSchema as PrivilegeDelegationSelectObjectSchema } from './objects/PrivilegeDelegationSelect.schema';
import { PrivilegeDelegationIncludeObjectSchema as PrivilegeDelegationIncludeObjectSchema } from './objects/PrivilegeDelegationInclude.schema';
import { PrivilegeDelegationCreateInputObjectSchema as PrivilegeDelegationCreateInputObjectSchema } from './objects/PrivilegeDelegationCreateInput.schema';
import { PrivilegeDelegationUncheckedCreateInputObjectSchema as PrivilegeDelegationUncheckedCreateInputObjectSchema } from './objects/PrivilegeDelegationUncheckedCreateInput.schema';

export const PrivilegeDelegationCreateOneSchema: z.ZodType<Prisma.PrivilegeDelegationCreateArgs> = z.object({ select: PrivilegeDelegationSelectObjectSchema.optional(), include: PrivilegeDelegationIncludeObjectSchema.optional(), data: z.union([PrivilegeDelegationCreateInputObjectSchema, PrivilegeDelegationUncheckedCreateInputObjectSchema]) }).strict() as unknown as z.ZodType<Prisma.PrivilegeDelegationCreateArgs>;

export const PrivilegeDelegationCreateOneZodSchema = z.object({ select: PrivilegeDelegationSelectObjectSchema.optional(), include: PrivilegeDelegationIncludeObjectSchema.optional(), data: z.union([PrivilegeDelegationCreateInputObjectSchema, PrivilegeDelegationUncheckedCreateInputObjectSchema]) }).strict();