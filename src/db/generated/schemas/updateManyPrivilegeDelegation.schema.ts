import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { PrivilegeDelegationUpdateManyMutationInputObjectSchema as PrivilegeDelegationUpdateManyMutationInputObjectSchema } from './objects/PrivilegeDelegationUpdateManyMutationInput.schema';
import { PrivilegeDelegationWhereInputObjectSchema as PrivilegeDelegationWhereInputObjectSchema } from './objects/PrivilegeDelegationWhereInput.schema';

export const PrivilegeDelegationUpdateManySchema: z.ZodType<Prisma.PrivilegeDelegationUpdateManyArgs> = z.object({ data: PrivilegeDelegationUpdateManyMutationInputObjectSchema, where: PrivilegeDelegationWhereInputObjectSchema.optional() }).strict() as unknown as z.ZodType<Prisma.PrivilegeDelegationUpdateManyArgs>;

export const PrivilegeDelegationUpdateManyZodSchema = z.object({ data: PrivilegeDelegationUpdateManyMutationInputObjectSchema, where: PrivilegeDelegationWhereInputObjectSchema.optional() }).strict();