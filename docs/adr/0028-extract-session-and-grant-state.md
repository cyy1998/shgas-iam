---
status: accepted
---

# 将 Session Kernel 与 Custom SSO 应用能力分别迁入独立包

> 文中的 Custom SSO 预占/租约与 Grant 状态机描述记录原决策背景，已由
> [ADR-0031](0031-consume-custom-sso-grants-before-issuance.md) 的签发前一次消费取代；#158/#159 已迁移两模式，
> 前置许可、用途/版本、协议分工和对象生命周期保护保持。定向维护已由 #160 交付，环境未切换。

Session Kernel 已由 API、Admin API 与 OIDC Provider 共同消费；Custom SSO Grant 虽与 Kernel Protocol Artifact 的身份、期限和清理关联，两者仍属于协议中性生命周期与具体协议应用能力两个层次。本次讨论选择分别建立 `@iam/session-kernel`（`packages/session-kernel`）与 `@iam/custom-sso`（`packages/custom-sso`）两个 workspace package：前者拥有会话生命周期及其专属配置、日志事件、维护清单和测试支持；后者拥有授权、兑换、会话建立和补偿等完整协议应用能力，包含 Grant redemption，API 主要负责 HTTP 适配。采用两个包使具体协议消费 Kernel 的扩展接口，Kernel 不反向依赖 Custom SSO。

迁移同时收紧公开出口，按实际消费者保留业务操作及必要的配置、维护和测试接口，隐藏无需对外承诺的存储实现。现有业务操作接口、Redis key 与存储格式、期限、撤销及兑换语义保持不变，不在本次迁移中重新设计 Kernel facade。完整 Custom SSO 能力的迁出涉及现有 app 编排的归属调整，不代表改变登录或兑换行为。

统一身份认证与 Custom SSO 协议分别归属。密码、手机、OA、微信身份验证继续留在 API，通过窄接口使用 Session Kernel 建立 Principal Session；不因当前共用 session facade 或目录名称而迁入 Custom SSO 包。Custom SSO 包消费已有 Principal Session，拥有针对 Client 的授权、兑换、访问和退出，范围包含 `/public/user-info` 与 Gateway `/auth/authz` 中的协议能力。Custom SSO 专属登录续接检查进入新包；门户页面决策、Cookie、HTTP 映射与请求对象桥接仍由 API 拥有。

Custom SSO 专属 wire schema、mapper 与 placeholder preview 随协议能力迁入新包，通过支持浏览器的独立出口供前端消费。协议中性的主体裁剪算法、Catalog 与事实读取接口继续由 `client-subject-projection` 拥有，新包只消费其公开 Interface，不复制投影规则。这调整了当前共享契约文档中由 `client-subject-projection/custom-sso` 拥有 wire 的位置约定；外部 JSON 形状、裁剪、严格解析与错误语义保持不变，实施时同步更新对应 ownership 文档与守卫。

Custom SSO 包拥有外部集成的调用时机、协议审计语义和失败补偿，通过自身声明的窄接口使用外部能力；API 提供 ORCAS HTTP client、数据库 repository、审计写入、logger 等具体实现，并在 composition 中连接依赖。具体网络请求、数据库访问以及连接的创建和关闭留在外侧，新包不反向导入 API。

公开入口按消费能力划分，不提供内部目录的通配出口：

| 入口 | 职责 |
|---|---|
| `@iam/session-kernel` | Kernel factory、配置、生命周期操作与必要的接口类型。 |
| `@iam/session-kernel/maintenance` | Kernel 拥有的状态维护清单。 |
| `@iam/session-kernel/testing` | Kernel 测试支持。 |
| `@iam/custom-sso` | 完整授权、续接检查、兑换、callback、访问和退出操作及必要的接口类型。 |
| `@iam/custom-sso/wire` | 支持浏览器独立加载的 schema、mapper、类型和 preview。 |
| `@iam/custom-sso/cleanup` | 可独立构造并注入 Kernel 的 Custom SSO cleanup adapter。 |
| `@iam/custom-sso/maintenance` | Custom SSO 拥有的状态维护清单。 |
| `@iam/custom-sso/testing` | Custom SSO 测试所需的构造、种子与检查能力。 |

Grant store、lease、预占和消费步骤属于 Custom SSO 内部实现，不成为生产公开 Interface，也不恢复“解析 Grant 后再签发 Credential”的两阶段操作。OIDC 通过独立 cleanup 入口取得所需清理能力，无需构造完整 Custom SSO 流程；composition 先创建 cleanup adapter，再将其注入 Kernel，最后将 Kernel 注入完整 Custom SSO 模块。`wire`、`cleanup` 和 `maintenance` 均直接进入其职责模块，不通过服务端根聚合入口反向加载完整流程。存储实现、Lua 和 key builder 按实际消费需要收紧，测试通过独立 testing 入口或所属包内测试访问所需实现，不借测试扩大生产出口。

迁移一次性更新全部仓内消费者并删除旧出口，不保留 compatibility re-export。包括原 `api-core/session/kernel` 及其子入口、`api-core/authorization-grant` 及其测试入口、`client-subject-projection/custom-sso`，以及归属已经迁出的 app 内部模块；代码引用的切换不改变现有 Redis key、存储格式或对外协议。对应文档、测试收集、workspace 依赖与构建入口同步切换到新 owner。

实施验证按现有测试编排归属选择：两个新包及受影响消费者的 lint/typecheck，迁移后的 Component 与真实 Redis 契约，API/OIDC 的协议适配和装配验证，以及 Admin/SSO 前端构建与相关 wire/preview 测试。包边界变化同时核对 Architecture Guard、Collection Guard、Docker workspace closure 和文档索引；跨包协作测试按验证 owner 放置，避免测试辅助形成 workspace 依赖环。具体命令和结果由实施记录保存，本文不表示上述验证已执行。

维护者已确认以上整体方案，实施范围和验收要求由 [Spec #122](https://github.com/cyy1998/shgas-iam/issues/122) 保存。本文记录已接受的目标架构；统一认证与 API 内完整 Custom SSO 已分别由 #123、#124 收敛；#125 已将 Kernel、全部消费者与所属测试迁至独立包；#126 已将 wire 与前后端消费者迁至独立 `/wire`，Custom SSO 完整应用与 Grant 已由 #127 迁包，独立 cleanup/maintenance/testing 及全部消费者已切换；50 条故事核对见[能力提取验收](../features/sso/authentication-state-extraction.md)；代码交付不代表已执行环境操作。
