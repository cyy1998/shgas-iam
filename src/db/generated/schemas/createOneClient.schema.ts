import type { Prisma } from '../prisma/client';
import { z } from '@hono/zod-openapi';
import { ClientSelectObjectSchema as ClientSelectObjectSchema } from './objects/ClientSelect.schema';
import { ClientIncludeObjectSchema as ClientIncludeObjectSchema } from './objects/ClientInclude.schema';
import { ClientCreateInputObjectSchema as ClientCreateInputObjectSchema } from './objects/ClientCreateInput.schema';
import { ClientUncheckedCreateInputObjectSchema as ClientUncheckedCreateInputObjectSchema } from './objects/ClientUncheckedCreateInput.schema';

export const ClientCreateOneSchema: z.ZodType<Prisma.ClientCreateArgs> = z.object({ select: ClientSelectObjectSchema.optional(), include: ClientIncludeObjectSchema.optional(), data: z.union([ClientCreateInputObjectSchema, ClientUncheckedCreateInputObjectSchema]) }).strict() as unknown as z.ZodType<Prisma.ClientCreateArgs>;

export const ClientCreateOneZodSchema = z.object({ select: ClientSelectObjectSchema.optional(), include: ClientIncludeObjectSchema.optional(), data: z.union([ClientCreateInputObjectSchema, ClientUncheckedCreateInputObjectSchema]) }).strict();