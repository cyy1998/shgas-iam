# @iam/client-subject-projection

`@iam/client-subject-projection` 拥有协议中性的 Catalog、披露裁剪与投影。调用方传入主体、Client、披露选择和本操作许可，
核心通过注入接口使用同一份合法 Facts，与数据库、运行时及协议实现解耦，无需重读 Client 配置或认证。仅交付 Subject Identifier 时无需 Facts。

## 已发布 Facts 与披露

资料和角色均读取已发布 Facts。源角色变更允许延迟，账号屏障独立生效。Facts 缺失或主体错配时整份失败。
OIDC UserInfo 和 Custom SSO 实际交付按当前披露裁剪，Code 保留原授权事实，已签发 ID Token 内容固定。

## 协议接线

Custom SSO 浏览器 `/wire` 拥有 schema、mapper 和预览，仅依赖 Projection 根接口。输出验证主体和结构。
责任随任职资料交付，不形成独立 claim 或授权字段。版本由各 owner 的 schema 决定，不回退旧格式。
[公开入口](src/index.ts) · [Custom SSO wire](../../packages/custom-sso/src/wire.ts) · [ADR-0032](../../docs/adr/0032-consume-published-subject-facts-for-authorization.md)
