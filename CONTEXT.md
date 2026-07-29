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

**Valid Principal Session**:
用户完成 IAM 身份验证后形成、尚未过期且未被撤销的根登录会话；客户端是否仍打开不影响其有效性。
_Avoid_: online session, 在线会话

**Temporary Login Restriction**:
用户在统计窗口内登录失败次数过多后受到的用户级临时登录限制；它只阻止新的认证，不撤销已有会话，也不是账号禁用或永久黑名单。
_Avoid_: blacklist, 黑名单, disabled account

**Login Restriction Trigger Method**:
使登录失败计数达到限制阈值的最后一种认证方式；它不表示该认证方式独自产生了全部失败。
_Avoid_: restriction cause, failure breakdown

**Session Origin**:
登录时观测到的客户端 IP 和由 User-Agent 推断的粗粒度设备描述；它只用于调查提示，不是可信设备身份或授权依据。
_Avoid_: trusted device, device identity, device fingerprint

**Session Revocation**:
使 IAM 管理的登录会话及其派生访问不再被 IAM 接受的终止操作；它不阻止未来登录，外围清理失败不会恢复其有效性，第三方自行建立的本地会话不在其保证范围内。
_Avoid_: guaranteed third-party logout, reversible logout
