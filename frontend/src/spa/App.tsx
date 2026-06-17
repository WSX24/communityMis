import React, { Suspense } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import type { ApiClient } from "./api";
import { useAuth } from "./auth";
import { setMonitoringUser } from "./monitoring";
import { adminNav, appRoutes, routeById, userNav } from "./routes";
import type { AppRoute, RuntimeConfig } from "./types";
import { EntryPage } from "./pages/EntryPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { LoginPage, RegisterPage } from "./pages/AuthPages";
import { FeedPage } from "./pages/FeedPage";
import { TasksPage, RequestDetailPage, PostPage } from "./pages/RequestsPages";
import { OrdersPage, OrderDetailPage, ReviewPage } from "./pages/OrdersPages";
import { DisputeCreatePage, DisputeDetailPage, JuryVotingPage } from "./pages/DisputesPages";
import { WalletPage, WalletFreezePage } from "./pages/WalletPages";
import { MessagesPage, NotificationsPage } from "./pages/MessagesPages";
import { AiAssistantPage, AiResultsPage } from "./pages/AiPages";
import { ProfilePage, SettingsPage, UserPublicPage, CreditPage, HelpPage } from "./pages/ProfilePages";
import { AdminDashboardPage, AdminGenericPage, AdminSystemPage } from "./pages/AdminPages";

type PageProps = {
  api: ApiClient;
  config: RuntimeConfig;
  route: AppRoute;
};

export function App({ api, config }: { api: ApiClient; config: RuntimeConfig }) {
  return (
    <Routes>
      {appRoutes.map((route) => (
        <Route
          key={route.id}
          path={route.path}
          element={<RouteFrame api={api} config={config} route={route} />}
        />
      ))}
      <Route
        path="/jury/disputes/:id"
        element={<RouteFrame api={api} config={config} route={routeById("jury-voting")!} />}
      />
      <Route path="*" element={<NotFoundPage routes={appRoutes} />} />
    </Routes>
  );
}

function RouteFrame(props: PageProps) {
  const { route } = props;
  const auth = useAuth();
  const location = useLocation();

  React.useEffect(() => {
    document.title = `${route.title} - 邻帮`;
    document.documentElement.dataset.routeId = route.id;
    document.documentElement.dataset.routeSurface = route.surface;
    setMonitoringUser(auth.session?.user ?? null);
  }, [auth.session?.user, route.id, route.surface, route.title]);

  if (auth.loading && route.surface !== "launcher") {
    return <LoadingScreen />;
  }
  if (route.surface === "user" && !auth.session) {
    return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname)}`} replace />;
  }
  if (route.surface === "admin" && (!auth.session || !["admin", "super_admin"].includes(auth.session.user.role))) {
    return <Navigate to={`/admin/login?redirect=${encodeURIComponent(location.pathname)}`} replace />;
  }
  if (route.surface === "userAuth" && auth.session?.user.role === "user") {
    return <Navigate to="/feed" replace />;
  }
  if (route.surface === "adminAuth" && auth.session && ["admin", "super_admin"].includes(auth.session.user.role)) {
    return <Navigate to="/admin/dashboard" replace />;
  }

  const page = (
    <Suspense fallback={<LoadingScreen />}>
      <PageSwitch {...props} />
    </Suspense>
  );

  if (route.layout === "adminShell") {
    return <AdminShell route={route}>{page}</AdminShell>;
  }
  if (route.layout === "userShell") {
    return <UserShell route={route}>{page}</UserShell>;
  }
  return page;
}

function PageSwitch(props: PageProps) {
  switch (props.route.id) {
    case "entry": return <EntryPage />;
    case "login": return <LoginPage api={props.api} />;
    case "register": return <RegisterPage api={props.api} />;
    case "feed": return <FeedPage api={props.api} />;
    case "tasks": return <TasksPage api={props.api} />;
    case "post": return <PostPage api={props.api} />;
    case "post-detail": return <RequestDetailPage api={props.api} />;
    case "orders": return <OrdersPage api={props.api} />;
    case "order-detail": return <OrderDetailPage api={props.api} />;
    case "review": return <ReviewPage api={props.api} />;
    case "dispute-create": return <DisputeCreatePage api={props.api} />;
    case "dispute-detail": return <DisputeDetailPage api={props.api} />;
    case "jury-voting": return <JuryVotingPage api={props.api} />;
    case "wallet": return <WalletPage api={props.api} />;
    case "wallet-freeze": return <WalletFreezePage api={props.api} />;
    case "messages": return <MessagesPage api={props.api} />;
    case "notifications": return <NotificationsPage api={props.api} />;
    case "ai-assistant": return <AiAssistantPage api={props.api} />;
    case "ai-results": return <AiResultsPage api={props.api} />;
    case "profile": return <ProfilePage api={props.api} />;
    case "settings": return <SettingsPage api={props.api} />;
    case "user-public": return <UserPublicPage api={props.api} />;
    case "credit": return <CreditPage api={props.api} />;
    case "help": return <HelpPage />;
    case "admin-dashboard": return <AdminDashboardPage api={props.api} />;
    case "admin-system": return <AdminSystemPage api={props.api} />;
    case "admin-login": return <LoginPage api={props.api} admin />;
    default: return <AdminGenericPage api={props.api} route={props.route} />;
  }
}

function UserShell({ route, children }: { route: AppRoute; children: React.ReactNode }) {
  const auth = useAuth();
  return (
    <div className="app-shell user-shell">
      <header className="top-nav">
        <a className="logo" href="/feed">邻<span>帮</span></a>
        <nav>{userNav.map((item) => <a key={item.id} className={route.id === item.id ? "active" : ""} href={item.path}>{item.label}</a>)}</nav>
        <div className="nav-right">
          <a className="nav-avatar" href="/profile">
            {auth.session?.user.avatarUrl ? <img src={auth.session?.user.avatarUrl} alt="" /> : <span className="nav-avatar-placeholder">{(auth.session?.user.displayName ?? auth.session?.user.username ?? "").slice(0, 1)}</span>}
            <span>{auth.session?.user.displayName ?? auth.session?.user.username}</span>
          </a>
        </div>
      </header>
      <main className="page">{children}</main>
      <nav className="bottom-nav">{userNav.map((item) => <a key={item.id} className={route.id === item.id ? "active" : ""} href={item.path}>{item.label}</a>)}</nav>
    </div>
  );
}

function AdminShell({ route, children }: { route: AppRoute; children: React.ReactNode }) {
  const auth = useAuth();
  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <a className="admin-logo" href="/admin/dashboard">邻帮 MIS</a>
        <nav>{adminNav.map((item) => <a key={item.id} className={route.id === item.id ? "active" : ""} href={item.path}>{item.label}</a>)}</nav>
      </aside>
      <main className="admin-main">
        <header className="admin-topbar">
          <h1>{route.title}</h1>
          <span>{auth.session?.user.displayName ?? auth.session?.user.username}</span>
        </header>
        {children}
      </main>
    </div>
  );
}

function LoadingScreen() {
  return <main className="page"><div className="state-card">正在加载...</div></main>;
}
