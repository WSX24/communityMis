import type { AppRoute } from "../types";

export function NotFoundPage({ routes }: { routes: AppRoute[] }) {
  return (
    <main className="page">
      <div className="panel">
        <h1>路由未找到</h1>
        <p className="muted">请选择一个已映射的生产路由。</p>
        <div className="route-grid">
          {routes.map((route) => <a key={route.id} href={route.entryPath}>{route.title}<span>{route.path}</span></a>)}
        </div>
      </div>
    </main>
  );
}
