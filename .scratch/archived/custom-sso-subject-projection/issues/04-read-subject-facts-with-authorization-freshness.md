# 04 — 读取 Subject Facts 并保证授权新鲜度

**What to build:** 提供 Subject Facts 的低成本 read-through，并对 `iam:authorization` 建立 PostgreSQL 权威的新鲜度门禁，使普通档案读取可缓存、授权信息则绝不脏读。

**Blocked by:** 02, 03

**Status:** resolved

- [x] 只选择 Subject Identifier 时完全跳过 Subject Facts 和 Dirty 读取；该路径由可计数 adapter 测试证明为零 Facts read。
- [x] schema 有效的 Redis record 可直接读取；缓存缺失、损坏或 schema 未知时，以 single-flight 最多读取一行 `user_profile` 并按版本 compare-and-set 回填 Redis。
- [x] PostgreSQL Reader 的 select list 不含 `detail` 或 `search_doc`，cache miss 不联查 user、employment、organization、position、role 或 privilege 源表。
- [x] Profile 行缺失、版本非法或 Subject Facts JSON 无法解析时返回稳定的 Subject Projection Not Ready，不回退 Legacy User Detail、源表 join 或默认宽权限。
- [x] 普通 Profile Claim 可使用最后一次成功发布的 Subject Facts，不因存在更新中的 Dirty row 自动失败。
- [x] Selection 含 `iam:authorization` 时，每次投影都查询 PostgreSQL 权威 Dirty row；只有状态为 `processed` 且 Dirty Version 与所用 Facts source version 完全一致才放行。
- [x] `pending`、`processing`、`failed`、Dirty row 缺失或版本不匹配全部 fail closed，不按 Dirty Reason 或调用方开关绕过。
- [x] Redis Facts 落后但 PostgreSQL 已发布权威当前版本时只从 `user_profile` 重载一次；事实仍未发布则整份投影失败，绝不返回部分 Profile 或旧 Authorization。
- [x] Projection 公开接口不提供 `allowStaleAuthorization` 或同义逃生开关；新鲜度只由所选 claim 的固定语义决定。
- [x] Custom SSO 将未就绪映射为 HTTP 503、稳定 code `SUBJECT_PROJECTION_NOT_READY` 和可配置短 `Retry-After`，错误、日志与指标不暴露 Dirty 内部状态或 Subject Facts 全文。
- [x] contract tests 覆盖缓存命中、损坏、single-flight 并发、一次重载、Profile stale allowance、Authorization fail closed；性能断言为普通 claim miss 最多一行查询、严格授权 cache hit 只增加一次小型 Dirty 查询。
