# @iam/client-subject-projection

`@iam/client-subject-projection` 负责协议中性的资料目录（Catalog）、披露裁剪与主体投影。调用方传入主体、Client、披露范围和当前操作许可，
核心逻辑通过注入接口读取同一份合法 Facts，与数据库、运行时及具体协议实现解耦，无需重读 Client 配置或重新认证。
仅请求 Subject Identifier 时无需读取 Facts。支持交付应用资料的入口可按需请求自定义属性：用户属性独立于 Catalog 声明，组织和岗位属性随所选有效任职资料一并交付。

## 已发布 Facts 与披露

用户资料和角色均读取已发布的 Facts：源端角色变更允许异步延迟，账号访问屏障独立实时生效；Facts 缺失或主体错配时整份投影直接失败。
OIDC UserInfo 和 Custom SSO 在实际交付时按当前披露配置裁剪结果，Code 保留原授权事实，已签发 ID Token 内容固定不变。

## 协议接线

Custom SSO 的 `/wire` 模块提供 schema、mapper 和预览能力，仅依赖 Projection 根接口，并在输出前验证主体一致性与数据结构。
组织责任随任职资料交付，不形成独立 claim 或授权字段；格式版本由各 owner 的 schema 决定，不回退旧格式。
[公开入口](src/index.ts) · [Custom SSO wire](../../packages/custom-sso/src/wire.ts) · [ADR-0032](../../docs/adr/0032-consume-published-subject-facts-for-authorization.md)
