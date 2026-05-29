src
├── api/                # 【核心】接口层 → 完全对齐后端module
│   ├── auth/           # 登录、注册、用户信息（对应后端auth模块）
│   ├── wallet/         # 钱包接口（对应后端wallet模块）
│   ├── demand/         # 需求接口（对应后端demand模块）
│   └── request.js      # Axios 封装（JWT+统一响应）
├── router/             # 路由 + 登录拦截
├── stores/             # Pinia 存储用户Token、信息
├── utils/              # 通用工具（提示、格式化）
├── views/              # 页面 → 对齐后端模块
│   ├── auth/           # 登录页、注册页
│   ├── wallet/         # 钱包页面
│   ├── demand/         # 需求页面
│   └── home.vue        # 首页
├── components/          # 公共组件
├── App.vue
└── main.js

---------------------------------------------------
相关前端代码，有瑕疵
  linbang-vue/src/
  ├── main.js                          (250B)   入口
  ├── App.vue                          (139B)   根组件
  ├── assets/tokens.css                (9.5KB)  全局设计令牌
  ├── stores/auth.js                   (1.2KB)  认证状态
  ├── stores/toast.js                  (487B)   Toast状态
  ├── api/request.js                   (583B)   Axios封装
  ├── router/index.js                  (1.2KB)  路由+守卫
  ├── components/TopNav.vue            (1.4KB)  导航栏
  ├── components/AppFooter.vue         (281B)   页脚
  ├── components/AiChatFAB.vue         (3.1KB)  AI助手
  ├── components/AppToast.vue          (995B)   Toast组件
  ├── views/HomePage.vue               (5.8KB)  首页
  ├── views/AuthPage.vue               (11KB)   登录注册
  ├── views/DemandHallPage.vue         (15KB)   需求大厅
  ├── views/ProfilePage.vue            (10KB)   个人中心
  ├── views/DisputePage.vue            (11KB)   纠纷法庭
  └── views/AdminPage.vue              (15KB)   管理后台