# 06 — 端到端管理 Custom SSO Client 配置

**What to build:** 为 Custom SSO 建立独立、版本化且 Secret 安全的 Client 配置生命周期，并在 Admin API 与统一 Client 编辑页中完整管理它，同时保持 OIDC 配置和行为独立。

**Blocked by:** 02

**Status:** resolved

- [x] Client 持久化新增 `custom_sso_enabled`、nullable `custom_sso_config`、nullable `custom_sso_secret_hash`、`custom_sso_config_version` 四个独立字段，并以 staged constraint 表达未配置、Gateway、Independent 与 enabled 的基本一致性。
- [x] strict discriminated config 的共同字段只有 Redirect Patterns、Catalog version 与完整 Subject Claim Selection；Gateway 只增加 ORCAS enabled capability，Independent 只增加 callback/logout endpoint。
- [x] Custom SSO 配置、运行时读取与 Secret 校验不读取 OIDC config、OIDC Secret 或通用明文 `clientSecret`；Gateway 不保存 Secret Hash，Independent 必须具有强 Secret Hash。
- [x] configure、enable、disable、remove、rotate secret 五种 mutation 都在事务内读取最新状态、原子递增 config version，并在提交后失效协议 cache/artifact；不引入 expected-version 乐观锁。
- [x] enabled 状态只允许查看或 disable；配置修改、模式切换、remove 和 rotate 必须先 disable，保存配置不会隐式 enable。
- [x] disabled 状态可直接切换模式；Gateway 转 Independent 生成一次性新 Secret，Independent 转 Gateway 清除 Secret Hash，remove 回到明确的未配置状态。
- [x] enable 只做本地 schema、Redirect、Claims、模式字段、全局 Client 状态和 Secret 状态校验，不访问 callback、logout 或 Redirect URL。
- [x] Secret 明文只在创建 Independent、切换到 Independent 或 rotate 成功的响应中出现一次；持久化、Admin detail/list、日志、审计和 Runtime Secret Reader 均不泄漏明文或 Hash。
- [x] Admin API 提供 configure、enable、disable、remove、rotate-secret 独立操作；通用 Client create/update 不接受四个 managed fields，list 只返回 state/mode 摘要，detail 返回 strict config、state、mode、`hasCustomSsoSecret` 和 version。
- [x] Client 搜索只支持结构化 Custom SSO state/mode 过滤，不按 Claims、Redirect、callback 或其他 JSON 内容过滤，也不预建 JSONB GIN/表达式索引。
- [x] 五种 mutation 均生成独立且脱敏的 audit action；审计可记录 mode、Claims、URL、ORCAS、state 与 version，但在构造审计对象前排除 Secret 明文及 Hash。
- [x] Admin Client 列表只保留一个编辑入口并显示 OIDC/Custom SSO 只读状态摘要；创建基础 Client 后跳转统一编辑页，协议默认未配置。
- [x] 统一编辑页以 `basic|custom-sso|oidc` section 管理独立 form state、加载/错误/404、mutation 刷新与 dirty guard；未知 section 回到 basic，删除后返回列表。
- [x] Custom SSO Settings 使用 Catalog metadata 驱动不可自由输入的 Claims selector 和固定占位符 wire preview；一次性 Secret 弹窗必须显式确认后关闭并立即销毁内存状态。
- [x] OIDC Settings 只迁移到统一编辑页容器，现有配置、启停与 Secret 轮换语义不变，也不套用 Custom SSO 的 enabled-readonly 规则。
- [x] 全局 Client disable/delete 继续撤销相关协议 artifact；disable 保留各协议配置和 enabled 意图，delete 维持软删除；Maintenance 不提供 `userExcluding` 或按用户绕过。
- [x] Admin service/transport/OpenAPI tests 覆盖完整状态矩阵、version、Hash/一次性 Secret、after-commit invalidation、DTO 脱敏和筛选；Playwright 覆盖统一入口、section、dirty guard、Claims preview、Secret 销毁及 OIDC UI 回归。
