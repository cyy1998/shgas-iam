# 供应商联系人登记

新建和复用都在事务内按手机号取得同一 advisory lock，再查询当前事实。事务外的预读只用于选择起始路径。
所有登记入口复用同一用例和锁键，手机号可在全库重复。
[登记用例](register-purveyor-contact.use-case.ts) · [锁实现](../../../services/user/user.repository.ts)
