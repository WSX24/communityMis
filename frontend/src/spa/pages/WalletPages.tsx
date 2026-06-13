import type { ApiClient } from "../api";
import { DataTable, PageHeader, StateView, asArray, text, useAsync } from "./shared";

export function WalletPage({ api }: { api: ApiClient }) {
  const state = useAsync(async () => {
    const [wallet, transactions] = await Promise.all([
      api.wallet.me(),
      api.wallet.transactions({ page: 1, pageSize: 20 })
    ]);
    return { wallet, transactions };
  }, [api]);
  const tx = asArray<Record<string, unknown>>(state.data?.transactions, "transactions");
  const wallet = (state.data?.wallet.wallet ?? state.data?.wallet) as Record<string, unknown> | undefined;
  return (
    <>
      <PageHeader title="时间币钱包" action={<a className="btn btn--secondary" href="/wallet/freeze">冻结明细</a>} />
      <StateView loading={state.loading} error={state.error}>
        <section className="metric-grid">
          <div className="metric-card"><span>余额</span><strong>{text(wallet?.balance, "0")}</strong></div>
          <div className="metric-card"><span>冻结</span><strong>{text(wallet?.frozenBalance, "0")}</strong></div>
        </section>
        <DataTable columns={["时间", "类型", "金额", "说明"]} rows={tx.map((item) => [
          text(item.createdAt),
          text(item.typeText ?? item.type),
          text(item.amount),
          text(item.description)
        ])} />
      </StateView>
    </>
  );
}

export function WalletFreezePage({ api }: { api: ApiClient }) {
  const state = useAsync(() => api.wallet.freezes({ page: 1, pageSize: 20 }), [api]);
  const rows = asArray<Record<string, unknown>>(state.data, "freezes");
  return (
    <>
      <PageHeader title="冻结明细" />
      <StateView loading={state.loading} error={state.error} empty={rows.length === 0}>
        <DataTable columns={["时间", "金额", "状态", "业务"]} rows={rows.map((item) => [
          text(item.createdAt),
          text(item.amount),
          text(item.statusText ?? item.status),
          text(item.businessType)
        ])} />
      </StateView>
    </>
  );
}
