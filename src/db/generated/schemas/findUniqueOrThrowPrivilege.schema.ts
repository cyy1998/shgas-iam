import type { Prisma } from '../prisma/client';
import { z } from '@hono/zod-openapi';
import { PrivilegeSelectObjectSchema as PrivilegeSelectObjectSchema } from './objects/PrivilegeSelect.schema';
import { PrivilegeIncludeObjectSchema as PrivilegeIncludeObjectSchema } from './objects/PrivilegeInclude.schema';
import { PrivilegeWhereUniqueInputObjectSchema as PrivilegeWhereUniqueInputObjectSchema } from './objects/PrivilegeWhereUniqueInput.schema';

export const PrivilegeFindUniqueOrThrowSchema: z.ZodType<Prisma.PrivilegeFindUniqueOrThrowArgs> = z.object({ select: PrivilegeSelectObjectSchema.optional(), include: PrivilegeIncludeObjectSchema.optional(), where: PrivilegeWhereUniqueInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.PrivilegeFindUniqueOrThrowArgs>;

export const PrivilegeFindUniqueOrThrowZodSchema = z.object({ select: PrivilegeSelectObjectSchema.optional(), include: PrivilegeIncludeObjectSchema.optional(), where: PrivilegeWhereUniqueInputObjectSchema }).strict();