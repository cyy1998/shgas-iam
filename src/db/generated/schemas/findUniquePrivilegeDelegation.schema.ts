import type { Prisma } from '../prisma/client';
import { z } from '@hono/zod-openapi';
import { PrivilegeDelegationSelectObjectSchema as PrivilegeDelegationSelectObjectSchema } from './objects/PrivilegeDelegationSelect.schema';
import { PrivilegeDelegationIncludeObjectSchema as PrivilegeDelegationIncludeObjectSchema } from './objects/PrivilegeDelegationInclude.schema';
import { PrivilegeDelegationWhereUniqueInputObjectSchema as PrivilegeDelegationWhereUniqueInputObjectSchema } from './objects/PrivilegeDelegationWhereUniqueInput.schema';

export const PrivilegeDelegationFindUniqueSchema: z.ZodType<Prisma.PrivilegeDelegationFindUniqueArgs> = z.object({ select: PrivilegeDelegationSelectObjectSchema.optional(), include: PrivilegeDelegationIncludeObjectSchema.optional(), where: PrivilegeDelegationWhereUniqueInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.PrivilegeDelegationFindUniqueArgs>;

export const PrivilegeDelegationFindUniqueZodSchema = z.object({ select: PrivilegeDelegationSelectObjectSchema.optional(), include: PrivilegeDelegationIncludeObjectSchema.optional(), where: PrivilegeDelegationWhereUniqueInputObjectSchema }).strict();