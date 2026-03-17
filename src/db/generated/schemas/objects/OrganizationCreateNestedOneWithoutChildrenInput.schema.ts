import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { OrganizationCreateWithoutChildrenInputObjectSchema as OrganizationCreateWithoutChildrenInputObjectSchema } from './OrganizationCreateWithoutChildrenInput.schema';
import { OrganizationUncheckedCreateWithoutChildrenInputObjectSchema as OrganizationUncheckedCreateWithoutChildrenInputObjectSchema } from './OrganizationUncheckedCreateWithoutChildrenInput.schema';
import { OrganizationCreateOrConnectWithoutChildrenInputObjectSchema as OrganizationCreateOrConnectWithoutChildrenInputObjectSchema } from './OrganizationCreateOrConnectWithoutChildrenInput.schema';
import { OrganizationWhereUniqueInputObjectSchema as OrganizationWhereUniqueInputObjectSchema } from './OrganizationWhereUniqueInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => OrganizationCreateWithoutChildrenInputObjectSchema), z.lazy(() => OrganizationUncheckedCreateWithoutChildrenInputObjectSchema)]).optional(),
  connectOrCreate: z.lazy(() => OrganizationCreateOrConnectWithoutChildrenInputObjectSchema).optional(),
  connect: z.lazy(() => OrganizationWhereUniqueInputObjectSchema).optional()
}).strict();
export const OrganizationCreateNestedOneWithoutChildrenInputObjectSchema: z.ZodType<Prisma.OrganizationCreateNestedOneWithoutChildrenInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationCreateNestedOneWithoutChildrenInput>;
export const OrganizationCreateNestedOneWithoutChildrenInputObjectZodSchema = makeSchema();
