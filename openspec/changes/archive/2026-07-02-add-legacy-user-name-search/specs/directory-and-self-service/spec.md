## MODIFIED Requirements

### Requirement: public/internal 目录查询
系统 SHALL 通过 public 和 internal API 查询启用且未软删除的组织与用户目录。

#### Scenario: 查询组织目录
- **WHEN** public 或 internal API 提交组织查询条件
- **THEN** 系统 SHALL 只返回 status 为 Enable 且未软删除的组织
- **AND** 系统 SHALL 支持按祖先、后代、层级、类型和组织编码条件过滤

#### Scenario: 查询用户目录
- **WHEN** public 或 internal API 提交用户查询条件
- **THEN** 系统 SHALL 只返回当前 schema version profile 中 `search_visible=true` 的用户
- **AND** 系统 SHALL 支持按 username、name、phone、wxId、组织祖先、组织深度、岗位编码和角色编码过滤
- **AND** name 过滤 SHALL 使用 legacy `UserQueryDto.names` 姓名列表进行精确匹配
- **AND** 用户目录查询 SHALL 使用 profile search document 并保持旧 `UserQueryDto` 的同一 employment nested 过滤语义
