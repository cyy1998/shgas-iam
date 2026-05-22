## ADDED Requirements

### Requirement: 管理端查询和维护客户端
系统 SHALL 通过管理端 client REST 与 tRPC 接口提供 client 分页搜索、详情读取、状态变更和软删除能力。

#### Scenario: 分页搜索客户端
- **WHEN** 管理端通过 REST 或 tRPC 提交 client 分页搜索请求
- **THEN** 系统 SHALL 返回未软删除 client 的分页结果
- **AND** 结果 SHALL 支持按 clientCode、clientName、url 或 description 模糊匹配
- **AND** 结果 SHALL 支持按 status 和 managementLevel 精确筛选

#### Scenario: 查询客户端详情
- **WHEN** 管理端通过 REST 或 tRPC 按 clientCode 查询 client 详情
- **THEN** 系统 SHALL 返回对应 ClientDto
- **AND** 当 client 不存在或已软删除时，系统 SHALL 返回未找到错误

#### Scenario: 更新客户端状态
- **WHEN** 管理端通过 REST 或 tRPC 按 clientCode 提交 status 变更
- **THEN** 系统 SHALL 更新对应 client 的 status
- **AND** 系统 SHALL 同步刷新该 client 的 Redis code/secret 缓存

#### Scenario: 软删除客户端
- **WHEN** 管理端通过 REST 或 tRPC 按 clientCode 删除 client
- **THEN** 系统 SHALL 将该 client 标记为软删除
- **AND** 系统 SHALL 删除该 client 当前 code 和 secret 对应的 Redis 缓存 key
- **AND** 后续管理端搜索和详情查询 SHALL 不再返回该 client

### Requirement: 管理端页面管理客户端
系统 SHALL 在 `admin` 应用中提供 client 管理页面，使管理员可以通过页面完成常规 client 配置维护。

#### Scenario: 查看客户端列表
- **WHEN** 管理员打开 client 管理页面
- **THEN** 页面 SHALL 展示 clientCode、clientName、url、status、managementLevel 和 createTime 等列表信息
- **AND** 页面 SHALL 提供关键字搜索、状态筛选和管理模式筛选

#### Scenario: 新建客户端
- **WHEN** 管理员在 client 管理页面提交新建表单
- **THEN** 页面 SHALL 调用 admin client tRPC 创建接口
- **AND** 创建成功后 SHALL 关闭表单并刷新列表

#### Scenario: 编辑客户端
- **WHEN** 管理员在 client 管理页面提交编辑表单
- **THEN** 页面 SHALL 调用 admin client tRPC 更新接口
- **AND** 编辑表单 SHALL 支持维护 client 基础字段和 extAttributes 字段

#### Scenario: 页面变更客户端状态
- **WHEN** 管理员在 client 管理页面选择新的 client 状态
- **THEN** 页面 SHALL 调用 admin client tRPC 状态更新接口
- **AND** 成功后 SHALL 刷新列表并展示成功反馈

#### Scenario: 页面删除客户端
- **WHEN** 管理员在 client 管理页面确认删除 client
- **THEN** 页面 SHALL 调用 admin client tRPC 删除接口
- **AND** 成功后 SHALL 刷新列表并展示成功反馈

## MODIFIED Requirements

### Requirement: 管理端创建和更新客户端
系统 SHALL 通过管理端 client REST 与 tRPC 接口创建和更新客户端，并保持数据库记录与 Redis code/secret 缓存一致。

#### Scenario: 创建客户端
- **WHEN** 管理端提交 client 创建请求且输入通过 schema 校验
- **THEN** 系统 SHALL 插入 client 记录
- **AND** 系统 SHALL 将创建后的 ClientDto 写入 `cache:client:code:<clientCode>` 与 `cache:client:secret:<clientSecret>`
- **AND** 响应 SHALL 返回 ClientDto

#### Scenario: 更新客户端
- **WHEN** 管理端按 clientCode 提交 client 更新请求且输入通过 schema 校验
- **THEN** 系统 SHALL 更新对应 client 记录中的请求字段
- **AND** 系统 SHALL 将更新后的 ClientDto 写入 `cache:client:code:<clientCode>` 与 `cache:client:secret:<clientSecret>`
- **AND** 响应 SHALL 返回 ClientDto

#### Scenario: 更新客户端标识或密钥后清理旧缓存
- **WHEN** 管理端更新 client 且 clientCode 或 clientSecret 发生变化
- **THEN** 系统 SHALL 删除旧 `cache:client:code:<oldClientCode>` 或旧 `cache:client:secret:<oldClientSecret>` key
- **AND** 系统 SHALL 写入新 `cache:client:code:<newClientCode>` 与 `cache:client:secret:<newClientSecret>` key
- **AND** 旧 clientCode 或旧 clientSecret 后续 SHALL 不再因 Redis 缓存命中而解析为有效 client
