# Global Session Envelope 迁移说明

OIDC Provider 与 API 共享带版本号的 `global_session` envelope。这是一项有意不向后兼容的变更：
系统会拒绝只包含裸 user DTO 的旧 Redis 数据，也不会提供兼容读取逻辑。

## 发布门禁

1. 停止全部 login、authorize、callback、token 和 session refresh 流量。
2. 确认读取 envelope version 1 的 API 与 OIDC Provider 已准备好同时发布。
3. 使用运维规定的 Redis `SCAN` 加 `UNLINK` 流程，清空以下 namespace 中的全部 key：
   - `global_session:*`
   - `local_*_session:*`
   - `local_session_reverse:*`
   - `local_session_set:*`
4. 确认上述四个 namespace 的扫描结果均为零个 key。
5. 先部署 API、SSO Portal 和 OIDC Provider，再恢复登录流量。
6. 确认新登录写入 `{ version: 1, authTime, user }`，且 `authTime` 使用 Unix seconds。
7. 确认 authorize 滑动续期只改变 TTL，不改变 `authTime`；global logout 会删除关联的 local session。

维护窗口结束后，所有用户都必须重新登录。回滚时，在再次清空相同 session namespace 前必须持续停止
登录流量；新旧 global session 格式不得同时对外提供服务。
