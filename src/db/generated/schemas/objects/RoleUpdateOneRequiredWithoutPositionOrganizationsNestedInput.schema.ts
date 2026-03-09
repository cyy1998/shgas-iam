import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { RoleCreateWithoutPositionOrganizationsInputObjectSchema as RoleCreateWithoutPositionOrganizationsInputObjectSchema } from './RoleCreateWithoutPositionOrganizationsInput.schema';
import { RoleUncheckedCreateWithoutPositionOrganizationsInputObjectSchema as RoleUncheckedCreateWithoutPositionOrganizationsInputObjectSchema } from './RoleUncheckedCreateWithoutPositionOrganizationsInput.schema';
import { RoleCreateOrConnectWithoutPositionOrganizationsInputObjectSchema as RoleCreateOrConnectWithoutPositionOrganizationsInputObjectSchema } from './RoleCreateOrConnectWithoutPositionOrganizationsInput.schema';
import { RoleUpsertWithoutPositionOrganizationsInputObjectSchema as RoleUpsertWithoutPositionOrganizationsInputObjectSchema } from './RoleUpsertWithoutPositionOrganizationsInput.schema';
import { RoleWhereUniqueInputObjectSchema as RoleWhereUniqueInputObjectSchema } from './RoleWhereUniqueInput.schema';
import { RoleUpdateToOneWithWhereWithoutPositionOrganizationsInputObjectSchema as RoleUpdateToOneWithWhereWithoutPositionOrganizationsInputObjectSchema } from './RoleUpdateToOneWithWhereWithoutPositionOrganizationsInput.schema';
import { RoleUpdateWithoutPositionOrganizationsInputObjectSchema as RoleUpdateWithoutPositionOrganizationsInputObjectSchema } from './RoleUpdateWithoutPositionOrganizationsInput.schema';
import { RoleUncheckedUpdateWithoutPositionOrganizationsInputObjectSchema as RoleUncheckedUpdateWithoutPositionOrganizationsInputObjectSchema } from './RoleUncheckedUpdateWithoutPositionOrganizationsInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => RoleCreateWithoutPositionOrganizationsInputObjectSchema), z.lazy(() => RoleUncheckedCreateWithoutPositionOrganizationsInputObjectSchema)]).optional(),
  connectOrCreate: z.lazy(() => RoleCreateOrConnectWithoutPositionOrganizationsInputObjectSchema).optional(),
  upsert: z.lazy(() => RoleUpsertWithoutPositionOrganizationsInputObjectSchema).optional(),
  connect: z.lazy(() => RoleWhereUniqueInputObjectSchema).optional(),
  update: z.union([z.lazy(() => RoleUpdateToOneWithWhereWithoutPositionOrganizationsInputObjectSchema), z.lazy(() => RoleUpdateWithoutPositionOrganizationsInputObjectSchema), z.lazy(() => RoleUncheckedUpdateWithoutPositionOrganizationsInputObjectSchema)]).optional()
}).strict();
export const RoleUpdateOneRequiredWithoutPositionOrganizationsNestedInputObjectSchema: z.ZodType<Prisma.RoleUpdateOneRequiredWithoutPositionOrganizationsNestedInput> = makeSchema() as unknown as z.ZodType<Prisma.RoleUpdateOneRequiredWithoutPositionOrganizationsNestedInput>;
export const RoleUpdateOneRequiredWithoutPositionOrganizationsNestedInputObjectZodSchema = makeSchema();
