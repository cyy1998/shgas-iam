# 04 — 收缩旧接口并锁定架构

**What to build:** 在 Independent 与 Gateway 均迁移到目标操作后删除旧的公开两阶段 seam 和浅层顺序测试，并用 consumer-owned port contract、architecture guards 与当前文档固定新的模块边界，避免 Session Kernel 模型或调用方编排重新泄漏。

**Blocked by:** [02 — 打通 Independent Authorization Grant](./02-deliver-independent-authorization-grant.md) and [03 — 在共同 Grant 上完成 Gateway Local Session](./03-complete-gateway-local-session.md)

**Status:** resolved

- [x] 删除公开的 `consumeAuthCode`、`createLocalSession`、重复 consumed-code 类型、泄漏到应用层的 Session Kernel 中间模型及所有临时兼容代码。
- [x] 删除或改写只断言内部调用顺序的浅层测试，保留并补足从最终 Authorization Code、Independent credential 和 Gateway session 观察结果的行为测试。
- [x] 类型 contract 证明 production adapter 直接满足三个 consumer-owned ports，且不依赖 unchecked assertion、空转 wrapper 或 provider-owned port import。
- [x] Architecture guard 拒绝相关 production use case 与 route 导入 Session Kernel 模型，并拒绝旧两阶段操作名称重新进入 Gateway 或 Independent completion 路径。
- [x] 根领域词汇、当前 SSO 对接文档、后端架构文档和文档索引一致描述 use case 入口验证、深模块 grant/session 生命周期及 route HTTP 适配的职责边界。
- [x] 既有 HTTP schema、Cookie、错误码、Redis key、payload version、credential discriminator、audit action 和活跃 session 数据兼容性保持不变。
- [x] 受影响的完整 `@iam/api` 普通测试与 smoke、lint、typecheck、文档检查和 whitespace check 全部通过。
