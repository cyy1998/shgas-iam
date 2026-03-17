import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { DelegationDetailSelectObjectSchema as DelegationDetailSelectObjectSchema } from './objects/DelegationDetailSelect.schema';
import { DelegationDetailIncludeObjectSchema as DelegationDetailIncludeObjectSchema } from './objects/DelegationDetailInclude.schema';
import { DelegationDetailWhereUniqueInputObjectSchema as DelegationDetailWhereUniqueInputObjectSchema } from './objects/DelegationDetailWhereUniqueInput.schema';

export const DelegationDetailFindUniqueSchema: z.ZodType<Prisma.DelegationDetailFindUniqueArgs> = z.object({ select: DelegationDetailSelectObjectSchema.optional(), include: DelegationDetailIncludeObjectSchema.optional(), where: DelegationDetailWhereUniqueInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.DelegationDetailFindUniqueArgs>;

export const DelegationDetailFindUniqueZodSchema = z.object({ select: DelegationDetailSelectObjectSchema.optional(), include: DelegationDetailIncludeObjectSchema.optional(), where: DelegationDetailWhereUniqueInputObjectSchema }).strict();