# 已发布 Subject Facts 的授权交付

Custom SSO 与 OIDC 使用同一已发布 Facts 读取与主体投影能力；决策见
[ADR-0032](../../adr/0032-consume-published-subject-facts-for-authorization.md)。

## 行为与责任

全部所选 Claim 使用同一次合法 Facts；仅 Subject Identifier 不读取 Facts。
Reader 优先合法 Redis 缓存，缺失或无效才回源已发布 Profile，不现场聚合源表或检查 Dirty 新鲜度。
single-flight、窄行回源、CAS 和错误处理统一见[Client Subject Projection](../../architecture/backend-architecture.md#client-subject-projection)，
发布与恢复见[Subject Facts publication](../../architecture/backend-architecture.md#user-profile-subject-facts-publication)。

`iam:authorization` 接受源权限改变后的旧 Facts，重建持续失败时仍可继续交付。
有效缓存也可能落后于数据库已发布行，不为寻找更高版本主动回源；“已发布”不等于“最新”。
不承诺固定撤权传播期限，不增加请求时 Dirty/Redis 新鲜度屏障。
[账号访问许可](subject-access-operation-contract.md)和会话关系校验独立保持。

Custom SSO 与 OIDC UserInfo 在实际交付时按当前 Client 披露范围构建投影，旧 Token 也适用新增或收窄的披露。
已签发 ID Token 内容固定，Code 不携带 Claims Snapshot。
Facts 不可得时交付失败，不恢复已消费 Code；已有 Token 可在 UserInfo 暂态失败后重试。
第三方复制后的刷新由其负责，不能从 IAM 发布完成推断第三方本地数据已刷新。

## 验证与维护

Reader/Projection 需要分别证明缓存命中、无效回源、主体匹配、当前披露与错误边界；
存储与协议资源的证明范围见[架构验证归属](../../architecture/architecture-verification.md)。
当前会话维护见[统一维护手册](../../releases/unified-session-maintenance.md)，
数据重建、publication 校验与恢复见[Profile 维护手册](../../releases/user-profile-maintenance.md)，不以历史测试结果替代。
