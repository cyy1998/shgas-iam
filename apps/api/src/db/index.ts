import { PrismaClient } from "@api/db/generated/prisma/client";
import { createSingleton } from "@api/lib/core/singleton";
import { PrismaPg } from "@prisma/adapter-pg";

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
