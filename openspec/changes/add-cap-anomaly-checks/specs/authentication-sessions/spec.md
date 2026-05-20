## ADDED Requirements

### Requirement: 异常登录请求的人机校验
系统 SHALL 在密码登录和手机验证码登录触发异常条件时要求有效 Cap token，并在未触发异常时保持原有登录语义。

#### Scenario: 密码登录异常且缺少 Cap token
- **WHEN** `/auth/login/password` 请求命中 `passwordLogin` 异常触发策略且未携带有效 Cap token
- **THEN** 系统 SHALL 拒绝执行密码校验和全局会话创建
- **AND** 响应 SHALL 使用可被前端稳定识别的业务码表示需要人机校验

#### Scenario: 密码登录异常且 Cap token 有效
- **WHEN** `/auth/login/password` 请求命中 `passwordLogin` 异常触发策略且携带有效 Cap token
- **THEN** 系统 SHALL 消费该 Cap token
- **AND** 系统 SHALL 继续执行既有密码登录成功或失败处理

#### Scenario: 手机验证码登录异常且缺少 Cap token
- **WHEN** `/auth/login/mobile` 请求命中 `mobileLogin` 异常触发策略且未携带有效 Cap token
- **THEN** 系统 SHALL 拒绝执行短信验证码校验和全局会话创建
- **AND** 响应 SHALL 使用可被前端稳定识别的业务码表示需要人机校验

#### Scenario: 手机验证码登录异常且 Cap token 有效
- **WHEN** `/auth/login/mobile` 请求命中 `mobileLogin` 异常触发策略且携带有效 Cap token
- **THEN** 系统 SHALL 消费该 Cap token
- **AND** 系统 SHALL 继续执行既有手机验证码登录成功或失败处理

#### Scenario: 登录请求未触发异常
- **WHEN** `/auth/login/password` 或 `/auth/login/mobile` 请求未命中对应异常触发策略
- **THEN** 系统 SHALL 不要求 Cap token
- **AND** 系统 SHALL 保持既有登录成功、失败计数和账号暂停行为

#### Scenario: 登录失败更新 Cap 异常状态
- **WHEN** 密码登录失败或手机验证码登录失败
- **THEN** 系统 SHALL 更新对应 action、subject、IP 和 Client header 的短窗口风险状态
- **AND** 系统 SHALL 保持既有用户维度登录失败计数和账号暂停规则
