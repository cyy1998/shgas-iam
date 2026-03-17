import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { OrganizationCreateWithoutPosOrgCompositionInputObjectSchema as OrganizationCreateWithoutPosOrgCompositionInputObjectSchema } from './OrganizationCreateWithoutPosOrgCompositionInput.schema';
import { OrganizationUncheckedCreateWithoutPosOrgCompositionInputObjectSchema as OrganizationUncheckedCreateWithoutPosOrgCompositionInputObjectSchema } from './OrganizationUncheckedCreateWithoutPosOrgCompositionInput.schema';
import { OrganizationCreateOrConnectWithoutPosOrgCompositionInputObjectSchema as OrganizationCreateOrConnectWithoutPosOrgCompositionInputObjectSchema } from './OrganizationCreateOrConnectWithoutPosOrgCompositionInput.schema';
import { OrganizationUpsertWithoutPosOrgCompositionInputObjectSchema as OrganizationUpsertWithoutPosOrgCompositionInputObjectSchema } from './OrganizationUpsertWithoutPosOrgCompositionInput.schema';
import { OrganizationWhereUniqueInputObjectSchema as OrganizationWhereUniqueInputObjectSchema } from './OrganizationWhereUniqueInput.schema';
import { OrganizationUpdateToOneWithWhereWithoutPosOrgCompositionInputObjectSchema as OrganizationUpdateToOneWithWhereWithoutPosOrgCompositionInputObjectSchema } from './OrganizationUpdateToOneWithWhereWithoutPosOrgCompositionInput.schema';
import { OrganizationUpdateWithoutPosOrgCompositionInputObjectSchema as OrganizationUpdateWithoutPosOrgCompositionInputObjectSchema } from './OrganizationUpdateWithoutPosOrgCompositionInput.schema';
import { OrganizationUncheckedUpdateWithoutPosOrgCompositionInputObjectSchema as OrganizationUncheckedUpdateWithoutPosOrgCompositionInputObjectSchema } from './OrganizationUncheckedUpdateWithoutPosOrgCompositionInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => OrganizationCreateWithoutPosOrgCompositionInputObjectSchema), z.lazy(() => OrganizationUncheckedCreateWithoutPosOrgCompositionInputObjectSchema)]).optional(),
  connectOrCreate: z.lazy(() => OrganizationCreateOrConnectWithoutPosOrgCompositionInputObjectSchema).optional(),
  upsert: z.lazy(() => OrganizationUpsertWithoutPosOrgCompositionInputObjectSchema).optional(),
  connect: z.lazy(() => OrganizationWhereUniqueInputObjectSchema).optional(),
  update: z.union([z.lazy(() => OrganizationUpdateToOneWithWhereWithoutPosOrgCompositionInputObjectSchema), z.lazy(() => OrganizationUpdateWithoutPosOrgCompositionInputObjectSchema), z.lazy(() => OrganizationUncheckedUpdateWithoutPosOrgCompositionInputObjectSchema)]).optional()
}).strict();
export const OrganizationUpdateOneRequiredWithoutPosOrgCompositionNestedInputObjectSchema: z.ZodType<Prisma.OrganizationUpdateOneRequiredWithoutPosOrgCompositionNestedInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationUpdateOneRequiredWithoutPosOrgCompositionNestedInput>;
export const OrganizationUpdateOneRequiredWithoutPosOrgCompositionNestedInputObjectZodSchema = makeSchema();
