---
status: accepted
---

# 资源属性模型随资源所有者维护

Client Authorization Contract 的可编辑源定义放在资源所属业务仓库，并以跨语言、机器可读的版本化 schema 作为发布产物；IAM 只登记经过审核的不可变 Authorization Contract Revision、内容摘要和发布元数据，不提供另一份可直接编辑的业务模型。IAM 仓库继续拥有公共主体、上下文和决策信封契约。该选择让资源模型与领域代码共同演进，同时通过中央注册、兼容性检查和签名发布实现治理，避免业务仓库与 IAM 数据库形成两个可写事实来源。
