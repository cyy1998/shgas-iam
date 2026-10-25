# 共享契约与数据库

本文规定共享代码、公开出口、DTO 演进和持久化边界。具体模块机制见[后端架构](backend-architecture.md)。

## 共享代码选址

先找已有能力，再按实际消费者和运行环境选位置。文件名带 DTO、文件较多或未来可能复用，都不足以单独成立一个共享包。

| 位置                              | 职责                                                                  |
| --------------------------------- | --------------------------------------------------------------------- |
| `contracts`                       | 跨端或跨应用的稳定枚举、schema、派生类型和紧贴契约的协议 helper       |
| `domain` 纯规则                   | 只依赖显式输入、常量与纯 helper 的业务计算                            |
| `domain` DTO、mapper、审计 helper | 后端复用的输入输出和纯数据转换，可依赖数据库派生 schema，但不执行查询 |
| 专用能力包                        | 完整业务能力及其公开类型；已有 owner 的协议 schema 继续由该包持有     |
| `db`、`api-core`、`jobs`          | 持久化定义与查询基础能力、后端基础设施、队列基础能力                  |
| app 内部                          | 单 app 的类型、流程和页面模型，有真实共享需求后再评估提升             |

纯规则不依赖数据库、OpenAPI、网络、运行时实例或 composition，也不反向依赖 DTO 及其聚合出口。
`domain` 同时含规则与数据库派生 DTO，不能把整个包视为纯模块。

独立模块可以通过同一包的公开 subpath 分工。新建包需说明稳定职责、实际消费者或依赖隔离需求，以及要隐藏的实现；
合并包需评估依赖并集、测试和构建失效范围。处理方式相同，例如都做 resolution，不意味着属于同一业务模块。

## 公开接口与运行环境

- 跨包只消费 `package.json` 声明的公开出口，不访问相对源码或未公开深层路径。
- 浏览器运行时代码使用 `contracts` 或明确支持浏览器的专用出口，不 value-import `domain`、`db` 或服务端基础设施。
- Admin 的 tRPC 类型推断集中在 app-local service/client，通过后端公开入口 type-only 导入，不复制一套 DTO。
- 已有 runtime schema 时由它派生类型，解析和 mapper 共用 shape；协议入口只补元数据，不重写 wire。
- 协议 helper 仅实现编码、解码和续接等协议能力；平台适配通过窄接口传入，不绑定 app 实例或承载业务流程。

`contracts` 的 credential 加解密出口使用密码库、时间、随机数和 Web API，并非纯规则。
修改它或增加运行环境时须核对实际执行分支的平台能力；公开出口和 type-only 兼容均不证明浏览器可加载。
跨协议与中性能力的依赖方向见[认证与会话模块](backend-architecture.md#认证会话与访问控制)。

## DTO 字段与兼容演进

新增或修改跨边界 DTO，先用显式 `pick` 或 `z.object` 确定允许字段，再按需组合。
请求、普通响应和敏感记录分别定义；整表排除少数字段不足以阻止新增数据库字段外溢。
Schema 必须在实际解析或输出边界生效，只声明类型不证明字段已被裁剪。

字段的类型、必填、可空和未知字段策略变化都要检查消费者。新增字段也可能被旧 strict parser 拒绝；
是否 strict 由协议决定，不统一收紧。兼容发布需明确生产者和消费者可共存的组合、顺序，以及跨发布保留的缓存和消息。
不能共存时采用对应主题的协调切换，不为此建立通用双版本框架。

部分既有 Client、Role DTO 仍从整表派生。修改其形状或来源字段时收敛到显式字段集合，无关改动不触发批量迁移。
验证方式见[验证选择](../development/testing.md#验证选择)：类型兼容、浏览器可加载和运行时字段裁剪分别验证。

## Repository 与数据库

Repository 通过 factory 接收 root 或 transaction `DbClient`；事务由调用方的 UnitOfWork 统一拥有。
数据库事实、审计和 dirty 的原子关系，以及提交后作用，遵守[事务边界](backend-architecture.md#transactions-与-aftercommit)。

数据库约束保护存储完整性，应用 schema 保护输入输出，两者不能互相代替。特定读模型的版本、发布与核验规则
集中在[Profile](backend-architecture.md#user-profile-subject-facts-publication)和
[组织搜索](backend-architecture.md#organization-search-发布与核验)。

修改 PostgreSQL schema、索引、约束或 Drizzle 派生 schema 前使用
[db-schema skill](../../.codex/skills/db-schema/SKILL.md)；涉及 Relations v2 或 RQB v2 时另用
[drizzle-v1 skill](../../.codex/skills/drizzle-v1/SKILL.md)。目录与命名见
[数据库文件约定](../development/backend-implementation.md#数据库文件约定)，操作命令见[命令入口](../development/commands.md#workspace-入口)。
