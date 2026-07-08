## ADDED Requirements

### Requirement: 用户 DTO 不包含协议会话身份
系统 SHALL 保持 `UserDto` 和 `UserDetailDto` 只表达 IAM 用户档案字段，并 SHALL NOT 包含 ORCAS、OIDC、Custom SSO 或其他协议会话中临时产生的外部身份字段。

#### Scenario: 用户 DTO schema 排除 ORCAS 会话身份
- **WHEN** 系统定义 `UserDtoSchema` 或 `UserDetailDtoSchema`
- **THEN** schema SHALL NOT 包含 `orcasId`
- **AND** 对应 TypeScript type SHALL 从该 schema 推导得到

#### Scenario: 协议信息由协议上下文表达
- **WHEN** 某个登录、SSO 或外部集成流程产生协议私有身份信息
- **THEN** 系统 SHALL 通过对应协议上下文、payload 或专用响应表达该信息
- **AND** 系统 SHALL NOT 为了透传协议私有身份而扩展领域稳定用户 DTO
