import type { Prisma } from '../prisma/client';
import { z } from '@hono/zod-openapi';
import { DelegationDetailSelectObjectSchema as DelegationDetailSelectObjectSchema } from './objects/DelegationDetailSelect.schema';
import { DelegationDetailIncludeObjectSchema as DelegationDetailIncludeObjectSchema } from './objects/DelegationDetailInclude.schema';
import { DelegationDetailWhereUniqueInputObjectSchema as DelegationDetailWhereUniqueInputObjectSchema } from './objects/DelegationDetailWhereUniqueInput.schema';

export const DelegationDetailFindUniqueOrThrowSchema: z.ZodType<Prisma.DelegationDetailFindUniqueOrThrowArgs> = z.object({ select: DelegationDetailSelectObjectSchema.optional(), include: DelegationDetailIncludeObjectSchema.optional(), where: DelegationDetailWhereUniqueInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.DelegationDetailFindUniqueOrThrowArgs>;

export const DelegationDetailFindUniqueOrThrowZodSchema = z.object({ select: DelegationDetailSelectObjectSchema.optional(), include: DelegationDetailIncludeObjectSchema.optional(), where: DelegationDetailWhereUniqueInputObjectSchema }).strict();