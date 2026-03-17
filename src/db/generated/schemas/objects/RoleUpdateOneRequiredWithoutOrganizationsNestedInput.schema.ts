import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { RoleCreateWithoutOrganizationsInputObjectSchema as RoleCreateWithoutOrganizationsInputObjectSchema } from './RoleCreateWithoutOrganizationsInput.schema';
import { RoleUncheckedCreateWithoutOrganizationsInputObjectSchema as RoleUncheckedCreateWithoutOrganizationsInputObjectSchema } from './RoleUncheckedCreateWithoutOrganizationsInput.schema';
import { RoleCreateOrConnectWithoutOrganizationsInputObjectSchema as RoleCreateOrConnectWithoutOrganizationsInputObjectSchema } from './RoleCreateOrConnectWithoutOrganizationsInput.schema';
import { RoleUpsertWithoutOrganizationsInputObjectSchema as RoleUpsertWithoutOrganizationsInputObjectSchema } from './RoleUpsertWithoutOrganizationsInput.schema';
import { RoleWhereUniqueInputObjectSchema as RoleWhereUniqueInputObjectSchema } from './RoleWhereUniqueInput.schema';
import { RoleUpdateToOneWithWhereWithoutOrganizationsInputObjectSchema as RoleUpdateToOneWithWhereWithoutOrganizationsInputObjectSchema } from './RoleUpdateToOneWithWhereWithoutOrganizationsInput.schema';
import { RoleUpdateWithoutOrganizationsInputObjectSchema as RoleUpdateWithoutOrganizationsInputObjectSchema } from './RoleUpdateWithoutOrganizationsInput.schema';
import { RoleUncheckedUpdateWithoutOrganizationsInputObjectSchema as RoleUncheckedUpdateWithoutOrganizationsInputObjectSchema } from './RoleUncheckedUpdateWithoutOrganizationsInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => RoleCreateWithoutOrganizationsInputObjectSchema), z.lazy(() => RoleUncheckedCreateWithoutOrganizationsInputObjectSchema)]).optional(),
  connectOrCreate: z.lazy(() => RoleCreateOrConnectWithoutOrganizationsInputObjectSchema).optional(),
  upsert: z.lazy(() => RoleUpsertWithoutOrganizationsInputObjectSchema).optional(),
  connect: z.lazy(() => RoleWhereUniqueInputObjectSchema).optional(),
  update: z.union([z.lazy(() => RoleUpdateToOneWithWhereWithoutOrganizationsInputObjectSchema), z.lazy(() => RoleUpdateWithoutOrganizationsInputObjectSchema), z.lazy(() => RoleUncheckedUpdateWithoutOrganizationsInputObjectSchema)]).optional()
}).strict();
export const RoleUpdateOneRequiredWithoutOrganizationsNestedInputObjectSchema: z.ZodType<Prisma.RoleUpdateOneRequiredWithoutOrganizationsNestedInput> = makeSchema() as unknown as z.ZodType<Prisma.RoleUpdateOneRequiredWithoutOrganizationsNestedInput>;
export const RoleUpdateOneRequiredWithoutOrganizationsNestedInputObjectZodSchema = makeSchema();
