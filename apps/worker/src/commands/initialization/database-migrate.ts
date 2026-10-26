import { parseEmploymentCommandEnv } from "@worker/env";

export async function main() {
  parseEmploymentCommandEnv(process.env);
  const { migrateDatabase } = await import("@iam/db/migrate");
  const { closeDb } = await import("@iam/db");
  try {
    await migrateDatabase();
    console.log(JSON.stringify({ migration: "complete" }));
  } catch {
    console.error("IAM migration 失败；保持目标暂停并核实际数据库和迁移输入，不输出连接或驱动参数");
    process.exitCode = 1;
  } finally {
    await closeDb({ timeoutSeconds: 1 });
  }
}

if (import.meta.main) await main();
