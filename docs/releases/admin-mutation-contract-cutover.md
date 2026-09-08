# Admin 写入契约协调切换清单

本清单服务于 [Spec #95](https://github.com/cyy1998/shgas-iam/issues/95) 的固定代码候选发布准备。
[最终契约与逐项核对](../features/admin/admin-mutation-contract.md)记录仓库范围；验收通过仅表示候选可交付，
不表示下列环境核验、部署或放流已执行。本变更不要求生产数据迁移，不提供混合新旧结果的兼容期。

## 调用方核验与责任

发布负责人须在实际环境中指定下表各 owner 的具体人员并保留结果。仓库无法确认外部调用方、缓存中的旧页面或部署实例状态；
尚无证据的项目保持未完成，不能根据 Admin 使用 tRPC 推断 REST 无人调用。

| Owner | 发布前动作 | 必须保留的证据 |
|---|---|---|
| 后端维护者 | 固定 API、Admin API、共享 packages 与前端的同一候选；核对全部 REST/tRPC/OpenAPI 的 changed/result 与错误码；Internal 委托保持独立协议。 | candidate SHA、构建版本、#110/父规格最终 gate 结果。 |
| Admin 前端维护者 | 构建匹配候选；核验资源跳转、Secret 一次性交付、no-op、已提交失败刷新与持久提示；确认静态资源缓存更新与旧页面重新加载方案。 | 构建产物标识、真实页面 smoke、缓存/旧页面处理记录。 |
| Gateway/运维维护者 | 对照实际 Gateway route 与后端直连入口盘点消费者；查询有保留期说明的访问日志、服务账号及接入台账，覆盖 `/admin/*` 和 `/rpc/*`，核对 legacy `POST /admin/clients/create`、`POST /admin/clients/update`。 | 所查环境、时间范围、路由/账号/调用方清单；无观测流量只说明该窗口，不能证明永远无人调用。 |
| 外部 REST/legacy 调用方维护者 | 逐个确认旧裸 DTO/boolean/数量的读取点、自动重试策略及生成客户端；改为读取 envelope.data.changed/result，保留必要资源/数量/Secret；处理 400/404/409 和已提交错误。 | 每个消费者版本、负责人确认及接口验收；未知 owner 必须由发布负责人继续追踪，完成前不切换受影响入口。 |
| 运行恢复维护者 | 确认 Client Runtime Snapshot、Subject Access 和登录状态审计故障的既有恢复入口及值班责任；演练恢复后由人主动轮换新 Secret 并协调接入方更新。 | 适用 owner runbook 与环境演练记录；不记录明文 Secret。 |

`POST /admin/users/generate-password` 仅生成值，没有持久业务 mutation；查询、搜索、授权 capability 与封闭 Type Catalog
保持各自协议，不把所有 HTTP POST 都机械改成 mutation 结果。Legacy 两条路由继续挂载，采用最终结果，未新增双契约或删除授权外的路由。

## 协调执行顺序

1. 发布负责人固定候选并完成父规格最终 `pnpm verify`、所需真实 PostgreSQL/Redis/composition、协议/UI 与
   `pnpm test:e2e` 证据。实际命令、退出状态、精确资源与失败恢复产物保留在议题；测试收集或历史候选通过不能替代本候选。
2. 完成上表所有消费者核验，安排维护窗口或等价的受影响写入口暂停方案；停止旧 Admin 页面/自动化发起写请求，等待在途旧请求结束。
   具体停流/旧实例 drain 由实际部署 owner 执行和记录，本清单不假定线上拓扑。
3. 在受影响入口未恢复期间协调部署匹配的后端、Admin 静态资源和全部已登记外部消费者，确认无旧/新后端随机分流或旧页面继续写入。
   本变更不修改业务数据 schema，不运行臆造的数据迁移或 Runtime namespace 清空。
4. 使用有授权的测试身份从实际 Gateway 路径 smoke：Full Admin 创建并读取 `result`，同值资料 no-op，HR 范围内生命周期与范围外拒绝，
   Client 同配置 no-op 后已有协议访问仍有效；核对实际 legacy/REST 与 tRPC 输出、OpenAPI 和页面一致。凭据 smoke 使用专用对象并按一次性交付规程处理。
5. 确认 readiness、错误率、审计/dirty 与适用运行恢复证据后，由发布负责人记录放流时间和各 owner 结论再恢复入口。

## 已提交失败与回退

- `ADMIN_MUTATION_COMMITTED`：先读取实际业务事实，按失败能力的 owner 修复。Client 传播按
  [Snapshot 恢复手册](client-runtime-snapshot-restore.md)执行 targeted repair 与独立 verify；普通详情可读不能替代 repair 成功。
- `ADMIN_LOGIN_STATE_AUDIT_FAILED_AFTER_EFFECT`：Redis 作用已经发生，按[会话页面契约](../features/admin/session-management.md)
  保留审计待修复提示，不能自动再次撤销或把作用记成回滚。
- Secret 未交付：显示“轮换已生效，新 Secret 出现错误”，先修复再由管理员主动轮换并更新接入方；旧 Secret 不因前端回退恢复，
  不保存明文等待补领，不自动重放原请求。
- 结果未知：确认当前事实及原 owner 的保守恢复，不能凭普通网络/内部错误断言已回滚或已提交。
- 需回退候选时先再次停止受影响写入，协调回退后端、页面与所有消费者。代码回退不撤销已经提交的业务、审计、协议版本、凭据轮换或 Session 撤销；
  对这些事实按当前状态制定恢复动作，不执行自动 SQL 补偿或恢复旧 Secret。无法保证调用方和后端匹配时保持入口关闭。

跨表父对象、Primary、请求时 HR scope 的既有乐观边界没有改变。此次协调切换不涉及全局锁、自动事务重试、Profile/Redis 原子机制替换，
也不授权 merge、push 或部署。
