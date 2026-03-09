import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { PrivilegeUpdateWithoutDelegationsInputObjectSchema as PrivilegeUpdateWithoutDelegationsInputObjectSchema } from './PrivilegeUpdateWithoutDelegationsInput.schema';
import { PrivilegeUncheckedUpdateWithoutDelegationsInputObjectSchema as PrivilegeUncheckedUpdateWithoutDelegationsInputObjectSchema } from './PrivilegeUncheckedUpdateWithoutDelegationsInput.schema';
import { PrivilegeCreateWithoutDelegationsInputObjectSchema as PrivilegeCreateWithoutDelegationsInputObjectSchema } from './PrivilegeCreateWithoutDelegationsInput.schema';
import { PrivilegeUncheckedCreateWithoutDelegationsInputObjectSchema as PrivilegeUncheckedCreateWithoutDelegationsInputObjectSchema } from './PrivilegeUncheckedCreateWithoutDelegationsInput.schema';
import { PrivilegeWhereInputObjectSchema as PrivilegeWhereInputObjectSchema } from './PrivilegeWhereInput.schema'

const makeSchema = () => z.object({
  update: z.union([z.lazy(() => PrivilegeUpdateWithoutDelegationsInputObjectSchema), z.lazy(() => PrivilegeUncheckedUpdateWithoutDelegationsInputObjectSchema)]),
  create: z.union([z.lazy(() => PrivilegeCreateWithoutDelegationsInputObjectSchema), z.lazy(() => PrivilegeUncheckedCreateWithoutDelegationsInputObjectSchema)]),
  where: z.lazy(() => PrivilegeWhereInputObjectSchema).optional()
}).strict();
export const PrivilegeUpsertWithoutDelegationsInputObjectSchema: z.ZodType<Prisma.PrivilegeUpsertWithoutDelegationsInput> = makeSchema() as unknown as z.ZodType<Prisma.PrivilegeUpsertWithoutDelegationsInput>;
export const PrivilegeUpsertWithoutDelegationsInputObjectZodSchema = makeSchema();
