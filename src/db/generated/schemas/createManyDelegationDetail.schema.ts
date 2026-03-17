import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { DelegationDetailCreateManyInputObjectSchema as DelegationDetailCreateManyInputObjectSchema } from './objects/DelegationDetailCreateManyInput.schema';

export const DelegationDetailCreateManySchema: z.ZodType<Prisma.DelegationDetailCreateManyArgs> = z.object({ data: z.union([ DelegationDetailCreateManyInputObjectSchema, z.array(DelegationDetailCreateManyInputObjectSchema) ]),  }).strict() as unknown as z.ZodType<Prisma.DelegationDetailCreateManyArgs>;

export const DelegationDetailCreateManyZodSchema = z.object({ data: z.union([ DelegationDetailCreateManyInputObjectSchema, z.array(DelegationDetailCreateManyInputObjectSchema) ]),  }).strict();