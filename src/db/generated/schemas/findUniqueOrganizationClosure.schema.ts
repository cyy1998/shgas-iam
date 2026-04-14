import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { OrganizationClosureWhereUniqueInputObjectSchema as OrganizationClosureWhereUniqueInputObjectSchema } from './objects/OrganizationClosureWhereUniqueInput.schema';

export const OrganizationClosureFindUniqueSchema: z.ZodType<Prisma.OrganizationClosureFindUniqueArgs> = z.object({   where: OrganizationClosureWhereUniqueInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.OrganizationClosureFindUniqueArgs>;

export const OrganizationClosureFindUniqueZodSchema = z.object({   where: OrganizationClosureWhereUniqueInputObjectSchema }).strict();