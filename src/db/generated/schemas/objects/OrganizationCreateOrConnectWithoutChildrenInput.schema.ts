import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { OrganizationWhereUniqueInputObjectSchema as OrganizationWhereUniqueInputObjectSchema } from './OrganizationWhereUniqueInput.schema';
import { OrganizationCreateWithoutChildrenInputObjectSchema as OrganizationCreateWithoutChildrenInputObjectSchema } from './OrganizationCreateWithoutChildrenInput.schema';
import { OrganizationUncheckedCreateWithoutChildrenInputObjectSchema as OrganizationUncheckedCreateWithoutChildrenInputObjectSchema } from './OrganizationUncheckedCreateWithoutChildrenInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => OrganizationWhereUniqueInputObjectSchema),
  create: z.union([z.lazy(() => OrganizationCreateWithoutChildrenInputObjectSchema), z.lazy(() => OrganizationUncheckedCreateWithoutChildrenInputObjectSchema)])
}).strict();
export const OrganizationCreateOrConnectWithoutChildrenInputObjectSchema: z.ZodType<Prisma.OrganizationCreateOrConnectWithoutChildrenInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationCreateOrConnectWithoutChildrenInput>;
export const OrganizationCreateOrConnectWithoutChildrenInputObjectZodSchema = makeSchema();
