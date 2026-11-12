---
status: accepted
---

# 收紧管理写入约束并保留可读历史

开放引用阻止删除，合法保留的结束历史继续可读。这样需要在删除前显式处理依赖，
避免单一删除命令隐式结束委托、任职或角色授权。账号停用与任职结束各自表达独立生命周期。
原范围、实施与验收见 [Spec #207](https://github.com/cyy1998/shgas-iam/issues/207)。

## 开放引用与软删除历史

- User Disable 时禁止新增任职或转岗。既有开放任职仍按原权限和生命周期维护，返聘建立新任职。
  停用且无开放任职的用户须由完整管理员先恢复为 Pause，HR 再按当前组织范围办理新任职。
  [任职决定](0011-model-employment-as-an-immutable-tenure-lifecycle.md)
- 未结束委托会阻止引用对象删除，暂停、未来和自然到期的委托仍按其生命周期判断。Client 有未删除 Role 时拒绝删除。
  [委托引用范围](0020-provide-fail-closed-privilege-delegation-resolution.md) · [删除应用](../features/application-integration.md#删除应用)
- Ended 责任沿保留的关联读取当前名称与软删除状态。接受无法重建历史时刻名称的代价，省去独立名称快照。
  开放责任仍执行完整性检查。[组织责任模型](0014-model-organization-responsibility-as-employment-bound-fact.md)

沿用 [ADR-0025](0025-align-admin-mutation-results-with-committed-facts.md) 的同对象写入规则。跨对象门禁采用预检，
接受创建、删除和账号状态切换之间的并发窗口，避免为本次收紧引入新的全局锁或协调重试。

## 输入与展示边界

标识与名称统一在写入前修剪首尾空白，保留既有大小写、查询匹配与软删除记录的唯一性语义。
输入字段和长度由当前 schema 定义，原存量前提与本次范围限制由历史决定和 Spec 保留。
Admin 详情继续展示合法角色事实。权限点及旧详情字段由 [ADR-0045](0045-retire-privilege-permission-points.md) 退役。
[用户、组织与任职](../features/directory-management.md) · [领域语言](../../CONTEXT.md)

固定历史版本：[ADR-0026 历史原文](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/adr/0026-serialize-privilege-delegation-writes-by-delegator.md)、[整理前 ADR-0039](https://github.com/cyy1998/shgas-iam/blob/cbfd4aa60fd6000662026b68576f1aa1409b6ce4/docs/adr/0039-tighten-admin-reference-integrity-and-preserve-history.md)。
