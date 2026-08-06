# 收敛真实 Redis 迁移的最小测试 seam

Type: prototype

Status: resolved

Blocked by: None — can start immediately

Prototype: [真实 Redis 迁移的最小测试 seam](../prototypes/03-real-redis-seam/README.md)

## Question

删除 RESP shim 后，如何用最小公开 seam 让 API、OIDC、Admin API、API Core cleanup 和现有 external tests 通过真实 Redis
保留当前可观察覆盖，同时不在 `session-fixtures`、test scope 或 harness 中复制生产 key、序列化、TTL、Lua 与 lifecycle 语义？

本 ticket 应提供至少“复用现有 production Session Kernel/public testing export”和“新增窄 test scope”两种粗略接口方案，
并与维护者共同决定：

- fixture 只创建领域输入，production persistence 负责 key/serialization，还是确有理由暴露更窄的 seed 能力；
- 普通 namespace-isolated Redis tests 与 cleanup CLI 的 disposable DB/instance 如何分开；
- ACL、sentinel key 和 owned-key inventory 分别证明哪些安全属性；
- 哪些 command-order assertions 应替换为 HTTP/CLI 结果和真实状态，哪些低层 Redis contract 仍有价值；
- 新 seam 是否有两个真实调用方并通过删除测试；只有一个调用方时优先局部实现。

不得用新的通用 Redis test framework、可编程命令观察器或另一套 persistence serializer 替换旧协议替身。

## Answer

维护者确认真实 Redis 迁移采用“直接复用 production Module、fixture 只创建领域输入”的最小形状，不为迁移新增第二套
Session persistence 或通用 Redis test framework。

### Session Kernel 造数 seam

- API、OIDC 与 Admin API 需要 Principal Session、Client Binding、Credential 或 Protocol Artifact 时，使用真实测试
  Redis 和 production `createSessionKernel` 创建。fixture 最多形成 `subject`、`authContext`、binding/credential input
  等领域输入；不得生成 Redis key、serialized value、TTL、lookup、index 或 Lua 结果。
- 测试 composition 必须让 Kernel 的 namespace、lookup HMAC、TTL 和 cleanup adapters 与被测 entry 的配置一致；需要
  Principal Access fence 时，先通过 Subject Access owner 的 production bootstrap 建立状态，再让 Kernel 捕获真实 fence。
- `createSessionKernelForTesting` 继续只服务 Unit/component 测试。它以进程内 artifact consumer 替代 production Redis
  Lua，因此即使传入真实 Redis，也不得作为 Redis Integration 的 fidelity seam。
- 固定 ID 或 token 通过 Kernel 已有的 random/token input 与返回值控制，不以 raw Redis fixture 绕过 lifecycle。

### 其他 Redis 状态的 owner

Session Kernel 只拥有 Session Kernel 对象，不能扩张为所有 Redis 测试数据的万能 seed Module：

- Subject Access 使用 `createSubjectAccessBootstrap`；
- Subject Facts 使用 `createSubjectFactsRedisPublisher`；
- Custom SSO runtime cache、OIDC Provider Session 私有状态与 Admin client cache 通过各自 production owner 的公开 seam
  建立；若当前没有稳定 writer 且只有一个调用方，fixture 保持调用方局部，不为迁移公开 serializer；
- 历史 payload/key 只有在验证 backward-compatibility 或 cleanup allowlist 本身时才可作为该 contract 的局部 raw fixture，
  不得回流成通用 session fixture。

### 普通 Redis Integration 与 cleanup CLI

- 普通 Redis Integration 使用调用方提供的专用测试 URL 和每次运行随机 namespace。测试可以持有独立 writer/observer
  clients，但只通过 owner Module interface 驱动行为；结束时只删除 owned prefix 并关闭自己的 clients，禁止
  `FLUSHDB`、`FLUSHALL` 或无范围清理。
- Legacy cleanup CLI 的 production allowlist 使用固定、未加 namespace 的历史 pattern，并扫描整个选定 logical DB。
  因此它必须运行在独占、可销毁的 Redis logical DB 或 instance；不得与普通 namespace-isolated tests 或其他 owner
  共享资源，也不得把 namespace scope 伪装成足够的保护。

同一个 cleanup Integration 场景使用三种互补证据：

1. ACL 从能力上禁止 `FLUSHDB`、`FLUSHALL` 等危险命令；它不证明允许的 `SCAN`/`DEL` target 正确。
2. Sentinel key 是明确不属于 cleanup target 的保护样本；apply 后仍存在，证明该样本没有被误删，但不能代表全部 key。
3. 完整 owned-key inventory 比较 disposable DB 的 before/after，证明本次 fixture 中所有 target 已删除、所有 non-target
   保持不变且没有意外新增 key。

### 断言边界

- 删除 RESP command 顺序、次数、`MULTI/EXEC` 排列、Lua comment dispatch 和 legacy key read command-log 断言；迁移后
  通过 HTTP/OIDC response、CLI exit/摘要以及独立 client 观察到的真实 Redis 状态验证行为。
- 继续保留 owner Module interface 下只有真实 Redis 才能证明的 contract：Lua 单赢家、CAS、Redis TIME/TTL、transaction
  与 index 原子变化、并发线性化、失败关闭和 cleanup 的精确 effect。测试证明公开行为与安全属性，不锁定等价实现的
  内部命令顺序。

### 删除测试与新增 interface 门槛

production `createSessionKernel` 已有 API/OIDC/Admin 迁移场景和 API Core/OIDC Redis contracts 等多个真实调用方，直接复用
满足删除测试。当前等价的 package-local Session Kernel Redis scope 只有一个真实调用方，因此本次不新增 public
`createSessionKernelRedisTestScope` 或 seed interface。

只有在 API external 与 OIDC external 等至少两个调用方完成局部迁移后，确实重复同一段非平凡的 namespace、client ownership
和 cleanup 逻辑，才允许把这部分抽成窄 testing export。该 scope 也只能拥有测试资源 lifecycle，内部仍 composition
production `createSessionKernel`；不得暴露 raw seed、serializer、key builder、command observer 或可编程 Redis adapter。
API Core cleanup harness 只有一个破坏性 CLI 调用方，保持 CLI-local，不进入共享 Session scope。
