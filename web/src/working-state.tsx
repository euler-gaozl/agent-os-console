import React, { useEffect, useRef, useState } from "react";
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  History,
  RefreshCw,
} from "lucide-react";
import { api, Spinner } from "./shared";
import { ReceiptReader } from "./call-receipts";

export const SOURCE_ENGINE = "dsh-source-639ed015-state-v1";
export const RESIDENT_ENGINE = "dsh-source-639ed015-resident-v2";
export const BUDGET_ENGINE = "dsh-source-639ed015-budget-v3";
export const NATIVE_ENGINE = "dsh-source-639ed015-native-v4";
export const isSourceEngine = (engine: string) =>
  engine === SOURCE_ENGINE ||
  engine === RESIDENT_ENGINE ||
  engine === BUDGET_ENGINE ||
  engine === NATIVE_ENGINE;
export const hasArchiveManifest = (engine: string) =>
  isSourceEngine(engine) || engine === "dsh-0.2.0-rc.2-evidence-v1";

export type WorkingView = {
  run_id: string;
  task: string;
  constraints: string[];
  rule_revision: number;
  revision: number;
  source_rule_revision: number;
  stale: boolean;
  state: null | {
    format: number;
    phase: string;
    questions: { id: string; text: string; status: string }[];
    observations: {
      id: string;
      text: string;
      kind: string;
      receipts: string[];
    }[];
    conflicts: { id: string; text: string; observations: string[] }[];
    next_steps: { id: string; text: string; status: string }[];
  };
  evidence: { operation_id: string; response_sha256: string }[];
};
type Recovery = { run_id: string; allowed: boolean; reason: string };

export async function loadWorkingView(
  id: string,
  revision = 0,
): Promise<WorkingView> {
  const view = await api<WorkingView>(
    `/runs/${encodeURIComponent(id)}/working-state?revision=${revision}`,
  );
  if (view.run_id !== id || (revision > 0 && view.revision !== revision))
    throw new Error("工作状态版本不匹配，请刷新后重试。");
  return view;
}

const states: Record<string, string> = {
  open: "待解答",
  answered: "已记录答案",
  deferred: "暂缓",
  pending: "待执行",
  done: "已完成",
  blocked: "受阻",
};
const kinds: Record<string, string> = {
  observation: "观察记录",
  plan: "计划",
  third_party_forecast: "第三方预测",
};
const recoveryReasons: Record<string, string> = {
  ready:
    "中断发生在工作状态回执阶段，执行记录已保存，可以继续核对回执并恢复任务。",
  unresolved_calls: "存在执行结果未确认的调用，请先核对下方外部执行结果。",
  archive_unconfirmed: "执行记录尚未确认保存，暂不能从工作状态恢复。",
  no_state_exchange:
    "中断点不属于工作状态回执，需要核对具体调用或排查运行日志。",
  cancelled: "任务已请求取消，不能恢复执行。",
  not_waiting: "任务当前不需要工作状态恢复。",
  source_engine_required: "此任务使用历史执行器，不支持工作状态恢复。",
};

export function WorkingStateContent({
  view,
  historical = false,
}: {
  view: WorkingView;
  historical?: boolean;
}) {
  const state = view.state;
  return (
    <>
      <div className="working-authority">
        <span className="working-eyebrow">
          当前任务依据 · 约束 v{view.rule_revision}
        </span>
        <p>{view.task}</p>
        {view.constraints?.length > 0 && (
          <ul>
            {view.constraints.map((text, i) => (
              <li key={i}>{text}</li>
            ))}
          </ul>
        )}
      </div>
      {historical && (
        <p className="working-caution">
          正在查看历史工作状态。上方任务与约束始终显示当前权威版本。
        </p>
      )}
      {view.stale && (
        <p className="working-caution" role="status">
          约束已经变更：此工作状态基于约束 v{view.source_rule_revision}，当前为
          v{view.rule_revision}。记录尚未按新约束重新整理。
        </p>
      )}
      {!state ? (
        <div className="working-empty">
          <Archive size={22} />
          <div>
            <b>尚未保存工作状态</b>
            <p>
              任务开始执行不代表已经写入工作状态；保存后会显示问题、记录和后续步骤。
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="working-phase">
            <span>工作状态 v{view.revision}</span>
            <strong>{state.phase}</strong>
          </div>
          <p className="field-hint">
            以下内容由 Agent
            整理。分类和回执可追溯不代表事实已核实；原始资料仍需校验。
          </p>
          <div className="working-grid">
            <section>
              <h4>
                核心问题 <small>{state.questions?.length || 0}</small>
              </h4>
              {state.questions?.length ? (
                <ul>
                  {state.questions.map((q) => (
                    <li key={q.id}>
                      <span className="working-tag">
                        {states[q.status] || q.status}
                      </span>
                      <p>{q.text}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">尚未记录问题</p>
              )}
            </section>
            <section>
              <h4>
                下一步 <small>{state.next_steps?.length || 0}</small>
              </h4>
              {state.next_steps?.length ? (
                <ul>
                  {state.next_steps.map((step) => (
                    <li key={step.id}>
                      <span className="working-tag">
                        {states[step.status] || step.status}
                      </span>
                      <p>{step.text}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">尚未记录后续步骤</p>
              )}
            </section>
          </div>
          <section className="working-observations">
            <h4>
              观察与计划 <small>{state.observations?.length || 0}</small>
            </h4>
            {state.observations?.length ? (
              state.observations.map((item) => (
                <article key={item.id}>
                  <span className="working-tag">
                    {kinds[item.kind] || item.kind}
                  </span>
                  <p>{item.text}</p>
                  <details>
                    <summary>来源回执 · {item.receipts.length}</summary>
                    {item.receipts.map((id) => {
                      const evidence = view.evidence.find(
                        (e) => e.operation_id === id,
                      );
                      return (
                        <div className="working-receipt" key={id}>
                          <code>{id}</code>
                          {evidence && (
                            <small>
                              回执 SHA-256：{evidence.response_sha256}
                            </small>
                          )}
                          <ReceiptReader
                            key={`${view.run_id}:${id}`}
                            run={view.run_id}
                            operation={id}
                          />
                        </div>
                      );
                    })}
                  </details>
                </article>
              ))
            ) : (
              <p className="muted">尚未保存观察或计划</p>
            )}
          </section>
          {!!state.conflicts?.length && (
            <section className="working-conflicts">
              <h4>
                待解决的冲突 <small>{state.conflicts.length}</small>
              </h4>
              <ul>
                {state.conflicts.map((item) => (
                  <li key={item.id}>
                    <p>{item.text}</p>
                    <small>涉及记录：{item.observations.join("、")}</small>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </>
  );
}

export function WorkingStatePanel({
  id,
  status,
  refreshRun,
}: {
  id: string;
  status: string;
  refreshRun: () => Promise<void>;
}) {
  const session = useRef(0);
  useEffect(() => {
    session.current++;
    return () => {
      session.current++;
    };
  }, [id]);
  const [revision, setRevision] = useState(0);
  const [revisionInput, setRevisionInput] = useState("");
  const [latest, setLatest] = useState(0);
  const [view, setView] = useState<WorkingView | null>(null);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [recovery, setRecovery] = useState<Recovery | null>(null);
  const [recoveryError, setRecoveryError] = useState("");
  const [resumeError, setResumeError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    setView(null);
    setError("");
    void loadWorkingView(id, revision)
      .then((v) => {
        if (!alive) return;
        setView(v);
        if (!revision) setLatest(v.revision);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [id, revision, refresh]);
  useEffect(() => {
    let alive = true;
    setRecovery(null);
    setRecoveryError("");
    if (status === "waiting_unknown") {
      void api<Recovery>(`/runs/${encodeURIComponent(id)}/source-recovery`)
        .then((v) => {
          if (v.run_id !== id) throw new Error("恢复状态与任务不匹配。");
          if (alive) setRecovery(v);
        })
        .catch((e) => {
          if (alive) setRecoveryError(e.message);
        });
    }
    return () => {
      alive = false;
    };
  }, [id, status, refresh]);
  const resume = async () => {
    const version = session.current;
    setBusy(true);
    setResumeError("");
    try {
      await api(`/runs/${encodeURIComponent(id)}/resume-source-state`, {});
      if (version !== session.current) return;
      await refreshRun();
    } catch (e) {
      if (version !== session.current) return;
      setResumeError(
        `恢复未确认：${(e as Error).message}。请更新详情核对任务状态。`,
      );
      setRefresh((n) => n + 1);
    } finally {
      if (version === session.current) setBusy(false);
    }
  };
  return (
    <section className="working-panel" aria-label="已保存的工作状态">
      <header>
        <div>
          <span className="working-eyebrow">运行时持久化</span>
          <h3>已保存的工作状态</h3>
        </div>
        <button className="button" onClick={() => setRefresh((n) => n + 1)}>
          <RefreshCw size={15} />
          刷新状态
        </button>
      </header>
      <div className="working-history">
        <button
          className={`button ${revision === 0 ? "active" : ""}`}
          onClick={() => setRevision(0)}
        >
          最新状态
        </button>
        <button
          className="icon-button"
          aria-label="前一版工作状态"
          disabled={!view || view.revision <= 1}
          onClick={() => setRevision(view!.revision - 1)}
        >
          <ArrowLeft size={16} />
        </button>
        <button
          className="icon-button"
          aria-label="后一版工作状态"
          disabled={!view || revision === 0 || view.revision >= latest}
          onClick={() => setRevision(view!.revision + 1)}
        >
          <ArrowRight size={16} />
        </button>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const n = Number(revisionInput);
            if (Number.isSafeInteger(n) && n > 0) setRevision(n);
          }}
        >
          <History size={15} />
          <input
            aria-label="历史工作状态版本"
            type="number"
            min="1"
            step="1"
            placeholder="版本号"
            value={revisionInput}
            onChange={(e) => setRevisionInput(e.target.value)}
          />
          <button className="button" type="submit" disabled={!revisionInput}>
            查看历史
          </button>
        </form>
      </div>
      {error ? (
        <p className="working-caution" role="alert">
          未能读取工作状态：{error}。可刷新重试。
        </p>
      ) : view ? (
        <WorkingStateContent view={view} historical={revision > 0} />
      ) : (
        <p className="muted">
          <Spinner /> 正在读取已保存的版本…
        </p>
      )}
      {status === "waiting_unknown" && (
        <div className="working-recovery">
          <h4>继续当前任务</h4>
          {recovery && (
            <p>
              {recoveryReasons[recovery.reason] ||
                "当前中断原因不支持在这里恢复，请核对运行记录。"}
            </p>
          )}
          {recovery?.allowed && (
            <button
              className="button primary"
              disabled={busy}
              onClick={() => void resume()}
            >
              {busy ? "正在确认…" : "从已保存的回执继续"}
            </button>
          )}
          {!recovery && !recoveryError && (
            <p className="muted">正在检查恢复条件…</p>
          )}
          {recoveryError && (
            <p role="alert" className="working-caution">
              {recoveryError}
            </p>
          )}
          {resumeError && (
            <p role="alert" className="working-caution">
              {resumeError}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
