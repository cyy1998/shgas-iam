import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { OrganizationCreateWithoutPosOrgCompositionInputObjectSchema as OrganizationCreateWithoutPosOrgCompositionInputObjectSchema } from './OrganizationCreateWithoutPosOrgCompositionInput.schema';
import { OrganizationUncheckedCreateWithoutPosOrgCompositionInputObjectSchema as OrganizationUncheckedCreateWithoutPosOrgCompositionInputObjectSchema } from './OrganizationUncheckedCreateWithoutPosOrgCompositionInput.schema';
import { OrganizationCreateOrConnectWithoutPosOrgCompositionInputObjectSchema as OrganizationCreateOrConnectWithoutPosOrgCompositionInputObjectSchema } from './OrganizationCreateOrConnectWithoutPosOrgCompositionInput.schema';
import { OrganizationWhereUniqueInputObjectSchema as OrganizationWhereUniqueInputObjectSchema } from './OrganizationWhereUniqueInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => OrganizationCreateWithoutPosOrgCompositionInputObjectSchema), z.lazy(() => OrganizationUncheckedCreateWithoutPosOrgCompositionInputObjectSchema)]).optional(),
  connectOrCreate: z.lazy(() => OrganizationCreateOrConnectWithoutPosOrgCompositionInputObjectSchema).optional(),
  connect: z.lazy(() => OrganizationWhereUniqueInputObjectSchema).optional()
}).strict();
export const OrganizationCreateNestedOneWithoutPosOrgCompositionInputObjectSchema: z.ZodType<Prisma.OrganizationCreateNestedOneWithoutPosOrgCompositionInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationCreateNestedOneWithoutPosOrgCompositionInput>;
export const OrganizationCreateNestedOneWithoutPosOrgCompositionInputObjectZodSchema = makeSchema();
