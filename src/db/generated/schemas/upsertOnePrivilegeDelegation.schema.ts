import type { Prisma } from '../prisma/client';
import { z } from '@hono/zod-openapi';
import { PrivilegeDelegationSelectObjectSchema as PrivilegeDelegationSelectObjectSchema } from './objects/PrivilegeDelegationSelect.schema';
import { PrivilegeDelegationIncludeObjectSchema as PrivilegeDelegationIncludeObjectSchema } from './objects/PrivilegeDelegationInclude.schema';
import { PrivilegeDelegationWhereUniqueInputObjectSchema as PrivilegeDelegationWhereUniqueInputObjectSchema } from './objects/PrivilegeDelegationWhereUniqueInput.schema';
import { PrivilegeDelegationCreateInputObjectSchema as PrivilegeDelegationCreateInputObjectSchema } from './objects/PrivilegeDelegationCreateInput.schema';
import { PrivilegeDelegationUncheckedCreateInputObjectSchema as PrivilegeDelegationUncheckedCreateInputObjectSchema } from './objects/PrivilegeDelegationUncheckedCreateInput.schema';
import { PrivilegeDelegationUpdateInputObjectSchema as PrivilegeDelegationUpdateInputObjectSchema } from './objects/PrivilegeDelegationUpdateInput.schema';
import { PrivilegeDelegationUncheckedUpdateInputObjectSchema as PrivilegeDelegationUncheckedUpdateInputObjectSchema } from './objects/PrivilegeDelegationUncheckedUpdateInput.schema';

export const PrivilegeDelegationUpsertOneSchema: z.ZodType<Prisma.PrivilegeDelegationUpsertArgs> = z.object({ select: PrivilegeDelegationSelectObjectSchema.optional(), include: PrivilegeDelegationIncludeObjectSchema.optional(), where: PrivilegeDelegationWhereUniqueInputObjectSchema, create: z.union([ PrivilegeDelegationCreateInputObjectSchema, PrivilegeDelegationUncheckedCreateInputObjectSchema ]), update: z.union([ PrivilegeDelegationUpdateInputObjectSchema, PrivilegeDelegationUncheckedUpdateInputObjectSchema ]) }).strict() as unknown as z.ZodType<Prisma.PrivilegeDelegationUpsertArgs>;

export const PrivilegeDelegationUpsertOneZodSchema = z.object({ select: PrivilegeDelegationSelectObjectSchema.optional(), include: PrivilegeDelegationIncludeObjectSchema.optional(), where: PrivilegeDelegationWhereUniqueInputObjectSchema, create: z.union([ PrivilegeDelegationCreateInputObjectSchema, PrivilegeDelegationUncheckedCreateInputObjectSchema ]), update: z.union([ PrivilegeDelegationUpdateInputObjectSchema, PrivilegeDelegationUncheckedUpdateInputObjectSchema ]) }).strict();