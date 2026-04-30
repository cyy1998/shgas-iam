import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/db/generated/prisma/client";
import { createSingleton } from "@/lib/core/singleton";

function createPrismaClient() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL as string,
  });
  return new PrismaClient({ adapter });
}

export const prisma = createSingleton<PrismaClient>(
  "prisma",
  createPrismaClient,
);

export type PrismaTransaction = Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;
