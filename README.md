# 邻帮社区互助平台

## 本地启动

当前阶段使用零依赖 Node.js 骨架，不需要先安装第三方包。要求 Node.js 18.18 或更高版本。

```bash
npm run dev
```

默认服务：

- 前端原型路由：http://127.0.0.1:5173
- 后端健康检查：http://127.0.0.1:3001/api/health
- 前端路由清单：http://127.0.0.1:5173/routes.json

也可以分别启动：

```bash
npm run dev:frontend
npm run dev:backend
```

## 阶段 01 路由

`UISource/index.html` 保持为入口页，`UISource/screens/*.html` 每个原型页面映射为独立生产路由。示例：

- 用户端：`/feed`、`/tasks`、`/post`、`/messages`、`/profile`
- 详情页演示入口：`/posts/demo`、`/orders/demo`、`/users/demo`、`/disputes/demo`
- 管理端：`/admin/login`、`/admin/dashboard`、`/admin/users`、`/admin/ai/config`

旧原型 URL 例如 `/screens/feed.html` 会重定向到对应生产路由 `/feed`。

## 验收

```bash
npm test
```

验收脚本会检查 41 个 HTML 原型路由覆盖、链接改写、公共组件占位、后端健康检查、前端路由可访问性，以及阶段 02-22 的认证、任务、订单、钱包、纠纷、评价、消息、后台治理和 AI 治理链路。

阶段 22 全链路验收可单独执行：

```bash
npm run test:stage22
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
- 一键初始化：`npm run db:init`

默认连接参数为 `DB_HOST=127.0.0.1`、`DB_PORT=3306`、`DB_USER=root`、`DB_PASSWORD=`、`DB_NAME=community_mis`。可通过环境变量覆盖，例如：

```bash
DB_PASSWORD=your_password DB_NAME=community_mis npm run db:init
```

初始化脚本会创建数据库并按顺序执行 `database/migrations/*.sql` 和 `database/seeds/*.sql`。种子数据使用固定 ID 和 `ON DUPLICATE KEY UPDATE`，重复执行不会产生重复基础数据。
