import { boolean, serial, timestamp } from "drizzle-orm/pg-core";

export const baseColumns = {
  id: serial().primaryKey(),
  createTime: timestamp().notNull().defaultNow(),
  updateTime: timestamp().notNull().defaultNow().$onUpdate(() => new Date()),
  isDelete: boolean().notNull().default(false),
};
