import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { PrivilegeCreateWithoutDelegationsInputObjectSchema as PrivilegeCreateWithoutDelegationsInputObjectSchema } from './PrivilegeCreateWithoutDelegationsInput.schema';
import { PrivilegeUncheckedCreateWithoutDelegationsInputObjectSchema as PrivilegeUncheckedCreateWithoutDelegationsInputObjectSchema } from './PrivilegeUncheckedCreateWithoutDelegationsInput.schema';
import { PrivilegeCreateOrConnectWithoutDelegationsInputObjectSchema as PrivilegeCreateOrConnectWithoutDelegationsInputObjectSchema } from './PrivilegeCreateOrConnectWithoutDelegationsInput.schema';
import { PrivilegeUpsertWithoutDelegationsInputObjectSchema as PrivilegeUpsertWithoutDelegationsInputObjectSchema } from './PrivilegeUpsertWithoutDelegationsInput.schema';
import { PrivilegeWhereUniqueInputObjectSchema as PrivilegeWhereUniqueInputObjectSchema } from './PrivilegeWhereUniqueInput.schema';
import { PrivilegeUpdateToOneWithWhereWithoutDelegationsInputObjectSchema as PrivilegeUpdateToOneWithWhereWithoutDelegationsInputObjectSchema } from './PrivilegeUpdateToOneWithWhereWithoutDelegationsInput.schema';
import { PrivilegeUpdateWithoutDelegationsInputObjectSchema as PrivilegeUpdateWithoutDelegationsInputObjectSchema } from './PrivilegeUpdateWithoutDelegationsInput.schema';
import { PrivilegeUncheckedUpdateWithoutDelegationsInputObjectSchema as PrivilegeUncheckedUpdateWithoutDelegationsInputObjectSchema } from './PrivilegeUncheckedUpdateWithoutDelegationsInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => PrivilegeCreateWithoutDelegationsInputObjectSchema), z.lazy(() => PrivilegeUncheckedCreateWithoutDelegationsInputObjectSchema)]).optional(),
  connectOrCreate: z.lazy(() => PrivilegeCreateOrConnectWithoutDelegationsInputObjectSchema).optional(),
  upsert: z.lazy(() => PrivilegeUpsertWithoutDelegationsInputObjectSchema).optional(),
  connect: z.lazy(() => PrivilegeWhereUniqueInputObjectSchema).optional(),
  update: z.union([z.lazy(() => PrivilegeUpdateToOneWithWhereWithoutDelegationsInputObjectSchema), z.lazy(() => PrivilegeUpdateWithoutDelegationsInputObjectSchema), z.lazy(() => PrivilegeUncheckedUpdateWithoutDelegationsInputObjectSchema)]).optional()
}).strict();
export const PrivilegeUpdateOneRequiredWithoutDelegationsNestedInputObjectSchema: z.ZodType<Prisma.PrivilegeUpdateOneRequiredWithoutDelegationsNestedInput> = makeSchema() as unknown as z.ZodType<Prisma.PrivilegeUpdateOneRequiredWithoutDelegationsNestedInput>;
export const PrivilegeUpdateOneRequiredWithoutDelegationsNestedInputObjectZodSchema = makeSchema();
