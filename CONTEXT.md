# SHGAS IAM

本上下文定义 IAM 用户身份、档案和外部 SSO 集成中的核心领域语言，帮助区分稳定用户事实与协议会话事实。

## Language

**User Profile**:
IAM 中关于一个用户的稳定档案视图，包括用户基础身份信息、任职、角色和权限。
_Avoid_: session payload, protocol payload

**Effective Role**:
对一条有效任职生效的启用角色；只有任职及其岗位、任职组织、角色分配目标和角色均启用且未删除时才生效。用户自身状态不属于该概念，由使用方单独判断。
_Avoid_: parsed role, assigned role

**ORCAS Session Identity**:
Custom SSO Gateway 登录过程中由 ORCAS 返回、绑定到本次 local session 的外部身份信息；它不是 IAM 用户档案属性。
_Avoid_: user detail field, user profile attribute

**Custom SSO Authorization Grant**:
基于有效 IAM 登录身份、授予指定 client 一次性继续 Custom SSO 登录的权利。兑现结果按 client 接入模式是
Independent Client Credential 或 Gateway Local Session，grant 本身不是任一登录会话。
_Avoid_: local session, client session

**Independent Client Credential**:
IAM 向 Independent client 签发并管理的 client-scoped credential；第三方可以据此建立自己的本地会话，但该会话不属于 IAM。
_Avoid_: third-party local session, IAM-created third-party session

**Gateway Local Session**:
IAM 为 Gateway client 建立并管理的 client-scoped 登录会话。
_Avoid_: Independent Client Credential, third-party local session

**Account Recovery**:
用户无法正常登录时，通过已绑定身份凭据重新取得 IAM 账号访问权的自助过程；它不包括普通登录或管理员代为重置凭据。
_Avoid_: open flow, public password helper

**User Resignation**:
管理员原子地结束用户全部有效任职并禁用其 IAM 账号，随后终止该用户全部活跃访问会话的业务流程；会话终止失败不撤销已生效的离职结果。重复执行仍视为成功并再次尝试终止全部会话；它不同于删除单条任职或删除用户。
_Avoid_: employment deletion, user deletion

**OIDC Claims Snapshot**:
OIDC token 签发时按账号、client、scope 和授权状态固化的声明视图；后续读取不得把新的档案或授权事实混入既有 token。
_Avoid_: live user profile, current authorization view
