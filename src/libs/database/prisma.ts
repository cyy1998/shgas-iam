import { PrismaClient } from "../../../generated/prisma";


const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma = globalForPrisma.prisma || new PrismaClient()

export type PrismaTransaction = Omit<typeof prisma, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma