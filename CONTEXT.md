# SHGAS IAM

本上下文定义 IAM 用户身份、档案和外部 SSO 集成中的核心领域语言，帮助区分稳定用户事实与协议会话事实。

## Language

**User Profile**:
IAM 中关于一个用户的稳定档案视图，包括用户基础身份信息、任职、角色和权限。
_Avoid_: session payload, protocol payload

**ORCAS Session Identity**:
Custom SSO Gateway 登录过程中由 ORCAS 返回、绑定到本次 local session 的外部身份信息；它不是 IAM 用户档案属性。
_Avoid_: user detail field, user profile attribute

**Account Recovery**:
用户无法正常登录时，通过已绑定身份凭据重新取得 IAM 账号访问权的自助过程；它不包括普通登录或管理员代为重置凭据。
_Avoid_: open flow, public password helper

**User Resignation**:
管理员原子地结束用户全部有效任职并禁用其 IAM 账号，随后终止该用户全部活跃访问会话的业务流程；会话终止失败不撤销已生效的离职结果。重复执行仍视为成功并再次尝试终止全部会话；它不同于删除单条任职或删除用户。
_Avoid_: employment deletion, user deletion

**OIDC Claims Snapshot**:
OIDC token 签发时按账号、client、scope 和授权状态固化的声明视图；后续读取不得把新的档案或授权事实混入既有 token。
_Avoid_: live user profile, current authorization view
