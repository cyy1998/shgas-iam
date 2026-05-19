## 1. 测试基础设施

- [x] 1.1 新增 `apps/api/src/services/user/__tests__/user.service.test.ts`，使用 `bun:test`、`mock.module` 和动态 import 建立 public user service 测试骨架
- [x] 1.2 新增 `apps/admin-api/src/services/user/__tests__/user.service.test.ts`，使用 `bun:test`、`mock.module` 和动态 import 建立 admin user service 测试骨架
- [x] 1.3 在两个测试文件中 mock `@iam/db`，使 `db.transaction` 使用同一个稳定 `tx` 对象执行 callback
- [x] 1.4 在 public 测试中 mock user、employment、role、privilege、privilegeDelegation repository、`mobileService`、`@api/env`、`bcrypt-ts`
- [x] 1.5 在 admin 测试中 mock user、employment、role、privilege repository、`@admin-api/env`、`bcrypt-ts`、`@iam/api-core/utils`
- [x] 1.6 准备满足现有 DTO schema parse 的最小 user、employment、role、privilege、privilegeDelegation fixture

## 2. public API 用户服务测试

- [x] 2.1 为 `setPassword` 覆盖用户不存在、新旧密码相同、旧密码错误、新密码长度不足、缺少字母、缺少数字的错误分支
- [x] 2.2 为 `setPassword` 覆盖成功分支，断言 `hash(newPassword, PASSWORD_HASH_ROUNDS)`、`userRepository.setPassword(user.id, hashedPassword, tx)` 和返回 true
- [x] 2.3 为 `resetPassword` 覆盖用户不存在、手机号不匹配、验证码错误的错误分支
- [x] 2.4 为 `resetPassword` 覆盖成功分支，断言 hash、`setPassword(user.id, hashedPassword, tx)` 和返回 true
- [x] 2.5 为 `resetPassword` 增加现状锁定测试或测试说明，记录当前实现未复用密码强度校验为待确认风险，不修改业务实现
- [x] 2.6 为 `checkPassword` 覆盖用户不存在、production 无密码返回 false、非 production 默认密码返回 true、非默认密码返回 false
- [x] 2.7 为 `checkPassword` 覆盖有密码时调用 `compare(inputPassword, user.password)`，并透传 true/false 结果
- [x] 2.8 为 `setMobile` 覆盖手机号格式无效、手机号已存在、验证码错误和成功写入分支
- [x] 2.9 为 `setMobile` 断言格式校验、重复手机号检查、验证码检查、写入手机号的调用顺序，并验证成功后返回 `getUserDetailById(userId)` 的结果
- [x] 2.10 为 `pauseEnabledUser` 覆盖调用 `updateEnabledUserStatus(userId, UserStatus.Pause)`，并透传用户或 null
- [x] 2.11 为 `searchUsersWithPrivilegeDelegation` 覆盖 `ancestorOrgCodes` 为空或数量不为 1 时抛出固定错误
- [x] 2.12 为 `searchUsersWithPrivilegeDelegation` 覆盖正常查询，断言 user repository、delegation repository 调用参数，以及 users/delegations DTO 映射结果

## 3. admin API 用户管理服务测试

- [x] 3.1 为 `setUserForAdmin` 覆盖 username 已存在时抛出“用户名已存在”
- [x] 3.2 为 `setUserForAdmin` 覆盖 dto.password 存在时使用该密码 hash、创建用户并返回 `generatedPassword=null`
- [x] 3.3 为 `setUserForAdmin` 覆盖 dto.password 不存在时调用 `generateRandomPassword(8)`、hash 生成密码、创建用户并返回 generatedPassword
- [x] 3.4 为 `setUserForAdmin` 断言创建数据包含 username、name、userType、password、mobile、wxId、status、orderNum，并验证 status、orderNum、mobile、wxId 缺省值
- [x] 3.5 为 `updateUser` 覆盖用户不存在抛出“用户不存在”，以及用户存在时调用 `updateUserByUsername(username, data, tx)` 并返回 true
- [x] 3.6 为 `updateUserStatus` 覆盖其调用 `updateUser(username, { status })` 的行为并返回 true
- [x] 3.7 为 `deleteUser` 覆盖用户不存在、存在有效任职抛出 `UserHasActiveEmploymentError`、无有效任职时软删除并返回 true
- [x] 3.8 为 `resetPasswordByUsername` 覆盖用户不存在、生成 8 位密码、hash、调用 `setPassword(user.id, newPasswordHash, tx)` 并返回新明文密码
- [x] 3.9 为 `searchUsersFuzzyForAdmin` 覆盖 rows 通过 `UserDtoSchema` 映射、total 为 0 时 pages 为 0、total 大于 0 时 pages 为 `Math.ceil(total / pageSize)`
- [x] 3.10 为 `getUserDetailByUsernameForAdmin` 覆盖用户不存在抛出“用户不存在”
- [x] 3.11 为 `getUserDetailByUsernameForAdmin` 覆盖用户存在时聚合 employments、roles、privileges，断言 roles/privileges 去重，并验证 employment detail 包含岗位、组织、公司、角色、权限信息

## 4. 验证与收尾

- [x] 4.1 运行 `bun test apps/api/src/services/user/__tests__/user.service.test.ts` 并修正测试自身问题
- [x] 4.2 运行 `bun test apps/admin-api/src/services/user/__tests__/user.service.test.ts` 并修正测试自身问题
- [x] 4.3 运行全量 `bun test`，记录并区分本 change 引入的问题与仓库既有失败
- [x] 4.4 确认本 change 未修改业务实现逻辑；若测试揭示明确 bug，将风险和待确认点记录在实现结果中，等待单独确认
