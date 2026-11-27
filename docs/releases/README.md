# 运维操作入口

部署或维护 IAM 时按下表选择手册。操作前按[通用约定](#通用约定)确认目标环境、版本和资源。
手册状态与复核日期见[索引条目](../index.md#runbook-operations)。

| 我要做什么                                                                 | 操作手册                                    |
| -------------------------------------------------------------------------- | ------------------------------------------- |
| 首次部署、更新应用、执行数据库迁移或回退版本                               | [部署与发布](deployment.md)                 |
| 发布网关配置、检查路由或处理发布失败                                       | [网关管理](apisix-gateway-release.md)       |
| 更新登录配置、轮换 OIDC 密钥、清理会话或修复 Client Snapshot               | [登录与会话](authentication-and-session.md) |
| 修复积压、重建 User Document 或 Organization Document、恢复 Subject Access | [数据维护](data-maintenance.md)             |
| 启停日志栈、查询错误、关联请求或处理日志采集故障                           | [日志与排障](observability-system-logs.md)  |

## 通用约定

- **命令与环境** 命令从仓库根目录执行；确认目标环境、版本和资源。占位值替换为实际值，配置及秘密通过受控环境提供。
- **验证与恢复** 按操作的完成标准检查结果。失败或结果未知时停止后续步骤，按该操作的恢复路径处理，不自动扩大范围或重放写入。
- 需要停流时，关闭受影响入口及直连、自动重试和相关任务，确认实际停止并排空在途工作；具体范围由各操作列出。
- 备好必要的备份、恢复配置与密钥兼容期信息；系统日志与业务审计保持默认行为。
- **备份与安全** 不把凭据、Token、Cookie、私钥或敏感业务原文写入命令输出、仓库和日志。

## 一次性迁移与旧版本

旧公共后端及业务网关直连配置按[三个公共后端的协调切换](deployment.md#切换三个公共后端)升级。
任职时间戳升级为自然日使用[按日任职有效期的协调发布](deployment.md#启用按日任职有效期)。
已使用统一 Document 的环境按[目录自定义属性和 Wire v5 的协调发布](deployment.md#启用目录自定义属性和-custom-sso-wire-v5)升级。
旧 Profile/Organization Search → Document 的升级使用[统一 Document 硬切换](data-maintenance.md#统一-document-硬切换)。
更早的迁移指引保存在对应固定版本中。尚未完成迁移的旧布局环境须先按来源环境执行对应独立流程，再使用当前手册的日常维护命令。

| 迁移任务                         | 固定版本指引                                                                                                                                                                                                                                                                                                                                            |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ORCAS 退役                       | [来源判断与一次切换](https://github.com/cyy1998/shgas-iam/blob/5feeec63992a89c4f407b5c424b6177184ba6098/docs/releases/unified-session-maintenance.md#orcas-退役的一次切换)                                                                                                                                                                              |
| 权限点退役与 Profile v4 配对升级 | [停流、迁移、重建及接入应用切换](https://github.com/cyy1998/shgas-iam/blob/5feeec63992a89c4f407b5c424b6177184ba6098/docs/releases/user-profile-maintenance.md#权限点退役的协调切换)、[固定候选的验收复现](https://github.com/cyy1998/shgas-iam/blob/cbfd4aa60fd6000662026b68576f1aa1409b6ce4/docs/development/commands.md#权限点退役的一次性跨制品验收) |
| 旧权限委托切换为 Client 委托     | [来源限制、正式 migration 与恢复](https://github.com/cyy1998/shgas-iam/blob/5feeec63992a89c4f407b5c424b6177184ba6098/docs/features/delegation/client-delegation.md#旧数据与发布切换)                                                                                                                                                                    |
| 更早的布局、协议或数据库升级     | [历史发布手册](https://github.com/cyy1998/shgas-iam/tree/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/releases)、[历史审计规范化](#历史审计规范化)                                                                                                                                                                                                     |

历史指引中的额外留证要求可忽略；实际迁移步骤、来源限制、必要备份和目标数据核验仍须执行。

旧接入与管理契约的切换说明见[固定功能文档快照](https://github.com/cyy1998/shgas-iam/tree/48c2d6cc20e8a3675cbd1269eed2d5612141791d/docs/features)。

### 历史审计规范化

当前 `iam-ops audit-action` 适用于旧审计 action 和旧备份，入口见 [Ops CLI](../../apps/ops/README.md#审计规范化)。
冲突、事务、未知提交及独立核验遵循[固定版本审计规范化流程](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/releases/audit-action-canonicalization.md)。

b648、managed-callback 配置升级和 `online-auth:state --layout source` 使用匹配来源的[固定历史工具与流程](https://github.com/cyy1998/shgas-iam/tree/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/releases)。
当前会话维护使用[统一布局](authentication-and-session.md)。
