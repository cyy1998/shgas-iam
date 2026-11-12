# @iam/session-kernel

Session Kernel 只拥有 UserSession 和 ClientSession，Redis 决定时间、关系、观察与撤销。Kernel 不依赖 Subject Access、协议、API Core 或 app。
协议拥有 Code、Token 与续接。认证用例校验凭据和登录限制，记录认证方式和审计，再创建根。Custom SSO 经注入的应用接口访问会话，Admin 经撤销接口操作。

## 会话与可信观察

根身份、认证事实、context 与期限固定。同根同 Client 的 open 原子新建或复用有效关系，更新协议标记并单调延长至根期限以内。
协议凭据期限受两类会话限制，使用或重新授权不延长旧 Token。根终止后在线使用立即拒绝，在途授权仍可能落入旧根。

观察绑定 factory 和活跃操作，不能通过复制或序列化获得。迟到交付前重验活跃性，关闭操作不取消已开始的 Redis 写入。
下一操作重新观察，内部 ID 查询仍须调用方检查认证、归属和许可。

## 列表与撤销

列表仅观察有界索引，坏记录拒绝，多页无全局快照。撤销先校验并完整捕获目标，已终止实例也可捕获，无需账号许可。
执行按显式目标和稳定实例身份，不能沿变化游标边捕获边删或替换成当前关系槽。

结果区分已终止、替换、失败与未知。重试仅限原批次失败或未知实例，集合丢失须重新查询并发起新操作。
响应丢失保留 unknown，重试遇终态不重复计数。终态保留原期限，索引清理失败不撤销终态。协议产物无 Kernel 二次登记或可靠后台补齐。
[会话生命周期测试](test-integration/session-lifecycle/unified-session-lifecycle.integration.test.ts)
