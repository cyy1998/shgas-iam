import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { ClientSelectObjectSchema as ClientSelectObjectSchema } from './objects/ClientSelect.schema';
import { ClientIncludeObjectSchema as ClientIncludeObjectSchema } from './objects/ClientInclude.schema';
import { ClientWhereUniqueInputObjectSchema as ClientWhereUniqueInputObjectSchema } from './objects/ClientWhereUniqueInput.schema';

export const ClientFindUniqueOrThrowSchema: z.ZodType<Prisma.ClientFindUniqueOrThrowArgs> = z.object({ select: ClientSelectObjectSchema.optional(), include: ClientIncludeObjectSchema.optional(), where: ClientWhereUniqueInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.ClientFindUniqueOrThrowArgs>;

export const ClientFindUniqueOrThrowZodSchema = z.object({ select: ClientSelectObjectSchema.optional(), include: ClientIncludeObjectSchema.optional(), where: ClientWhereUniqueInputObjectSchema }).strict();