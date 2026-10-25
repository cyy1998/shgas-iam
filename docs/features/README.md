# 功能说明

这里介绍 IAM 的功能、使用条件、主要流程和业务规则。接口字段、协议处理顺序和内部实现另行查阅。

| 想了解什么                           | 功能说明                                                  |
| ------------------------------------ | --------------------------------------------------------- |
| 登录、找回密码、查看会话与下线       | [登录与会话](sso/login-and-session.md)                    |
| 应用如何使用统一登录                 | [应用单点登录](sso/single-sign-on.md)                     |
| 管理应用的协议、地址与凭据           | [应用接入配置](admin/client-sso-configuration.md)         |
| 应用能取得哪些用户资料，更新是否及时 | [用户信息共享](sso/subject-delivery.md)                   |
| 为应用业务指定代办人                 | [应用委托](delegation/client-delegation.md)               |
| 管理组织责任与 HR 范围               | [组织责任管理](organization-responsibility/management.md) |
| 按资料、任职和组织条件查找用户       | [用户搜索](search/user-profile-search.md)                 |
| 按属性和层级查找组织                 | [组织搜索](search/organization-search.md)                 |
| 校验、预览和发布网关配置             | [网关配置发布](gateway/gateway-configuration.md)          |
| 查询安全操作及其结果                 | [审计日志](audit/audit-logging.md)                        |

实际接入见[接入指南](../guides/README.md)，字段、错误码和接口定义沿指南查代码。
部署、维护和迁移见[运维入口](../releases/README.md)，实现机制见[架构文档](../index.md#工程架构)。
文档状态以[总索引](../index.md)为准。
