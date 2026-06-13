# 邻帮社区互助平台

## 本地启动

要求 Node.js 18.18 或更高版本。首次启动前安装依赖：

```bash
npm install
```

```bash
npm run dev
```

默认服务：

- 前端生产页面：http://127.0.0.1:5173
- 后端健康检查：http://127.0.0.1:3001/api/health
- 前端路由清单：http://127.0.0.1:5173/routes.json

也可以分别启动：

```bash
npm run dev:frontend
npm run dev:backend
```

## 生产部署

后端生产模式按单机 Node.js + MySQL 8+ 设计。复制 `.env.example` 为实际环境变量，先执行迁移再启动服务：

```bash
npm run db:migrate
npm run db:verify
npm start
```

关键约束：

- `NODE_ENV=production` 时必须使用 `AUTH_STORE=mysql`，并配置 `AUTH_SESSION_SECRET`、`DB_*`、`CORS_ORIGIN`、上传目录、SMTP 授权码和 OpenAI-compatible API 变量。
- 注册链路正式使用邮箱验证码；`REGISTRATION_VERIFICATION=email`，不启用手机短信验证码。
- 认证以 HTTP-only `sid` Cookie 为准；浏览器请求必须使用 `credentials: "include"`。
- 登录后会设置非 HTTP-only `csrf_token` Cookie，所有 `POST`、`PUT`、`PATCH`、`DELETE` 请求需带 `X-CSRF-Token`。
- `/api/health` 只表示进程存活，`/api/ready` 会检查 MySQL、全量迁移 checksum、上传目录可写和关键外部服务配置状态，响应不会包含密钥或 SMTP 配置值。
- `database/seeds` 里的演示账号只适合开发/测试；生产部署只运行 `npm run db:migrate`，不要运行 seed。`npm run db:seed` 默认拒绝 `NODE_ENV=production`。

## 生产路由

前端沿用 `frontend/public/ui` 中从设计原型整理出的视觉资源，并通过浏览器运行时脚本调用后端 `/api/*` 接口加载真实数据。示例：

- 用户端：`/feed`、`/tasks`、`/post`、`/messages`、`/profile`
- 详情页：`/posts/:id`、`/orders/:id`、`/users/:id`、`/disputes/:id`
- 管理端：`/admin/login`、`/admin/dashboard`、`/admin/users`、`/admin/ai/config`

旧原型 URL 例如 `/screens/feed.html` 会重定向到对应生产路由 `/feed`。

## 验收

```bash
npm test
```

验收脚本会检查 41 个 HTML 原型路由覆盖、链接改写、公共组件占位、后端健康检查、前端路由可访问性，以及阶段 02-23 的认证、任务、订单、钱包、纠纷、评价、消息、后台治理、AI 治理和生产上线链路。

阶段 22 全链路验收可单独执行：

```bash
npm run test:stage22
```

阶段 23 生产上线链路验收可单独执行：

```bash
npm run test:stage23
```

## 演示账号

内存模式和种子数据默认提供以下账号：

- 普通用户 A：`user_a / user123456`
- 普通用户 B：`user_b / user123456`
- 普通用户 C：`user_c / user123456`
- 禁用用户：`disabled_user / user123456`
- 管理员：`admin_main / admin123456`

本地一键启动后访问：

- 用户端：http://127.0.0.1:5173/login
- 管理端：http://127.0.0.1:5173/admin/login

## 本地数据库

阶段 02 提供 MySQL 8.0+ 迁移和种子数据：

- 迁移脚本：`database/migrations/0002_stage_02_schema.sql`
- 种子数据：`database/seeds/0002_stage_02_seed.sql`
- 本地一键初始化：`npm run db:init`
- 仅执行迁移：`npm run db:migrate`
- 校验迁移 checksum：`npm run db:verify`
- 仅导入种子：`npm run db:seed`

默认连接参数为 `DB_HOST=127.0.0.1`、`DB_PORT=3306`、`DB_USER=root`、`DB_PASSWORD=`、`DB_NAME=community_mis`。可通过环境变量覆盖，例如：

```bash
DB_PASSWORD=your_password DB_NAME=community_mis npm run db:init
```

`db:init` 只适合本地开发，会创建数据库并按顺序执行 `database/migrations/*.sql` 和 `database/seeds/*.sql`。生产环境会拒绝执行 `db:init`，应使用 `db:migrate`。种子数据使用固定 ID 和 `ON DUPLICATE KEY UPDATE`，重复执行不会产生重复基础数据。
