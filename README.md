com.commis.communitymis
├── CommunityMisApplication.java          # 启动类（已存在）
├── common/                               # 公共模块
│   ├── config/                           # 配置类（上面3个配置放这里）
│   ├── exception/                        # 全局异常处理
│   ├── response/                         # 统一响应体
│   ├── annotation/                       # 自定义注解
│   └── utils/                            # 工具类（JWT、雪花ID等）
├── module/                               # 业务模块
│   ├── auth/                             # F01 用户认证模块
│   │   ├── controller/ AuthController.java
│   │   ├── service/ AuthService.java
│   │   ├── mapper/ UserMapper.java
│   │   ├── entity/ SysUser.java
│   │   └── dto/ LoginDTO.java, RegisterDTO.java
│   ├── wallet/                           # F02 钱包模块
│   ├── demand/                           # F03 需求模块
│   └── ...（其他模块按此结构创建）
└── security/                             # 安全模块
    ├── JwtTokenProvider.java
    ├── JwtAuthenticationFilter.java
    └── SecurityConfig.java                 # Spring Security 配置


---
  架构分层

  项目采用 按功能模块分包 + 模块内分层 的混合架构：

  Controller（@RestController）→ Service（接口+实现）→ Mapper（MyBatis-Plus BaseMapper）

  每个 module/ 下的子模块（如 auth）内部独立拥有 controller、dto、entity、mapper、service 五层，职责边界清晰。

  ---
  关键设计决策

  1. 统一响应模式

  Result<T> 封装所有 API 返回值，提供 Result.success() / Result.error() 静态工厂方法，确保前端接收一致的数据结构。

  2. 无状态 JWT 认证体系

  Spring Security 配置了 SessionCreationPolicy.STATELESS + 禁用 CSRF，已引入 jjwt（0.12.5）三件套，预留了 JWT Filter
  的接入点。目前处于 permitAll() 的开放模式，方便早期开发。

  3. MyBatis-Plus 增强配置

  - 分页插件：PaginationInnerInterceptor，指定 MySQL 方言
  - 乐观锁插件：OptimisticLockerInnerInterceptor，用于钱包余额等并发敏感场景
  - 逻辑删除：deleted 字段标记（1=已删除, 0=未删除）
  - 主键策略：数据库自增（IdType.AUTO）
  - Mapper 扫描：通配符 com.commis.communitymis.module.*.mapper，新增模块自动生效

  4. 事务管理

  通过 @EnableTransactionManagement 全局开启，注释提到"钱包/余额操作需要事务保障"——说明业务方向涉及资金流转。

  ---
  依赖关系图

  spring-boot-starter-web          ← REST API 基础
  spring-boot-starter-security     ← 认证授权框架
  spring-boot-starter-validation   ← Jakarta Bean Validation
  mybatis-plus-spring-boot3-starter ← ORM（Spring Boot 3 适配版）
  mysql-connector-j                ← MySQL JDBC 驱动
  jjwt (api + impl + jackson)      ← JWT 令牌生成/解析
  lombok                           ← 代码简化
  spring-boot-devtools             ← 开发热重载

  ---
  待完善的部分

  ┌──────────────────────┬──────────────────────────────────────────────┐
  │         项目         │                     状态                     │
  ├──────────────────────┼──────────────────────────────────────────────┤
  │ module/auth 认证模块 │ 目录骨架已建，代码未实现                     │
  ├──────────────────────┼──────────────────────────────────────────────┤
  │ 全局异常处理器       │ common/exception/ 为空                       │
  ├──────────────────────┼──────────────────────────────────────────────┤
  │ 自定义注解           │ common/annotation/ 为空                      │
  ├──────────────────────┼──────────────────────────────────────────────┤
  │ 工具类               │ common/utils/ 为空                           │
  ├──────────────────────┼──────────────────────────────────────────────┤
  │ Mapper XML           │ resources/mapper/ 目录不存在                 │
  ├──────────────────────┼──────────────────────────────────────────────┤
  │ 数据库密码           │ application-dev.yml 中明文存储远程数据库凭据 │
  └──────────────────────┴──────────────────────────────────────────────┘
