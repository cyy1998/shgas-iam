import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { OrganizationCreateWithoutRolesInputObjectSchema as OrganizationCreateWithoutRolesInputObjectSchema } from './OrganizationCreateWithoutRolesInput.schema';
import { OrganizationUncheckedCreateWithoutRolesInputObjectSchema as OrganizationUncheckedCreateWithoutRolesInputObjectSchema } from './OrganizationUncheckedCreateWithoutRolesInput.schema';
import { OrganizationCreateOrConnectWithoutRolesInputObjectSchema as OrganizationCreateOrConnectWithoutRolesInputObjectSchema } from './OrganizationCreateOrConnectWithoutRolesInput.schema';
import { OrganizationUpsertWithoutRolesInputObjectSchema as OrganizationUpsertWithoutRolesInputObjectSchema } from './OrganizationUpsertWithoutRolesInput.schema';
import { OrganizationWhereUniqueInputObjectSchema as OrganizationWhereUniqueInputObjectSchema } from './OrganizationWhereUniqueInput.schema';
import { OrganizationUpdateToOneWithWhereWithoutRolesInputObjectSchema as OrganizationUpdateToOneWithWhereWithoutRolesInputObjectSchema } from './OrganizationUpdateToOneWithWhereWithoutRolesInput.schema';
import { OrganizationUpdateWithoutRolesInputObjectSchema as OrganizationUpdateWithoutRolesInputObjectSchema } from './OrganizationUpdateWithoutRolesInput.schema';
import { OrganizationUncheckedUpdateWithoutRolesInputObjectSchema as OrganizationUncheckedUpdateWithoutRolesInputObjectSchema } from './OrganizationUncheckedUpdateWithoutRolesInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => OrganizationCreateWithoutRolesInputObjectSchema), z.lazy(() => OrganizationUncheckedCreateWithoutRolesInputObjectSchema)]).optional(),
  connectOrCreate: z.lazy(() => OrganizationCreateOrConnectWithoutRolesInputObjectSchema).optional(),
  upsert: z.lazy(() => OrganizationUpsertWithoutRolesInputObjectSchema).optional(),
  connect: z.lazy(() => OrganizationWhereUniqueInputObjectSchema).optional(),
  update: z.union([z.lazy(() => OrganizationUpdateToOneWithWhereWithoutRolesInputObjectSchema), z.lazy(() => OrganizationUpdateWithoutRolesInputObjectSchema), z.lazy(() => OrganizationUncheckedUpdateWithoutRolesInputObjectSchema)]).optional()
}).strict();
export const OrganizationUpdateOneRequiredWithoutRolesNestedInputObjectSchema: z.ZodType<Prisma.OrganizationUpdateOneRequiredWithoutRolesNestedInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationUpdateOneRequiredWithoutRolesNestedInput>;
export const OrganizationUpdateOneRequiredWithoutRolesNestedInputObjectZodSchema = makeSchema();
