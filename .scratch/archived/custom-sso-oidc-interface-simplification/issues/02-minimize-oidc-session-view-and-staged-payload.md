# 02 — 最小化 OIDC session view 与 staged payload

**What to build:** 让 OIDC resolved session、Provider Session binding 与短期 staged binding 只携带授权、Claims Snapshot、
anchor 和 CAS 真正读取的状态，移除未读 bearer/database identifiers，同时保持现有授权、token 与多 client 隔离行为。

**Blocked by:** 01 — 退役 legacy Global Session contract

**Status:** resolved

- [x] resolved session view 不再返回未读 external token 或数据库 `userId`，但 Cookie bearer 仍能解析当前 Principal Session。
- [x] Provider Session binding view 不再携带数据库 `userId` 或重复 global session identifier，`accountId`、Principal Session reference、binding owner 与配置版本保持不变。
- [x] staged binding schema/payload 不再写入或要求 `userId`，stage、claim、consume 和 publish 使用其余最小字段完成同一生命周期。
- [x] Provider Session anchor、generation membership、mapping owner、publish confirmation、TTL refresh、destroy fence 与 CAS 行为保持不变。
- [x] Claims Snapshot、Authorization Code、Access Token、UserInfo、Subject Access 与 client isolation 的 observable behavior 保持不变。
- [x] 新 reader 可接受并忽略旧 staged payload 的额外字段；发布说明明确禁止旧 reader 与新 writer 长期混跑，并要求统一切换或停止新授权后等待最长 60 秒 TTL。
- [x] 测试 fixtures 不再伪造被删除字段；provider-session Redis contract 覆盖新 staged wire，而业务测试不以内部 shape assertion 代替行为验证。
- [x] 运行 OIDC Provider 直接相关 Unit/Component/Redis collections、lint/typecheck、Architecture Guard、Docs Guard 与 `git diff --check`。
