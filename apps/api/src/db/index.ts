import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@/db/generated/prisma/client";
import { createSingleton } from "@/lib/core/singleton";

function createPrismaClient() {
  const url = new URL(process.env.DATABASE_URL as string);
  const adapter = new PrismaMariaDb({
    host: url.hostname,
    port: Number.parseInt(url.port),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
    connectionLimit: 10,
  });
  return new PrismaClient({ adapter });
}

// const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

// const adapter = new PrismaMariaDb({
//   host: process.env.DATABASE_HOST,
//   port: Number.parseInt(process.env.DATABASE_PORT as string),
//   user: process.env.DATABASE_USER,
//   password: process.env.DATABASE_PASSWORD,
//   database: process.env.DATABASE_NAME,
//   connectionLimit: 10,
// });

export const prisma = createSingleton<PrismaClient>(
  "prisma",
  createPrismaClient,
);

// globalForPrisma.prisma || new PrismaClient({ adapter });

export type PrismaTransaction = Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

// if (process.env.NODE_ENV !== "production")
//   globalForPrisma.prisma = prisma;
