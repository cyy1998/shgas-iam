import type {
  AuthenticationLoginFailureStatus,
  AuthenticationLoginRestrictionStatus,
} from "./login-restriction.type";

export function formatLoginFailureMessage(prefix: string, result: AuthenticationLoginFailureStatus) {
  const failureMessage = [
    prefix,
    `当前已连续失败 ${result.failureCount} 次`,
    `距离临时限制还有 ${result.remainingAttempts} 次`,
  ].join("，");
  return result.restriction === null
    ? failureMessage
    : `${failureMessage}，${formatTemporaryLoginRestrictionMessage(result.restriction)}`;
}

export function formatTemporaryLoginRestrictionMessage(restriction: AuthenticationLoginRestrictionStatus) {
  const triggerMethod = restriction.triggerMethod === "password"
    ? "密码"
    : restriction.triggerMethod === "mobile"
      ? "手机验证码"
      : "未知";
  const remainingMinutes = Math.max(1, Math.ceil(restriction.remainingSeconds / 60));
  return [
    "账号已被临时限制",
    "原因：登录失败次数过多",
    `最后触发方式：${triggerMethod}`,
    `距离解封还有 ${remainingMinutes} 分钟`,
    "请稍后再试",
  ].join("，");
}
