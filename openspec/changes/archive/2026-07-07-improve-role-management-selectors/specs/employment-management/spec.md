## MODIFIED Requirements

### Requirement: 搜索和查询雇佣
系统 SHALL 在未软删除雇佣中按管理端条件查询列表和详情，返回结构化 Employment DTO/VO，并聚合角色权限。

#### Scenario: 搜索雇佣
- **WHEN** 管理端提交雇佣分页查询条件
- **THEN** 系统 SHALL 只查询 `employment.isDelete=false` 的记录
- **AND** fuzzy text SHALL 支持匹配任职 ID、用户 username/name、任职组织 orgCode/orgName 和岗位 posCode/posName
- **AND** 系统 SHALL 支持按 usernames、organization、posCodes、isPrimary 和 statuses 精确过滤
- **AND** organization 过滤 SHALL 支持 `matchMode=exact` 精确匹配任职组织
- **AND** organization 过滤 SHALL 支持 `matchMode=subtree` 匹配组织子树下任职
- **AND** organization 过滤 SHALL 支持 `matchMode=company` 匹配 Company 祖先下任职

#### Scenario: 查询雇佣详情
- **WHEN** 管理端按 id 查询到未软删除雇佣
- **THEN** 系统 SHALL 返回包含 `user`、`position` 和 `organization` 上下文的雇佣 DTO/VO
- **AND** 系统 SHALL NOT 在雇佣顶层返回 username、name、mobile、wxId、posCode、posName、orgCode、orgName、orgType、compCode 和 compName deprecated 扁平字段
- **AND** 系统 SHALL 聚合该雇佣通过岗位、组织和任职直接关联得到的 active roles 与 privileges

#### Scenario: 雇佣不存在
- **WHEN** 管理端按 id 查询不到未软删除雇佣
- **THEN** 系统 SHALL 拒绝请求并报告雇佣不存在
