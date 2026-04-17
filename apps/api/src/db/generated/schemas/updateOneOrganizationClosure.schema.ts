import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { OrganizationClosureUpdateInputObjectSchema as OrganizationClosureUpdateInputObjectSchema } from './objects/OrganizationClosureUpdateInput.schema';
import { OrganizationClosureUncheckedUpdateInputObjectSchema as OrganizationClosureUncheckedUpdateInputObjectSchema } from './objects/OrganizationClosureUncheckedUpdateInput.schema';
import { OrganizationClosureWhereUniqueInputObjectSchema as OrganizationClosureWhereUniqueInputObjectSchema } from './objects/OrganizationClosureWhereUniqueInput.schema';

export const OrganizationClosureUpdateOneSchema: z.ZodType<Prisma.OrganizationClosureUpdateArgs> = z.object({   data: z.union([OrganizationClosureUpdateInputObjectSchema, OrganizationClosureUncheckedUpdateInputObjectSchema]), where: OrganizationClosureWhereUniqueInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.OrganizationClosureUpdateArgs>;

export const OrganizationClosureUpdateOneZodSchema = z.object({   data: z.union([OrganizationClosureUpdateInputObjectSchema, OrganizationClosureUncheckedUpdateInputObjectSchema]), where: OrganizationClosureWhereUniqueInputObjectSchema }).strict();