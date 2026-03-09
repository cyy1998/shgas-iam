import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { OrganizationCreateWithoutAncestorClosuresInputObjectSchema as OrganizationCreateWithoutAncestorClosuresInputObjectSchema } from './OrganizationCreateWithoutAncestorClosuresInput.schema';
import { OrganizationUncheckedCreateWithoutAncestorClosuresInputObjectSchema as OrganizationUncheckedCreateWithoutAncestorClosuresInputObjectSchema } from './OrganizationUncheckedCreateWithoutAncestorClosuresInput.schema';
import { OrganizationCreateOrConnectWithoutAncestorClosuresInputObjectSchema as OrganizationCreateOrConnectWithoutAncestorClosuresInputObjectSchema } from './OrganizationCreateOrConnectWithoutAncestorClosuresInput.schema';
import { OrganizationUpsertWithoutAncestorClosuresInputObjectSchema as OrganizationUpsertWithoutAncestorClosuresInputObjectSchema } from './OrganizationUpsertWithoutAncestorClosuresInput.schema';
import { OrganizationWhereUniqueInputObjectSchema as OrganizationWhereUniqueInputObjectSchema } from './OrganizationWhereUniqueInput.schema';
import { OrganizationUpdateToOneWithWhereWithoutAncestorClosuresInputObjectSchema as OrganizationUpdateToOneWithWhereWithoutAncestorClosuresInputObjectSchema } from './OrganizationUpdateToOneWithWhereWithoutAncestorClosuresInput.schema';
import { OrganizationUpdateWithoutAncestorClosuresInputObjectSchema as OrganizationUpdateWithoutAncestorClosuresInputObjectSchema } from './OrganizationUpdateWithoutAncestorClosuresInput.schema';
import { OrganizationUncheckedUpdateWithoutAncestorClosuresInputObjectSchema as OrganizationUncheckedUpdateWithoutAncestorClosuresInputObjectSchema } from './OrganizationUncheckedUpdateWithoutAncestorClosuresInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => OrganizationCreateWithoutAncestorClosuresInputObjectSchema), z.lazy(() => OrganizationUncheckedCreateWithoutAncestorClosuresInputObjectSchema)]).optional(),
  connectOrCreate: z.lazy(() => OrganizationCreateOrConnectWithoutAncestorClosuresInputObjectSchema).optional(),
  upsert: z.lazy(() => OrganizationUpsertWithoutAncestorClosuresInputObjectSchema).optional(),
  connect: z.lazy(() => OrganizationWhereUniqueInputObjectSchema).optional(),
  update: z.union([z.lazy(() => OrganizationUpdateToOneWithWhereWithoutAncestorClosuresInputObjectSchema), z.lazy(() => OrganizationUpdateWithoutAncestorClosuresInputObjectSchema), z.lazy(() => OrganizationUncheckedUpdateWithoutAncestorClosuresInputObjectSchema)]).optional()
}).strict();
export const OrganizationUpdateOneRequiredWithoutAncestorClosuresNestedInputObjectSchema: z.ZodType<Prisma.OrganizationUpdateOneRequiredWithoutAncestorClosuresNestedInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationUpdateOneRequiredWithoutAncestorClosuresNestedInput>;
export const OrganizationUpdateOneRequiredWithoutAncestorClosuresNestedInputObjectZodSchema = makeSchema();
