# @iam/login-restriction

`@iam/login-restriction` 拥有失败历史、有效限制和管理索引，API/Admin API 注入 `/redis` adapter，应用负责凭据验证、资料补充、HTTP 与审计。
Redis adapter 持有原子转换和服务端时间。解除原子清除限制、历史和索引，无宽限期或会话变更。索引不决定限制是否有效，资料缺失不妨碍查询或解除。
Redis 状态未知报告暂态故障，管理解除先作用再审计。
[登录功能](../../docs/features/login-and-session.md#临时登录限制与异常处理) · [审计安全边界](../../docs/engineering/backend-architecture.md#审计安全边界)
[公开接口](src/login-restriction.ts) · [Redis 集成测试](test-integration/login-restriction/login-restriction.integration.test.ts)
