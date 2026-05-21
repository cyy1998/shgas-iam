## ADDED Requirements

### Requirement: Cap 人机挑战服务
系统 SHALL 提供基于 cap.js 的人机挑战能力，用于公开认证入口在发送高成本请求或识别到异常请求时校验调用方为真实用户。

#### Scenario: 前端获取 Cap challenge 并兑换 token
- **WHEN** SSO 前端需要进行人机校验
- **THEN** 系统 SHALL 允许前端通过配置的 Cap endpoint 获取 challenge 并兑换 Cap token
- **AND** Cap token SHALL 可被后端用于后续业务请求校验

#### Scenario: Cap token 校验成功
- **WHEN** 业务请求携带的 Cap token 有效、未过期、未被消费且匹配当前 action
- **THEN** 系统 SHALL 允许业务请求继续执行原有业务校验
- **AND** 系统 SHALL 将该 Cap token 标记为已消费

#### Scenario: Cap token 缺失或无效
- **WHEN** 业务请求需要人机校验但未携带 Cap token，或携带的 Cap token 无效、过期、已消费、action 不匹配
- **THEN** 系统 SHALL 拒绝继续执行业务动作
- **AND** 响应 SHALL 使用可被前端稳定识别的业务码表示需要人机校验

### Requirement: Cap 异常触发策略
系统 SHALL 对公开认证入口维护短窗口风险状态，并基于 action、subject 和 IP 判断请求是否需要 Cap。

#### Scenario: 短信发送总是要求 Cap
- **WHEN** 请求 action 为 `sendSmsCode`
- **THEN** 系统 SHALL 要求请求携带有效 Cap token

#### Scenario: 密码登录异常后要求 Cap
- **WHEN** 同一 username 或 IP 在配置窗口内密码登录失败次数达到配置阈值
- **THEN** 系统 SHALL 要求后续 `passwordLogin` 请求携带有效 Cap token

#### Scenario: 手机验证码登录异常后要求 Cap
- **WHEN** 同一 phoneNumber 或 IP 在配置窗口内手机验证码登录失败次数达到配置阈值
- **THEN** 系统 SHALL 要求后续 `mobileLogin` 请求携带有效 Cap token

#### Scenario: 脱敏用户查询异常后要求 Cap
- **WHEN** 同一 IP 在配置窗口内查询不同 username 的数量达到配置阈值
- **THEN** 系统 SHALL 要求后续 `openUserInfoLookup` 请求携带有效 Cap token

#### Scenario: 未触发异常的低风险请求
- **WHEN** 请求 action 不是 `sendSmsCode` 且未达到对应异常阈值
- **THEN** 系统 SHALL 不要求 Cap token
- **AND** 系统 SHALL 保持该接口原有业务校验和响应语义

### Requirement: 前端 Cap 重试协作
SSO 前端 SHALL 在认证相关请求被后端要求人机校验时触发 cap.js 求解，并携带 Cap token 重试原请求。

#### Scenario: 后端要求人机校验
- **WHEN** SSO 前端收到业务码表示需要人机校验的响应
- **THEN** 前端 SHALL 触发 cap.js challenge 求解
- **AND** 前端 SHALL 在求解成功后将 Cap token 加入原请求体并重试一次

#### Scenario: Cap 求解失败
- **WHEN** cap.js challenge 求解失败、超时或被用户取消
- **THEN** 前端 SHALL 不重试原业务请求
- **AND** 前端 SHALL 展示可理解的校验失败提示

#### Scenario: 请求正在进行 Cap 校验
- **WHEN** 前端正在求解 Cap challenge 或携带 Cap token 重试请求
- **THEN** 前端 SHALL 阻止同一动作重复提交
- **AND** 前端 SHALL 使用加载状态反馈当前操作正在进行
