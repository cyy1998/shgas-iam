# SHGAS IAM

本上下文定义 IAM 用户身份、档案和外部 SSO 集成中的核心领域语言，帮助区分稳定用户事实与协议会话事实。

## Language

**User Profile**:
IAM 中关于一个用户的稳定档案视图，包括用户基础身份信息、任职、角色和权限。
_Avoid_: session payload, protocol payload

**ORCAS Session Identity**:
Custom SSO Gateway 登录过程中由 ORCAS 返回、绑定到本次 local session 的外部身份信息；它不是 IAM 用户档案属性。
_Avoid_: user detail field, user profile attribute
