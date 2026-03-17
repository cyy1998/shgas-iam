import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { OrganizationCreateWithoutChildrenInputObjectSchema as OrganizationCreateWithoutChildrenInputObjectSchema } from './OrganizationCreateWithoutChildrenInput.schema';
import { OrganizationUncheckedCreateWithoutChildrenInputObjectSchema as OrganizationUncheckedCreateWithoutChildrenInputObjectSchema } from './OrganizationUncheckedCreateWithoutChildrenInput.schema';
import { OrganizationCreateOrConnectWithoutChildrenInputObjectSchema as OrganizationCreateOrConnectWithoutChildrenInputObjectSchema } from './OrganizationCreateOrConnectWithoutChildrenInput.schema';
import { OrganizationUpsertWithoutChildrenInputObjectSchema as OrganizationUpsertWithoutChildrenInputObjectSchema } from './OrganizationUpsertWithoutChildrenInput.schema';
import { OrganizationWhereInputObjectSchema as OrganizationWhereInputObjectSchema } from './OrganizationWhereInput.schema';
import { OrganizationWhereUniqueInputObjectSchema as OrganizationWhereUniqueInputObjectSchema } from './OrganizationWhereUniqueInput.schema';
import { OrganizationUpdateToOneWithWhereWithoutChildrenInputObjectSchema as OrganizationUpdateToOneWithWhereWithoutChildrenInputObjectSchema } from './OrganizationUpdateToOneWithWhereWithoutChildrenInput.schema';
import { OrganizationUpdateWithoutChildrenInputObjectSchema as OrganizationUpdateWithoutChildrenInputObjectSchema } from './OrganizationUpdateWithoutChildrenInput.schema';
import { OrganizationUncheckedUpdateWithoutChildrenInputObjectSchema as OrganizationUncheckedUpdateWithoutChildrenInputObjectSchema } from './OrganizationUncheckedUpdateWithoutChildrenInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => OrganizationCreateWithoutChildrenInputObjectSchema), z.lazy(() => OrganizationUncheckedCreateWithoutChildrenInputObjectSchema)]).optional(),
  connectOrCreate: z.lazy(() => OrganizationCreateOrConnectWithoutChildrenInputObjectSchema).optional(),
  upsert: z.lazy(() => OrganizationUpsertWithoutChildrenInputObjectSchema).optional(),
  disconnect: z.union([z.boolean(), z.lazy(() => OrganizationWhereInputObjectSchema)]).optional(),
  delete: z.union([z.boolean(), z.lazy(() => OrganizationWhereInputObjectSchema)]).optional(),
  connect: z.lazy(() => OrganizationWhereUniqueInputObjectSchema).optional(),
  update: z.union([z.lazy(() => OrganizationUpdateToOneWithWhereWithoutChildrenInputObjectSchema), z.lazy(() => OrganizationUpdateWithoutChildrenInputObjectSchema), z.lazy(() => OrganizationUncheckedUpdateWithoutChildrenInputObjectSchema)]).optional()
}).strict();
export const OrganizationUpdateOneWithoutChildrenNestedInputObjectSchema: z.ZodType<Prisma.OrganizationUpdateOneWithoutChildrenNestedInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationUpdateOneWithoutChildrenNestedInput>;
export const OrganizationUpdateOneWithoutChildrenNestedInputObjectZodSchema = makeSchema();
