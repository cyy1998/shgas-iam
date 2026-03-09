import type { Prisma } from '../prisma/client';
import { z } from '@hono/zod-openapi';
import { OrganizationClosureSelectObjectSchema as OrganizationClosureSelectObjectSchema } from './objects/OrganizationClosureSelect.schema';
import { OrganizationClosureIncludeObjectSchema as OrganizationClosureIncludeObjectSchema } from './objects/OrganizationClosureInclude.schema';
import { OrganizationClosureWhereUniqueInputObjectSchema as OrganizationClosureWhereUniqueInputObjectSchema } from './objects/OrganizationClosureWhereUniqueInput.schema';
import { OrganizationClosureCreateInputObjectSchema as OrganizationClosureCreateInputObjectSchema } from './objects/OrganizationClosureCreateInput.schema';
import { OrganizationClosureUncheckedCreateInputObjectSchema as OrganizationClosureUncheckedCreateInputObjectSchema } from './objects/OrganizationClosureUncheckedCreateInput.schema';
import { OrganizationClosureUpdateInputObjectSchema as OrganizationClosureUpdateInputObjectSchema } from './objects/OrganizationClosureUpdateInput.schema';
import { OrganizationClosureUncheckedUpdateInputObjectSchema as OrganizationClosureUncheckedUpdateInputObjectSchema } from './objects/OrganizationClosureUncheckedUpdateInput.schema';

export const OrganizationClosureUpsertOneSchema: z.ZodType<Prisma.OrganizationClosureUpsertArgs> = z.object({ select: OrganizationClosureSelectObjectSchema.optional(), include: OrganizationClosureIncludeObjectSchema.optional(), where: OrganizationClosureWhereUniqueInputObjectSchema, create: z.union([ OrganizationClosureCreateInputObjectSchema, OrganizationClosureUncheckedCreateInputObjectSchema ]), update: z.union([ OrganizationClosureUpdateInputObjectSchema, OrganizationClosureUncheckedUpdateInputObjectSchema ]) }).strict() as unknown as z.ZodType<Prisma.OrganizationClosureUpsertArgs>;

export const OrganizationClosureUpsertOneZodSchema = z.object({ select: OrganizationClosureSelectObjectSchema.optional(), include: OrganizationClosureIncludeObjectSchema.optional(), where: OrganizationClosureWhereUniqueInputObjectSchema, create: z.union([ OrganizationClosureCreateInputObjectSchema, OrganizationClosureUncheckedCreateInputObjectSchema ]), update: z.union([ OrganizationClosureUpdateInputObjectSchema, OrganizationClosureUncheckedUpdateInputObjectSchema ]) }).strict();