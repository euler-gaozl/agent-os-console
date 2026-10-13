import React, { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, FileText, RefreshCw } from "lucide-react";
import { api, Badge, date, Field, Spinner } from "./shared";

export type CallSummary = {
  id: string;
  kind: string;
  status: string;
  tool_name?: string;
  error_preview?: string;
  has_response: boolean;
  created_at: string;
  updated_at: string;
};
export type CallPage = {
  run_id: string;
  filter: "all" | "unresolved";
  items: CallSummary[];
  next_cursor: string;
};
type ReceiptField = "request" | "response" | "error";
export type CallSegment = {
  run_id: string;
  operation_id: string;
  kind: string;
  status: string;
  field: ReceiptField;
  text: string;
  value_null: boolean;
  offset: number;
  next_offset: number | null;
  version: string;
};
const segmentSize = 8192;
export async function loadCallPage(
  run: string,
  filter: CallPage["filter"],
  after = "",
): Promise<CallPage> {
  const query = new URLSearchParams({ limit: "25", filter });
  if (after) query.set("after", after);
  const page = await api<CallPage>(
    `/runs/${encodeURIComponent(run)}/calls/page?${query}`,
  );
  if (
    page.run_id !== run ||
    page.filter !== filter ||
    !Array.isArray(page.items) ||
    page.items.length > 25 ||
    typeof page.next_cursor !== "string" ||
    page.next_cursor.length > 2048 ||
    new Set(page.items.map((x) => x.id)).size !== page.items.length ||
    page.items.some(
      (x) => typeof x.id !== "string" || !x.id || x.id.length > 512,
    )
  )
    throw new Error("回执列表与任务或分页不匹配，请重新读取。");
  return page;
}
export async function loadCallSegment(
  run: string,
  operation: string,
  field: ReceiptField,
  offset = 0,
  version = "",
): Promise<CallSegment> {
  const query = new URLSearchParams({
    operation_id: operation,
    field,
    offset: String(offset),
    limit: String(segmentSize),
  });
  if (version) query.set("version", version);
  const part = await api<CallSegment>(
    `/runs/${encodeURIComponent(run)}/calls/record?${query}`,
  );
  if (
    part.run_id !== run ||
    part.operation_id !== operation ||
    part.field !== field ||
    part.offset !== offset ||
    typeof part.text !== "string" ||
    [...part.text].length > segmentSize ||
    typeof part.value_null !== "boolean" ||
    !/^[a-f0-9]{64}$/.test(part.version) ||
    (version && part.version !== version) ||
    (part.next_offset !== null && part.next_offset !== offset + segmentSize) ||
    (part.next_offset !== null && [...part.text].length !== segmentSize) ||
    (part.value_null && (part.text !== "" || part.next_offset !== null))
  )
    throw new Error("回执分段或版本不匹配，请从首段重新读取。");
  return part;
}

function ReceiptSegmentView({
  run,
  operation,
  field,
}: {
  run: string;
  operation: string;
  field: ReceiptField;
}) {
  const [offset, setOffset] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [part, setPart] = useState<CallSegment | null>(null);
  const [error, setError] = useState("");
  const version = useRef("");
  useEffect(() => {
    let alive = true;
    setPart(null);
    setError("");
    void loadCallSegment(run, operation, field, offset, version.current)
      .then((value) => {
        if (!alive) return;
        version.current = value.version;
        setPart(value);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [run, operation, field, offset, refresh]);
  const restart = () => {
    version.current = "";
    setPart(null);
    setError("");
    setOffset(0);
    setRefresh((n) => n + 1);
  };
  const current = part?.offset === offset ? part : null;
  return (
    <div className="receipt-segment">
      {error ? (
        <p className="working-caution" role="alert">
          读取失败：{error}
        </p>
      ) : current ? (
        <>
          <p className="field-hint">
            {current.value_null
              ? "此字段尚无已保存内容。"
              : current.text === ""
                ? "已保存空文本。"
                : `第 ${offset + 1}–${offset + [...current.text].length} 个字符${current.next_offset === null ? " · 已到末尾" : ""}`}
          </p>
          {!current.value_null && (
            <pre tabIndex={0}>{current.text || "（空文本）"}</pre>
          )}
        </>
      ) : (
        <p className="muted">
          <Spinner /> 正在读取这一段…
        </p>
      )}
      <div className="receipt-pager">
        <button
          className="button"
          disabled={!current || offset === 0}
          onClick={() => setOffset(Math.max(0, offset - segmentSize))}
        >
          <ArrowLeft size={15} />
          上一段
        </button>
        <button
          className="button"
          disabled={!current || current.next_offset === null}
          onClick={() => setOffset(current!.next_offset!)}
        >
          下一段
          <ArrowRight size={15} />
        </button>
        <button className="button" onClick={restart}>
          <RefreshCw size={15} />
          从首段重读
        </button>
      </div>
      <p className="field-hint">
        展示已保存的字段文本，每次最多 8,192 字符；翻页保持同一内容版本。
      </p>
    </div>
  );
}

export function ReceiptReader({
  run,
  operation,
}: {
  run: string;
  operation: string;
}) {
  const [open, setOpen] = useState(false);
  const [field, setField] = useState<ReceiptField>("response");
  return (
    <div className="receipt-reader">
      <button
        className="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <FileText size={15} />
        {open ? "收起回执原文" : "读取回执原文"}
      </button>
      {open && (
        <>
          <div className="receipt-fields" aria-label="回执字段">
            {(
              [
                ["response", "输出"],
                ["request", "输入"],
                ["error", "错误信息"],
              ] as const
            ).map(([value, label]) => (
              <button
                className={`button ${field === value ? "active" : ""}`}
                aria-pressed={field === value}
                key={value}
                onClick={() => setField(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <ReceiptSegmentView
            key={`${run}:${operation}:${field}`}
            run={run}
            operation={operation}
            field={field}
          />
        </>
      )}
    </div>
  );
}

function ReconcileReceipt({
  run,
  call,
  refreshRun,
}: {
  run: string;
  call: CallSummary;
  refreshRun: () => Promise<void>;
}) {
  const [decision, setDecision] = useState("completed");
  const [evidence, setEvidence] = useState("");
  const [receipt, setReceipt] = useState("{}");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const alive = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const submit = async () => {
    let result: unknown;
    try {
      result = JSON.parse(receipt);
    } catch {
      setError("回执 JSON 格式不正确，请核对后再提交。");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api(`/runs/${encodeURIComponent(run)}/reconcile`, {
        call_id: call.id,
        decision,
        evidence,
        result,
      });
      if (alive.current) await refreshRun();
    } catch (e) {
      if (alive.current)
        setError(
          `提交结果未确认：${(e as Error).message}。请更新详情核对，勿直接重复执行工具。`,
        );
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  return (
    <div className="reconcile-form">
      <h4>核对这条调用的执行结果</h4>
      <p className="field-hint">
        请查证实际执行情况后提交。缺少回执不能说明工具没有执行。
      </p>
      <Field label="结论">
        <select
          value={decision}
          onChange={(e) => setDecision(e.target.value)}
          disabled={busy}
        >
          <option value="completed">已执行，补录真实结果</option>
          <option value="not_executed">已确认未执行，允许重试</option>
        </select>
      </Field>
      <Field label="核对依据">
        <textarea
          value={evidence}
          onChange={(e) => setEvidence(e.target.value)}
          disabled={busy}
        />
      </Field>
      <Field label="回执 JSON">
        <textarea
          value={receipt}
          onChange={(e) => setReceipt(e.target.value)}
          disabled={busy}
        />
      </Field>
      {error && (
        <p className="working-caution" role="alert">
          {error}
        </p>
      )}
      <button
        className="button primary"
        disabled={busy || !evidence.trim()}
        onClick={() => void submit()}
      >
        {busy ? "正在提交…" : "提交核对记录"}
      </button>
    </div>
  );
}

// Remount by run/refresh at the caller. Only the current page's summaries and
// the expanded receipt's current segment are retained, never the full history.
export function CallReceipts({
  run,
  filter = "all",
  refreshRun,
}: {
  run: string;
  filter?: CallPage["filter"];
  refreshRun?: () => Promise<void>;
}) {
  const [cursors, setCursors] = useState([""]);
  const [page, setPage] = useState<CallPage | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState("");
  const cursor = cursors[cursors.length - 1];
  useEffect(() => {
    let alive = true;
    setPage(null);
    setError("");
    setExpanded("");
    void loadCallPage(run, filter, cursor)
      .then((value) => {
        if (alive) setPage(value);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [run, filter, cursor, refresh]);
  const reset = () => {
    setPage(null);
    setCursors([""]);
    setRefresh((n) => n + 1);
  };
  return (
    <section
      className={`receipt-panel ${filter === "unresolved" ? "receipt-attention" : ""}`}
      aria-label={filter === "unresolved" ? "待核对的调用" : "模型与工具回执"}
    >
      <header>
        <div>
          <h3>{filter === "unresolved" ? "待核对的调用" : "模型与工具回执"}</h3>
          <p className="field-hint">
            {filter === "unresolved"
              ? "单独查找结果未确认的调用，不受下方历史列表翻页影响。"
              : "按发生时间倒序，每页最多 25 条。新产生或刚提交的回执请刷新查看。"}
          </p>
        </div>
        <button className="button" onClick={reset}>
          <RefreshCw size={15} />
          刷新列表
        </button>
      </header>
      {error ? (
        <p className="working-caution" role="alert">
          回执列表暂不可用：{error}。请确认 Runtime
          已升级支持分段回执，再刷新重试。
        </p>
      ) : !page ? (
        <p className="muted">
          <Spinner /> 正在读取回执摘要…
        </p>
      ) : !page.items.length ? (
        <p className="muted">
          {filter === "unresolved"
            ? "本页没有待核对调用，可刷新首屏查看最新记录。"
            : "这一页没有回执。"}
        </p>
      ) : (
        <div className="receipt-list">
          {page.items.map((call) => (
            <article className="receipt-item" key={call.id}>
              <button
                className="receipt-summary"
                aria-expanded={expanded === call.id}
                onClick={() => setExpanded(expanded === call.id ? "" : call.id)}
              >
                <span>
                  <strong>
                    {call.kind === "model"
                      ? "模型调用"
                      : call.tool_name || "工具调用"}
                  </strong>
                  <code>{call.id}</code>
                </span>
                <span>
                  <Badge state={call.status} />
                  <small>{date(call.created_at)}</small>
                </span>
              </button>
              {call.error_preview && (
                <p className="receipt-error">错误摘要：{call.error_preview}</p>
              )}
              {expanded === call.id && (
                <div className="receipt-detail">
                  <ReceiptReader key={call.id} run={run} operation={call.id} />
                  {filter === "unresolved" && refreshRun && (
                    <ReconcileReceipt
                      key={call.id}
                      run={run}
                      call={call}
                      refreshRun={refreshRun}
                    />
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
      <div className="receipt-pager">
        <button
          className="button"
          disabled={!page || cursors.length < 2}
          onClick={() => {
            setPage(null);
            setCursors(cursors.slice(0, -1));
          }}
        >
          <ArrowLeft size={15} />
          上一页
        </button>
        <button
          className="button"
          disabled={!page?.next_cursor}
          onClick={() => {
            if (page?.next_cursor) {
              setPage(null);
              setCursors([...cursors.slice(-199), page.next_cursor]);
            }
          }}
        >
          下一页
          <ArrowRight size={15} />
        </button>
        {page && <small>本页 {page.items.length} 条 · 可返回最近 200 页</small>}
      </div>
    </section>
  );
}
