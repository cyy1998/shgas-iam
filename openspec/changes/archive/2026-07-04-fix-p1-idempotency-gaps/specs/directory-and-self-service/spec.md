## ADDED Requirements

### Requirement: Business verification codes are confirmed after successful writes
系统 SHALL 对包含数据库写入事务的业务验证码使用 reserve/confirm 消费语义，使业务写入失败不会提前消耗合法验证码。

#### Scenario: resetPassword 事务失败后验证码可重试
- **WHEN** resetPassword 验证码匹配且业务在保存新密码事务中失败
- **THEN** 系统 SHALL NOT 确认消费该 `mobile-code:resetPassword:<phone>` 验证码
- **AND** 用户 SHALL 能使用同一验证码再次发起 resetPassword

#### Scenario: resetPassword 成功后验证码不可重放
- **WHEN** resetPassword 验证码匹配且新密码保存成功
- **THEN** 系统 SHALL 确认消费该 `mobile-code:resetPassword:<phone>` 验证码
- **AND** 后续使用同一验证码的 resetPassword SHALL 视为验证码错误

#### Scenario: bindPhone 事务失败后验证码可重试
- **WHEN** bindPhone 验证码匹配且业务在更新手机号事务中失败
- **THEN** 系统 SHALL NOT 确认消费该 `mobile-code:bindPhone:<phone>` 验证码
- **AND** 用户 SHALL 能使用同一验证码再次发起 bindPhone

#### Scenario: bindPhone 成功后验证码不可重放
- **WHEN** bindPhone 验证码匹配且手机号更新成功
- **THEN** 系统 SHALL 确认消费该 `mobile-code:bindPhone:<phone>` 验证码
- **AND** 后续使用同一验证码绑定手机号 SHALL 视为验证码错误
