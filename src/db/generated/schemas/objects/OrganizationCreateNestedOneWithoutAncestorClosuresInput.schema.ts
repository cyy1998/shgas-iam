import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { OrganizationCreateWithoutAncestorClosuresInputObjectSchema as OrganizationCreateWithoutAncestorClosuresInputObjectSchema } from './OrganizationCreateWithoutAncestorClosuresInput.schema';
import { OrganizationUncheckedCreateWithoutAncestorClosuresInputObjectSchema as OrganizationUncheckedCreateWithoutAncestorClosuresInputObjectSchema } from './OrganizationUncheckedCreateWithoutAncestorClosuresInput.schema';
import { OrganizationCreateOrConnectWithoutAncestorClosuresInputObjectSchema as OrganizationCreateOrConnectWithoutAncestorClosuresInputObjectSchema } from './OrganizationCreateOrConnectWithoutAncestorClosuresInput.schema';
import { OrganizationWhereUniqueInputObjectSchema as OrganizationWhereUniqueInputObjectSchema } from './OrganizationWhereUniqueInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => OrganizationCreateWithoutAncestorClosuresInputObjectSchema), z.lazy(() => OrganizationUncheckedCreateWithoutAncestorClosuresInputObjectSchema)]).optional(),
  connectOrCreate: z.lazy(() => OrganizationCreateOrConnectWithoutAncestorClosuresInputObjectSchema).optional(),
  connect: z.lazy(() => OrganizationWhereUniqueInputObjectSchema).optional()
}).strict();
export const OrganizationCreateNestedOneWithoutAncestorClosuresInputObjectSchema: z.ZodType<Prisma.OrganizationCreateNestedOneWithoutAncestorClosuresInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationCreateNestedOneWithoutAncestorClosuresInput>;
export const OrganizationCreateNestedOneWithoutAncestorClosuresInputObjectZodSchema = makeSchema();
