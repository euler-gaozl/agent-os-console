import React, { useEffect, useRef, useState } from "react";
import {
  continuationContext, continuationReason, continuationStorageChanged, confirmContinuation, lookupContinuation,
  pendingContinuations, sendPendingContinuation, startContinuation,
  type ContinuationContext, type ContinuationReceipt, type PendingContinuation,
} from "./continuation-client";

export function ContinuationPanel({ run, status, attempts, maxAttempts, refreshRun }: {
  run: string; status: string; attempts?: number; maxAttempts?: number; refreshRun: () => Promise<unknown>;
}) {
  const [context, setContext] = useState<ContinuationContext | null>(null);
  const [pending, setPending] = useState<PendingContinuation[]>([]);
  const [receipt, setReceipt] = useState<ContinuationReceipt | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const epoch = useRef(0), busyRef = useRef(false), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; epoch.current++; }; }, []);
  const inspect = async () => {
    if (busyRef.current) return;
    const generation = ++epoch.current;
    setLoading(true); setError(""); setContext(null);
    const current = () => alive.current && generation === epoch.current;
    try {
      let requests = pendingContinuations(run);
      if (current()) setPending(requests);
      if (requests.length) {
        const original = requests[0], saved = await lookupContinuation(original);
        // A late reply may confirm its own durable key; it may never clear a
        // different run/request or update a newly selected panel.
        confirmContinuation(original, saved);
        requests = pendingContinuations(run);
        if (current()) { setReceipt(saved); setPending(requests); }
      }
      if (!requests.length) {
        const next = await continuationContext(run);
        if (current()) setContext(next);
      }
    } catch (e) { if (current()) setError((e as Error).message); }
    finally { if (current()) setLoading(false); }
  };
  useEffect(() => { void inspect(); }, [run, status]);
  useEffect(() => {
    const changed = (event: StorageEvent) => { if (!busyRef.current && continuationStorageChanged(run, event.key)) void inspect(); };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, [run, status]);
  const submit = async (original?: PendingContinuation) => {
    if (busyRef.current || loading || (!original && !context?.failure_version)) return;
    busyRef.current = true;
    const generation = ++epoch.current;
    const current = () => alive.current && generation === epoch.current;
    setBusy(true); setError("");
    try {
      const result = original ? await sendPendingContinuation(original) : await startContinuation(run, context!.failure_version!);
      if (current()) { setReceipt(result); setPending(pendingContinuations(run)); setContext(null); }
      try { if (current()) await refreshRun(); }
      catch { if (current()) setError("请求结果已确认，但详情刷新失败。请更新执行详情。"); }
    } catch (e) {
      if (current()) {
        setError((e as Error).message);
        try { setPending(pendingContinuations(run)); } catch { /* Keep the storage error and disable a new action. */ }
        setContext(null);
      }
    } finally { busyRef.current = false; if (current()) setBusy(false); }
  };
  const hasBudget = Number.isSafeInteger(attempts) && Number.isSafeInteger(maxAttempts) && maxAttempts! > 0;
  return <section className="continuation-panel" aria-label="继续失败任务" aria-busy={loading || busy}>
    <h3>继续任务</h3>
    <p className="field-hint">沿用原任务快照和剩余预算，可能产生新的模型用量，结果仍取决于后续执行。</p>
    {hasBudget && <p className="field-hint">模型尝试已用 {attempts} / 原预算 {maxAttempts} 次。</p>}
    {receipt && <p role="status" className="continuation-receipt">
      {receipt.outcome === "queued" ? "续跑请求已接受，回执表示当时已重新排队；当前状态以执行详情为准。" : "续跑请求已拒绝：" + continuationReason(receipt.reason)}
    </p>}
    {error && <p role="alert">{error}</p>}
    {pending.length > 0 ? <>
      <p>有 {pending.length} 个请求待确认。刷新或关闭此页面不会取消服务端处理。</p>
      <p className="continuation-request">请求编号：{pending[0].request_id}</p>
      <div className="button-row">
        <button className="button" disabled={loading || busy} onClick={() => void inspect()}>核对请求结果</button>
        <button className="button" disabled={loading || busy} onClick={() => void submit(pending[0])}>重发同一请求</button>
      </div>
    </> : <>
      {loading ? <p role="status">正在读取续跑条件…</p> : context && <p>{continuationReason(context.reason)}</p>}
      <div className="button-row">
        <button className="button" disabled={loading || busy} onClick={() => void inspect()}>更新续跑条件</button>
        {context?.assessment === "same_run_candidate" && <button className="button primary" disabled={loading || busy} onClick={() => void submit()}>按原快照继续</button>}
      </div>
    </>}
  </section>;
}
