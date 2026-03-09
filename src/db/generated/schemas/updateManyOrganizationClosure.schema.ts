import type { Prisma } from '../prisma/client';
import { z } from '@hono/zod-openapi';
import { OrganizationClosureUpdateManyMutationInputObjectSchema as OrganizationClosureUpdateManyMutationInputObjectSchema } from './objects/OrganizationClosureUpdateManyMutationInput.schema';
import { OrganizationClosureWhereInputObjectSchema as OrganizationClosureWhereInputObjectSchema } from './objects/OrganizationClosureWhereInput.schema';

export const OrganizationClosureUpdateManySchema: z.ZodType<Prisma.OrganizationClosureUpdateManyArgs> = z.object({ data: OrganizationClosureUpdateManyMutationInputObjectSchema, where: OrganizationClosureWhereInputObjectSchema.optional() }).strict() as unknown as z.ZodType<Prisma.OrganizationClosureUpdateManyArgs>;

export const OrganizationClosureUpdateManyZodSchema = z.object({ data: OrganizationClosureUpdateManyMutationInputObjectSchema, where: OrganizationClosureWhereInputObjectSchema.optional() }).strict();