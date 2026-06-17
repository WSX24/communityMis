import React from "react";
import { useParams } from "react-router-dom";
import type { ApiClient } from "../api";
import { FileUpload, Field, PageHeader, StateView, asArray, friendlyError, text, useAsync } from "./shared";

export function DisputeCreatePage({ api }: { api: ApiClient }) {
  const [fileIds, setFileIds] = React.useState<string[]>([]);
  const [error, setError] = React.useState("");
  return (
    <>
      <PageHeader title="发起纠纷" />
      <form className="panel form-grid" onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        try {
          await api.orders.dispute(String(form.get("orderId")), {
            reason: form.get("reason"),
            description: form.get("description"),
            attachments: fileIds.map((fileId) => ({ fileId }))
          });
          window.location.href = "/orders";
        } catch (reason) {
          setError(friendlyError(reason));
        }
      }}>
        <Field label="订单 ID"><input name="orderId" required /></Field>
        <Field label="原因"><input name="reason" required /></Field>
        <Field label="说明"><textarea name="description" rows={5} required /></Field>
        <FileUpload purpose="dispute-evidence" businessType="dispute" visibility="private" onUploaded={async (formData) => {
          const result = await api.files.upload(formData);
          const fileId = text((result.file as Record<string, unknown>)?.fileId ?? result.fileId, "");
          if (fileId) setFileIds((current) => [...current, fileId]);
        }} />
        {error ? <p className="field-error">{error}</p> : null}
        <button className="btn btn--primary">提交纠纷</button>
      </form>
    </>
  );
}

export function DisputeDetailPage({ api }: { api: ApiClient }) {
  const { id = "" } = useParams();
  const state = useAsync(() => api.disputes.detail(id), [api, id]);
  const dispute = (state.data?.dispute ?? state.data) as Record<string, unknown> | null;
  return (
    <>
      <PageHeader title="纠纷详情" />
      <StateView loading={state.loading} error={state.error} empty={!dispute}>
        <article className="panel">
          <h2>纠纷 #{text(dispute?.disputeId ?? id)}</h2>
          <p>{text(dispute?.reason)}</p>
          <p>{text(dispute?.description)}</p>
          <FileUpload purpose="dispute-evidence" businessType="dispute" businessId={id} visibility="private" onUploaded={async (formData) => {
            const result = await api.files.upload(formData);
            const fileId = text((result.file as Record<string, unknown>)?.fileId ?? result.fileId, "");
            await api.disputes.evidence(id, { attachments: [{ fileId }] });
          }} />
        </article>
      </StateView>
    </>
  );
}

export function JuryVotingPage({ api }: { api: ApiClient }) {
  const disputeId = new URLSearchParams(window.location.search).get("disputeId") || window.location.pathname.split("/").pop() || "";
  const state = useAsync(() => api.jury.dispute(disputeId), [api, disputeId]);
  const dispute = (state.data?.dispute ?? state.data) as Record<string, unknown> | null;
  return (
    <>
      <PageHeader title="陪审投票" />
      <StateView loading={state.loading} error={state.error} empty={!dispute}>
        <article className="panel">
          <h2>{text(dispute?.reason)}</h2>
          <p>{text(dispute?.description)}</p>
          <div className="action-row">
            {["support_initiator", "support_respondent", "abstain"].map((result) => (
              <button key={result} className="btn btn--secondary" onClick={() => api.jury.vote(disputeId, { result, reason: "前端投票" }).then(() => window.location.reload())}>{result}</button>
            ))}
          </div>
        </article>
      </StateView>
    </>
  );
}
