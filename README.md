## 项目结构

```
iam-service/
├── src/                          # 源代码目录
│   ├── app.ts                    # Hono应用主文件，路由注册
│   ├── index.ts                  # 服务入口点
│   ├── env.ts                    # 环境变量配置与验证
│   ├── db/                       # 数据库相关
│   │   ├── generated/            # Prisma生成的类型和客户端
│   │   │   ├── prisma/          # Prisma客户端和类型定义
│   │   │   └── schemas/         # Zod模式定义
│   │   └── sql/                  # 原始SQL脚本
│   │       ├── iam/             # IAM相关SQL
│   │       └── scripts/         # 数据同步和维护脚本
│   ├── enums/                    # 枚举定义
│   ├── errors/                   # 自定义错误类
│   ├── lib/                      # 库和工具
│   │   ├── clients/             # 外部客户端（如Redis、Pino）
│   │   ├── core/                # 核心工具（OpenAPI、应用创建）
│   │   └── pagination/          # 分页工具
│   ├── middlewares/              # Hono中间件
│   ├── routes/                   # API路由
│   │   ├── admin/               # 管理后台API
│   │   │   ├── client/         # 客户端管理
│   │   │   ├── employment/     # 雇佣关系管理
│   │   │   ├── organization/   # 组织管理
│   │   │   ├── position/       # 职位管理
│   │   │   └── user/           # 用户管理
│   │   ├── auth/                # 认证相关路由
│   │   ├── internal/            # 内部服务调用路由
│   │   ├── open/                # 公开API路由
│   │   ├── public/              # 公共API路由
│   │   └── sso/                 # 单点登录路由
│   ├── services/                # 业务逻辑服务层
│   │   ├── client/              # 客户端服务
│   │   ├── delegation/          # 权限委托服务
│   │   ├── employment/          # 雇佣关系服务
│   │   ├── mobile/              # 移动端服务
│   │   ├── organization/        # 组织服务
│   │   ├── position/            # 职位服务
│   │   ├── privilege/           # 权限服务
│   │   ├── role/                # 角色服务
│   │   ├── session/             # 会话服务
│   │   └── user/                # 用户服务
│   └── utils/                   # 工具函数
│       ├── http/                # HTTP相关工具
│       └── zod/                 # Zod模式工具
├── static/                       # 静态文件
│   └── swagger/                 # Swagger UI资源
├── scripts/                      # 部署和维护脚本
│   └── set-tender-privileges.sh # 设置招标权限脚本
├── debug/                        # 调试工具
├── prisma.config.ts              # Prisma配置
├── pnpm-workspace.yaml           # pnpm工作区配置
├── tsconfig.json                 # TypeScript配置
├── eslint.config.js              # ESLint配置
└── package.json                  # 项目依赖和脚本
```
