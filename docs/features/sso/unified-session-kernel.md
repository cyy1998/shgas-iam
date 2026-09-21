# 两类会话的 Kernel 能力

Kernel 只拥有 UserSession / ClientSession 的中性生命周期与可信观察；Code、Token 和续接由协议 owner 拥有。
账号许可见[Subject Access](subject-access-operation-contract.md)，管理页面与结果见[会话管理](../admin/session-management.md)。

## 最小模型与权威来源

| 对象 | 字段与约束 |
|---|---|
| UserSession | 独立 ID/bearer、subjectIdentifier、authTime、amr、opaque subjectContext、可选 origin、创建/到期时间及生命周期状态。主体、认证事实、代际和原始期限创建后固定。 |
| ClientSession | 独立 ID、userSessionId、clientId、继承的主体/context、最近 protocol、授权/到期时间及状态。原根、Client 和不可变 instance 不改绑。 |

UserSession 是 authTime/amr 的唯一认证权威，子记录的复制只服务中性归属检查。
这些是逻辑字段，不要求各边界复制完整存储 DTO；管理 identity 不作为 bearer 或在线许可。

## 公开入口与操作边界

从 `@iam/session-kernel` 导入 `createUnifiedSessionKernel`。工厂需要 Redis `eval`、根与 ClientSession
各自的秒数 TTL，以及消费方拥有的 `assertOperationActive`。API Core 现有 `requireSubjectAccessOperation` 可以直接满足
活跃性 port；Kernel 不导入 API Core，也不获取 Subject Access Permission。

```ts
const kernel = createUnifiedSessionKernel({
  redis,
  userSessionTtlSeconds,
  clientSessionTtlSeconds,
  assertOperationActive: requireSubjectAccessOperation,
});

await subjectAccessOperations.run(async (operation) => {
  const sessions = kernel.forOperation(operation);
  const resolved = await sessions.resolveUserSession(bearer);
  if (resolved.status !== "resolved")
    return resolved;
  const root = resolved.value.userSession;
  await operation.acquireForSession({
    principalSessionId: root.userSessionId,
    subjectIdentifier: root.subjectIdentifier,
    subjectContext: root.subjectContext,
  });
  // Client 与 protocol 必须来自本操作已接受的协议配置。
  return await sessions.openClientSession(resolved.value, { clientId, protocol });
});
```

示例说明公开能力的调用顺序；账号代际撤销由 API Core 的 `createUnifiedSubjectAccessSessionRevocation` 适配。
统一认证先取得自己的认证结果和 Subject Access Permission，再以 `createUserSession` 提交主体、opaque subjectContext、
amr 与可选 origin。authTime、createdAt、expiresAt 和响应剩余秒数由 Redis 时间确定，单位为毫秒；剩余秒数向下取整。
服务端 runtime 将独立的 `IAM_API_USER_SESSION_TTL_SECONDS` / `IAM_API_CLIENT_SESSION_TTL_SECONDS` 注入工厂；
AdminAPI 使用对应 `IAM_ADMIN_API_*` 变量，Compose 同步同类取值。默认各 86400 秒；Custom/OIDC Token 的签发 TTL 单独配置，
不能因两类会话默认值相同而共用一个配置。新根期限固定，应用关系的建立/延长仍受该根上限裁剪。

根 bearer 与内部 ID 分别经过 `resolveUserSession` 和 `resolveUserSessionById`。管理/协议内部使用 ID 时仍须执行自身认证、
归属与账号许可检查，ID 不是 Cookie 或 bearer。`resolveClientSessionForUse` 必须带原 userSessionId、clientSessionId、
clientId，原子观察原根与原实例，不读取当前关系槽替换目标，也不比较 Token 用途与 ClientSession 的可变 protocol。

观察登记在 factory 私有 WeakMap 中，同时绑定 operation identity。外部字段深冻结，私有依据另存副本；复制、JSON 往返、
管理记录、另一 factory/operation、结束后的 operation 均不能取得可信父。异步结果在发放观察前再次检查 operation 是否有效。
关闭操作不取消已经开始的 Redis 写入，迟到写入可能存在，但不会交付新的有效观察。

`useObservation` 在本操作中复用既有观察；`getIssuanceLifetime` 以新的 Redis 时间计算协议产物自身 TTL 与已观察两类会话
期限的最小值，返回固定 issuedAt/expiresAt/remainingSeconds。协议 owner 自行保存 Code/Token，不建立 Kernel 产物登记。
这些能力不续期或提交前复查会话；新的业务操作必须重新取得观察。

## 原子生命周期与隔离

默认新代 namespace 为 `iam:session:unified:v1:`。自定义 namespace 后仍追加固定 `:unified:v1:`，不探测 bearer 格式、
不读取旧模型、不转换旧会话。线上与离线维护只装配这一代；旧布局维护已退役。

同根同 Client 的授权通过一次 Redis 执行新建或复用 ClientSession。有效关系保持 ID 和原始身份，在同一原子操作更新
protocol 与授权时间，并使用 `min(root.expiresAt, max(old.expiresAt, redisNow + clientTtl))` 更新期限。失效后创建新 ID。
`instance` 是不可变的存储实例身份，用于拒绝同 ID 被替换后的迟到作用；合法续期和协议更新不改变它。

根期限、身份、认证事实与 subjectContext 创建后固定。子记录复制根的主体/代际，仅用于中性归属检查，不成为独立认证权威。
根成功终止后，新组合读取直接拒绝，子索引缺失不影响该保证；已观察根的在途授权可以落入旧根，但下一次在线使用仍拒绝。
精确根终止只报告根的实际作用；外层若需尽力处理子实例，先通过公开捕获取得子集合，再精确执行，不能以索引完整性
作为根退出成功的前置条件。

## 中性撤销与固定集合

管理入口提供 `listSessions({kind, subjectIdentifier?, offset, limit})`，在一次有界 Redis 操作中返回所选索引页和总数，
不获取目标账号许可。每页最多 1000 条；安全 Admin 映射及实际 HTTP 页上限见[管理契约](../admin/session-management.md#列表与安全视图)。
`inventory:userSession`、`inventory:clientSession` 与 `subject-clients:<subjectIdentifier>` 属于相同 unified namespace，
随原子生命周期维护并保留期限；它们只负责记录查询，不构成在线访问或完整库存权威。缺索引不恢复已终止根，
页内坏记录失败关闭。维护库存覆盖这三类索引；旧数据不在在线路径补读或重建。

`observeUserSessionForRevocation` / `observeClientSessionForRevocation` 核对原目标并生成本操作私有撤销观察，接受仍存在的
终态记录，不要求根或账号许可有效。在线观察也可交给同类型 `revokeObserved…Session`。精确撤销比较稳定实例身份，
不比较合法变动的 protocol/期限；终止子实例只作用于原 ClientSession，其他根、Client 与后来新建实例保留。

`captureSessions` 按 subjectIdentifier、userSessionId 或 clientId 分页返回记录 DTO、固定 targets 和 nextOffset。每页最多
1000 条；多页捕获不是全局快照，不保证捕获之后的在途写入被选中。管理记录视图不声明账号当前可访问。
`executeCapturedSessions` 只处理显式 targets，按原实例去重，可单独排除当前根而仍处理它的 ClientSession；不会自动扩展到子树。
调用方必须先完成全部捕获再开始删除，不能把删除中变化的分页游标当作固定批次。

结果分别返回实际 userSessionsTerminated/clientSessionsTerminated 和每个目标的 terminated、already_terminated、missing、
expired、excluded、replaced、failed 或 unknown。`unfinished` 只包含失败/未知的原 targets，可序列化供之后经授权的显式操作重试；
集合丢失则重新查询发起新操作，不重新全扫来扩大旧重试。已确认终止、之后再丢响应仍报告 unknown；重试读到终态只返回
already_terminated，不把旧作用重新计数。没有自动补齐或持久化任务。

权威终态保持原 expiresAt，根反向 ID 同期到期，索引使用各自记录的期限并在终止时尽力移除。索引回收失败不取消终态 TTL，
也不把已确认的权威终止报告成未执行；Kernel 不登记协议产物回收、pending 或可靠后台任务。

## 验证边界

`@iam/session-kernel/testing` 仅用于独立 Redis scope、操作生命周期、窄故障注入和 owner 状态观察。
[Redis 生命周期测试](../../../packages/session-kernel/test-integration/redis/unified-session-lifecycle.integration.test.ts)
覆盖并发、时间、防伪、精确作用、未知结果与 TTL；协议交付和系统部署的证明范围见
[架构验证归属](../../architecture/architecture-verification.md)。
