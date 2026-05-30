## ADDED Requirements

### Requirement: Public User Service Responsibility Boundaries
public API 用户服务 SHALL 保持现有导出函数和业务行为，同时将用户详情聚合、密码规则、手机号绑定校验和权限委托查询聚合拆分为独立 helper。`user.service.ts` SHALL 作为 use-case facade 保留事务边界和对外编排职责。

#### Scenario: User detail aggregation is delegated to helper
- **WHEN** `getUserDetailById`、`getUserDetailByUsername`、`getUserDetailByMobile` 或 `getUserDetailByWxId` 被调用
- **THEN** 系统 SHALL 继续返回包含 employments、roles 和 privileges 的用户详情 DTO
- **AND** 用户详情聚合逻辑 SHALL 位于独立 helper 中
- **AND** 对外函数签名和异常语义 SHALL 保持不变

#### Scenario: Password helper preserves current rules
- **WHEN** `setPassword` 被调用
- **THEN** 系统 SHALL 继续拒绝用户不存在、新旧密码相同、旧密码不匹配或新密码强度不足的请求
- **AND** 系统 SHALL 使用密码 helper 完成强度校验、密码验证和 hash
- **AND** 系统 SHALL 使用配置的 bcrypt rounds 保存新密码 hash

#### Scenario: Reset password keeps existing strength behavior
- **WHEN** `resetPassword` 被调用且用户、手机号和验证码校验通过
- **THEN** 系统 SHALL 继续 hash 并保存 newPassword
- **AND** 系统 SHALL NOT 在本变更中新增自助改密密码强度校验要求

#### Scenario: Mobile binding validation is delegated to helper
- **WHEN** `setMobile` 被调用
- **THEN** 系统 SHALL 继续按手机号格式、重复手机号、bindPhone 验证码、写入手机号的顺序执行
- **AND** 手机号绑定前置校验 SHALL 位于独立 helper 中
- **AND** 验证成功后系统 SHALL 继续返回刷新后的用户详情

#### Scenario: Privilege delegation search is delegated to helper
- **WHEN** `searchUsersWithPrivilegeDelegation` 被调用
- **THEN** 系统 SHALL 继续要求 `ancestorOrgCodes` 仅包含一个元素
- **AND** 系统 SHALL 继续返回用户 DTO 列表和权限委托 DTO 列表
- **AND** 用户搜索与权限委托查询聚合 SHALL 位于独立 helper 中
