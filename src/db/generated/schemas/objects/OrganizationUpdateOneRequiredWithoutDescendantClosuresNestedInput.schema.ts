import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { OrganizationCreateWithoutDescendantClosuresInputObjectSchema as OrganizationCreateWithoutDescendantClosuresInputObjectSchema } from './OrganizationCreateWithoutDescendantClosuresInput.schema';
import { OrganizationUncheckedCreateWithoutDescendantClosuresInputObjectSchema as OrganizationUncheckedCreateWithoutDescendantClosuresInputObjectSchema } from './OrganizationUncheckedCreateWithoutDescendantClosuresInput.schema';
import { OrganizationCreateOrConnectWithoutDescendantClosuresInputObjectSchema as OrganizationCreateOrConnectWithoutDescendantClosuresInputObjectSchema } from './OrganizationCreateOrConnectWithoutDescendantClosuresInput.schema';
import { OrganizationUpsertWithoutDescendantClosuresInputObjectSchema as OrganizationUpsertWithoutDescendantClosuresInputObjectSchema } from './OrganizationUpsertWithoutDescendantClosuresInput.schema';
import { OrganizationWhereUniqueInputObjectSchema as OrganizationWhereUniqueInputObjectSchema } from './OrganizationWhereUniqueInput.schema';
import { OrganizationUpdateToOneWithWhereWithoutDescendantClosuresInputObjectSchema as OrganizationUpdateToOneWithWhereWithoutDescendantClosuresInputObjectSchema } from './OrganizationUpdateToOneWithWhereWithoutDescendantClosuresInput.schema';
import { OrganizationUpdateWithoutDescendantClosuresInputObjectSchema as OrganizationUpdateWithoutDescendantClosuresInputObjectSchema } from './OrganizationUpdateWithoutDescendantClosuresInput.schema';
import { OrganizationUncheckedUpdateWithoutDescendantClosuresInputObjectSchema as OrganizationUncheckedUpdateWithoutDescendantClosuresInputObjectSchema } from './OrganizationUncheckedUpdateWithoutDescendantClosuresInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => OrganizationCreateWithoutDescendantClosuresInputObjectSchema), z.lazy(() => OrganizationUncheckedCreateWithoutDescendantClosuresInputObjectSchema)]).optional(),
  connectOrCreate: z.lazy(() => OrganizationCreateOrConnectWithoutDescendantClosuresInputObjectSchema).optional(),
  upsert: z.lazy(() => OrganizationUpsertWithoutDescendantClosuresInputObjectSchema).optional(),
  connect: z.lazy(() => OrganizationWhereUniqueInputObjectSchema).optional(),
  update: z.union([z.lazy(() => OrganizationUpdateToOneWithWhereWithoutDescendantClosuresInputObjectSchema), z.lazy(() => OrganizationUpdateWithoutDescendantClosuresInputObjectSchema), z.lazy(() => OrganizationUncheckedUpdateWithoutDescendantClosuresInputObjectSchema)]).optional()
}).strict();
export const OrganizationUpdateOneRequiredWithoutDescendantClosuresNestedInputObjectSchema: z.ZodType<Prisma.OrganizationUpdateOneRequiredWithoutDescendantClosuresNestedInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationUpdateOneRequiredWithoutDescendantClosuresNestedInput>;
export const OrganizationUpdateOneRequiredWithoutDescendantClosuresNestedInputObjectZodSchema = makeSchema();
