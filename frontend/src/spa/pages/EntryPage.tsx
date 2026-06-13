export function EntryPage() {
  return (
    <main className="entry-page">
      <section className="entry-panel">
        <h1>邻帮</h1>
        <p>邻里互助、任务协作、纠纷处理和平台管理入口。</p>
        <div className="action-row">
          <a className="btn btn--primary" href="/feed">进入社区</a>
          <a className="btn btn--secondary" href="/admin/dashboard">管理后台</a>
        </div>
      </section>
    </main>
  );
}
