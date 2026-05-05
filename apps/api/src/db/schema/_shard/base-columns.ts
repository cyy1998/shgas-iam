import { timestamp } from "drizzle-orm/pg-core";

export function timestampColumns() {
  return {
    createTime: timestamp().notNull().defaultNow(),
    updateTime: timestamp().notNull().defaultNow().$onUpdate(() => new Date()),
  };
}
