# 01 — 建立 Exact-project Infra 与 Migration Lifecycle

**What to build:** 建立 root-owned E2E workspace 的第一条安全纵切：preflight、资源创建前 descriptor、唯一 Compose
project、动态 Gateway host port、PostgreSQL/Redis/etcd/APISIX health、空 volumes 上真实 migrations，以及 normal/failure
exact-project cleanup。暂不启动 repo app runtimes，也不发布 root `test:e2e`。

**Blocked by:** Feature [test-collection-migration](../../archived/test-collection-migration/spec.md) 完成

**Status:** resolved

**Repository invariant:** Workspace-local command 对其声明的 infra slice 完整且可清理；repo runtimes、journeys 与公开 root
command 尚不存在。

**Focused verification:**

- 从空 project 运行 workspace-local lifecycle 到 migrated infra healthy，再执行 cleanup。
- 运行 descriptor-before-resource、phase/order、migration failure、exact-project cleanup contract tests 与 workspace
  lint/typecheck；核对 `git diff --check`。

- [x] 空 volumes 可重复启动四个基础设施服务并执行真实 Drizzle migrations，不依赖开发者既有 volume。
- [x] Descriptor 记录 exact project、动态 port、origin、labels 与 artifact dir，不含 password/token/secret。
- [x] 正常、migration failure 与 cleanup retry 只对 exact project 执行幂等
  `down -v --remove-orphans`，不扫描未知资源。
