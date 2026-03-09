import type { Prisma } from '../prisma/client';
import { z } from '@hono/zod-openapi';
import { OrganizationClosureSelectObjectSchema as OrganizationClosureSelectObjectSchema } from './objects/OrganizationClosureSelect.schema';
import { OrganizationClosureIncludeObjectSchema as OrganizationClosureIncludeObjectSchema } from './objects/OrganizationClosureInclude.schema';
import { OrganizationClosureCreateInputObjectSchema as OrganizationClosureCreateInputObjectSchema } from './objects/OrganizationClosureCreateInput.schema';
import { OrganizationClosureUncheckedCreateInputObjectSchema as OrganizationClosureUncheckedCreateInputObjectSchema } from './objects/OrganizationClosureUncheckedCreateInput.schema';

export const OrganizationClosureCreateOneSchema: z.ZodType<Prisma.OrganizationClosureCreateArgs> = z.object({ select: OrganizationClosureSelectObjectSchema.optional(), include: OrganizationClosureIncludeObjectSchema.optional(), data: z.union([OrganizationClosureCreateInputObjectSchema, OrganizationClosureUncheckedCreateInputObjectSchema]) }).strict() as unknown as z.ZodType<Prisma.OrganizationClosureCreateArgs>;

export const OrganizationClosureCreateOneZodSchema = z.object({ select: OrganizationClosureSelectObjectSchema.optional(), include: OrganizationClosureIncludeObjectSchema.optional(), data: z.union([OrganizationClosureCreateInputObjectSchema, OrganizationClosureUncheckedCreateInputObjectSchema]) }).strict();