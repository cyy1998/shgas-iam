# 08 — 升级 CSV 导入与 MySQL client

**What to build:** 让现有 CSV 导入和 MySQL 数据访问在新的 parser/client 上保持相同输入、拒绝规则与持久化边界，使数据导入升级可以独立验证和回滚。

**Blocked by:** 05 — 升级 API transport 与文档依赖.

**Status:** resolved

## Implementation discovery

当前源码、脚本和测试中不存在 CSV parser、mysql2 或 xlsx consumer；唯一的 `mysql2/promise` consumer `apps/api/scripts/migrate-mysql-to-postgres.ts` 已在提交 `38679932` 作为过时脚本删除。为避免凭空新增导入 contract，本票据删除四个未使用的直接依赖与过时文档声明，而不是保留已无运行职责的包或编造库级测试。

- [x] 事实驱动替代：`csv-parse`、`csv-parser`、mysql2 与 xlsx 已从直接依赖和实际安装图删除，不再保留无 consumer 的旧版本。
- [x] 当前不存在 CSV 导入行为或 contract；未新增虚构流程，API 完整测试证明依赖删除未影响现有业务结果。
- [x] 没有 parser major 适配或导入流程重写，业务校验保持不变。
- [x] 当前不存在 MySQL connection/query/execute 代码；历史上的唯一迁移入口已在 `38679932` 删除。
- [x] 数据库 schema、migration、导入 contract 和持久化数据均未改变。
- [x] 受影响 workspace 的测试、lint、typecheck 和 build 通过；frozen-lockfile 安装和 diff check 通过。

## Resolution evidence

- Final squash commit: `fbfe426807fc576ade42e554b734b1b47c572cf8`.
- 实现提交：`411bb451b8b265ccf5a58d7a39c43971057332b5`。
- 全仓源码/脚本/测试扫描无 CSV parser、mysql2 或 xlsx consumer；历史核对确认唯一 MySQL 迁移脚本已删除。
- `pnpm why` 与锁文件审计确认四个包没有实际解析路径；Drizzle 锁元数据中只保留 mysql2 可选 peer 声明，不安装 mysql2。
- 锁文件清理 189 行，并同步删除 README 中已失效的 CSV/XLSX 能力声明。
- API 204 条测试、API lint/typecheck、全仓 test/build、`pnpm install --frozen-lockfile` 与 `git diff --check` 全部通过。
- Standards 初审发现的 xlsx 残留已修复，最终 Standards 与 Spec 复审均为 zero findings。
