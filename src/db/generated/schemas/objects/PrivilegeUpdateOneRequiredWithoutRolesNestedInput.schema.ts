import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { PrivilegeCreateWithoutRolesInputObjectSchema as PrivilegeCreateWithoutRolesInputObjectSchema } from './PrivilegeCreateWithoutRolesInput.schema';
import { PrivilegeUncheckedCreateWithoutRolesInputObjectSchema as PrivilegeUncheckedCreateWithoutRolesInputObjectSchema } from './PrivilegeUncheckedCreateWithoutRolesInput.schema';
import { PrivilegeCreateOrConnectWithoutRolesInputObjectSchema as PrivilegeCreateOrConnectWithoutRolesInputObjectSchema } from './PrivilegeCreateOrConnectWithoutRolesInput.schema';
import { PrivilegeUpsertWithoutRolesInputObjectSchema as PrivilegeUpsertWithoutRolesInputObjectSchema } from './PrivilegeUpsertWithoutRolesInput.schema';
import { PrivilegeWhereUniqueInputObjectSchema as PrivilegeWhereUniqueInputObjectSchema } from './PrivilegeWhereUniqueInput.schema';
import { PrivilegeUpdateToOneWithWhereWithoutRolesInputObjectSchema as PrivilegeUpdateToOneWithWhereWithoutRolesInputObjectSchema } from './PrivilegeUpdateToOneWithWhereWithoutRolesInput.schema';
import { PrivilegeUpdateWithoutRolesInputObjectSchema as PrivilegeUpdateWithoutRolesInputObjectSchema } from './PrivilegeUpdateWithoutRolesInput.schema';
import { PrivilegeUncheckedUpdateWithoutRolesInputObjectSchema as PrivilegeUncheckedUpdateWithoutRolesInputObjectSchema } from './PrivilegeUncheckedUpdateWithoutRolesInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => PrivilegeCreateWithoutRolesInputObjectSchema), z.lazy(() => PrivilegeUncheckedCreateWithoutRolesInputObjectSchema)]).optional(),
  connectOrCreate: z.lazy(() => PrivilegeCreateOrConnectWithoutRolesInputObjectSchema).optional(),
  upsert: z.lazy(() => PrivilegeUpsertWithoutRolesInputObjectSchema).optional(),
  connect: z.lazy(() => PrivilegeWhereUniqueInputObjectSchema).optional(),
  update: z.union([z.lazy(() => PrivilegeUpdateToOneWithWhereWithoutRolesInputObjectSchema), z.lazy(() => PrivilegeUpdateWithoutRolesInputObjectSchema), z.lazy(() => PrivilegeUncheckedUpdateWithoutRolesInputObjectSchema)]).optional()
}).strict();
export const PrivilegeUpdateOneRequiredWithoutRolesNestedInputObjectSchema: z.ZodType<Prisma.PrivilegeUpdateOneRequiredWithoutRolesNestedInput> = makeSchema() as unknown as z.ZodType<Prisma.PrivilegeUpdateOneRequiredWithoutRolesNestedInput>;
export const PrivilegeUpdateOneRequiredWithoutRolesNestedInputObjectZodSchema = makeSchema();
