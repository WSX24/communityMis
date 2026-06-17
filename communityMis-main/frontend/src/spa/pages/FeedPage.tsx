import type { ApiClient } from "../api";
import { asArray, PageHeader, StateView, text, useAsync } from "./shared";

export function FeedPage({ api }: { api: ApiClient }) {
  const state = useAsync(() => api.requests.list({ page: 1, pageSize: 12 }), [api]);
  const requests = asArray<Record<string, unknown>>(state.data, "requests");
  return (
    <>
      <PageHeader title="首页信息流" action={<a className="btn btn--primary" href="/post">发布需求</a>} />
      <StateView loading={state.loading} error={state.error} empty={requests.length === 0}>
        <div className="card-list">
          {requests.map((item) => (
            <a className="card interactive" key={text(item.requestId)} href={`/posts/${text(item.requestId)}`}>
              <div className="card-title">{text(item.title)}</div>
              <p>{text(item.descriptionSummary || item.description || item.content)}</p>
              <div className="meta-row"><span>{text((item.category as Record<string, unknown>)?.name ?? item.categoryName)}</span><span>{text(item.coinAmount ?? item.rewardAmount ?? item.reward)} 时间币</span></div>
            </a>
          ))}
        </div>
      </StateView>
    </>
  );
}
