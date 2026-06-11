# JWT 认证与角色权限控制 — 实现文档

> 项目：CommunityMis（社区互助服务平台）  
> 分支：SpringBootDeveloping  
> 日期：2026-06-07

---

## 一、功能概览

| 功能 | 状态 | 说明 |
|------|:--:|------|
| 注册 | ✅ | 邮箱验证码 + BCrypt 密码加密 + 唯一性校验 |
| 登录 | ✅ | 用户名/密码验证 + 状态检查 + 签发 JWT |
| BCrypt 密码加密 | ✅ | 注册加密存储，登录密文比对 |
| JWT Token 签发/验证 | ✅ | HMAC-SHA256 签名，含 userId + role |
| **JWT 登录拦截器** | ✅ **本次实现** | 全局 Filter 自动认证，注入 SecurityContext |
| **角色权限控制** | ✅ **本次实现** | URL 级别 + 方法级别 RBAC |

---

## 二、项目架构

```
src/main/java/com/commis/communitymis/
├── security/
│   ├── SecurityConfig.java          ← Spring Security 核心配置（RBAC + JWT）
│   └── JwtAuthenticationFilter.java ← JWT 认证过滤器（本次新建）
├── common/utils/
│   └── JwtUtils.java               ← JWT 工具类（签发/解析/校验，含角色）
└── module/auth/
    ├── controller/
    │   └── AuthController.java      ← 认证接口（注册/登录/用户信息）
    ├── service/
    │   ├── AuthService.java
    │   └── impl/
    │       ├── AuthServiceImpl.java ← 认证业务逻辑
    │       └── SysUserServiceImpl.java
    ├── dto/
    │   ├── LoginDTO.java
    │   ├── RegisterDTO.java
    │   └── SendCodeDTO.java
    └── entity/
        └── SysUser.java             ← 用户实体（含 role 字段）
```

---

## 三、JWT 登录拦截器

### 3.1 工作流程

```
请求 → 是否在白名单？───→ 放行
           │ 否
           ▼
    提取 Authorization Header
    "Bearer eyJhbGciOi..."
           │ 无Token
           ▼
    JWT 签名+过期校验 ─── 无效/过期 → SecurityConfig 返回 401
           │ 有效
           ▼
    解析 userId + role (claim)
           │
           ▼
    数据库查询用户状态 ─── 不存在/禁用 → SecurityConfig 返回 401
           │ 存在且正常(status=1)
           ▼
    构建 Authentication 对象
    ├─ principal = userId
    └─ authorities = [ROLE_xxx]
           │
           ▼
    注入 SecurityContextHolder ← 后续业务代码可直接获取当前用户
           │
           ▼
    继续执行 filterChain
```

### 3.2 核心代码

**JwtAuthenticationFilter.java**

```java
@Slf4j
@Component
@RequiredArgsConstructor
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final JwtUtils jwtUtils;
    private final SysUserService sysUserService;

    private static final List<String> EXCLUDE_PATHS = List.of(
            "/auth/send-code", "/auth/register", "/auth/login"
    );

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                     HttpServletResponse response,
                                     FilterChain filterChain) {
        // 1. 白名单放行
        // 2. 提取 Bearer Token
        // 3. 校验 JWT
        // 4. 解析 userId + role
        // 5. 数据库验证用户状态
        // 6. 构建 UsernamePasswordAuthenticationToken → SecurityContextHolder
    }
}
```

### 3.3 设计要点

| 要点 | 说明 |
|------|------|
| **OncePerRequestFilter** | 保证每个请求只执行一次过滤 |
| **白名单优先** | 注册/登录等接口不拦截，与 SecurityConfig 保持一致 |
| **无 Token 不拒绝** | 不在 Filter 中返回 401，交给 SecurityConfig 的 `.authenticated()` 统一处理 |
| **数据库二次校验** | JWT 有效后仍查询用户状态，防止 Token 签发后用户被禁用 |
| **Filter 不重复注册** | 通过 `FilterRegistrationBean.setEnabled(false)` 禁止 Servlet 容器自动注册 |

---

## 四、角色权限控制（RBAC）

### 4.1 角色映射体系

| 数据库值 | 角色名 | Spring Security 角色 | 说明 |
|:---:|------|------|------|
| 1 | USER | `ROLE_USER` | 普通用户（注册默认角色） |
| 2 | ASSIGNEE | `ROLE_ASSIGNEE` | 接单者 |
| 3 | JUROR | `ROLE_JUROR` | 陪审员 |
| 4 | ADMIN | `ROLE_ADMIN` | 管理员 |
| 5 | SUPER_ADMIN | `ROLE_SUPER_ADMIN` | 超级管理员 |

### 4.2 URL 级别控制

**SecurityConfig.java — `authorizeHttpRequests` 配置：**

```java
.authorizeHttpRequests(auth -> auth
    // 白名单：无需登录
    .requestMatchers("/auth/send-code", "/auth/register", "/auth/login").permitAll()
    .requestMatchers("/test/**").permitAll()
    .requestMatchers("/error").permitAll()

    // 管理员接口：需要 ADMIN 或 SUPER_ADMIN
    .requestMatchers("/admin/**").hasAnyRole("ADMIN", "SUPER_ADMIN")

    // 其余接口：必须登录
    .anyRequest().authenticated()
)
```

**权限拦截效果：**

| 请求路径 | 未登录 | USER | ADMIN | SUPER_ADMIN |
|----------|:---:|:---:|:---:|:---:|
| `/auth/login` | ✅ | ✅ | ✅ | ✅ |
| `/auth/userinfo` | ❌ 401 | ✅ | ✅ | ✅ |
| `/admin/users` | ❌ 401 | ❌ 403 | ✅ | ✅ |
| `/admin/**` | ❌ 401 | ❌ 403 | ✅ | ✅ |

### 4.3 方法级别控制

通过 `@EnableMethodSecurity` 启用注解权限，支持三种注解：

```java
// 方式一：@PreAuthorize（推荐，支持 SpEL 表达式）
@PreAuthorize("hasRole('ADMIN')")
public Result<String> adminOnlyMethod() { ... }

@PreAuthorize("hasAnyRole('ADMIN', 'SUPER_ADMIN')")
public Result<String> managementMethod() { ... }

// 方式二：@Secured
@Secured("ROLE_ADMIN")
public Result<String> adminOnlyMethod() { ... }

// 方式三：@RolesAllowed
@RolesAllowed("ADMIN")
public Result<String> adminOnlyMethod() { ... }
```

### 4.4 JWT Token 中的角色

Token Payload 结构（解码后）：

```json
{
  "sub": "1",         // 用户ID
  "role": 4,          // 角色编号
  "iat": 1717747200,  // 签发时间
  "exp": 1717833600   // 过期时间（24小时后）
}
```

---

## 五、统一异常响应

### 5.1 401 — 未认证

**触发场景：** 未携带 Token / Token 过期 / Token 无效 / 用户被禁用

```json
{
  "code": 401,
  "message": "未登录或Token已过期",
  "data": null
}
```

### 5.2 403 — 权限不足

**触发场景：** 已登录但角色权限不满足 URL 规则或方法注解要求

```json
{
  "code": 403,
  "message": "权限不足",
  "data": null
}
```

---

## 六、接口调用示例

### 6.1 注册

```http
POST /api/auth/register
Content-Type: application/json

{
  "username": "testuser",
  "password": "123456",
  "confirmPassword": "123456",
  "email": "test@example.com",
  "phone": "13800138000",
  "verifyCode": "123456"
}
```

### 6.2 登录（获取 JWT）

```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "testuser",
  "password": "123456"
}

响应：
{
  "code": 200,
  "message": "登录成功",
  "data": "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIiwicm9sZSI6NCw..."
}
```

### 6.3 携带 Token 访问受保护接口

```http
GET /api/auth/userinfo
Authorization: Bearer eyJhbGciOiJIUzI1NiJ9...

响应：
{
  "code": 200,
  "message": "操作成功",
  "data": {
    "id": 1,
    "username": "testuser",
    "role": 4,
    "status": 1,
    ...
  }
}
```

### 6.4 无 Token 访问 → 401

```http
GET /api/auth/userinfo

响应：
{
  "code": 401,
  "message": "未登录或Token已过期",
  "data": null
}
```

---

## 七、文件变更清单

| 操作 | 文件 | 变更说明 |
|:--:|------|------|
| **新建** | `security/JwtAuthenticationFilter.java` | JWT 认证过滤器，自动识别用户身份并注入 SecurityContext |
| **重写** | `security/SecurityConfig.java` | 启用 `@EnableMethodSecurity`；配置 URL 角色规则；注册 JWT 过滤器；配置 CORS；配置统一 401/403 响应 |
| **修改** | `common/utils/JwtUtils.java` | `generateToken` 增加 `role` 参数；新增 `getRoleFromToken` 方法 |
| **修改** | `auth/service/impl/AuthServiceImpl.java` | 登录时 `jwtUtils.generateToken(userId, role)` |
| **修改** | `auth/controller/AuthController.java` | `userInfo` 改为从 `SecurityContextHolder` 获取当前用户 |

---

## 八、扩展指南

### 如何添加一个新角色？

1. 数据库 `sys_user.role` 中定义新编号（如 `6`）
2. `JwtAuthenticationFilter.mapRoleCode()` 中添加映射
3. `SecurityConfig` 中使用对应的角色名配置权限

### 如何添加一个新的受保护接口？

URL 级别：在 `SecurityConfig.authorizeHttpRequests()` 中添加规则  
方法级别：在 Controller 方法上添加 `@PreAuthorize` 注解

```java
// URL 级别
.requestMatchers("/order/create").hasAnyRole("USER", "ASSIGNEE")

// 方法级别
@PostMapping("/order/create")
@PreAuthorize("hasAnyRole('USER', 'ASSIGNEE')")
public Result<String> createOrder() { ... }
```

### 如何获取当前登录用户？

```java
// 获取用户ID
Long userId = (Long) SecurityContextHolder.getContext()
        .getAuthentication().getPrincipal();

// 检查角色
boolean isAdmin = SecurityContextHolder.getContext()
        .getAuthentication().getAuthorities().stream()
        .anyMatch(a -> a.getAuthority().equals("ROLE_ADMIN"));
```
