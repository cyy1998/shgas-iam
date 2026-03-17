import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { OrganizationClosureSelectObjectSchema as OrganizationClosureSelectObjectSchema } from './objects/OrganizationClosureSelect.schema';
import { OrganizationClosureIncludeObjectSchema as OrganizationClosureIncludeObjectSchema } from './objects/OrganizationClosureInclude.schema';
import { OrganizationClosureWhereUniqueInputObjectSchema as OrganizationClosureWhereUniqueInputObjectSchema } from './objects/OrganizationClosureWhereUniqueInput.schema';

export const OrganizationClosureDeleteOneSchema: z.ZodType<Prisma.OrganizationClosureDeleteArgs> = z.object({ select: OrganizationClosureSelectObjectSchema.optional(), include: OrganizationClosureIncludeObjectSchema.optional(), where: OrganizationClosureWhereUniqueInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.OrganizationClosureDeleteArgs>;

export const OrganizationClosureDeleteOneZodSchema = z.object({ select: OrganizationClosureSelectObjectSchema.optional(), include: OrganizationClosureIncludeObjectSchema.optional(), where: OrganizationClosureWhereUniqueInputObjectSchema }).strict();