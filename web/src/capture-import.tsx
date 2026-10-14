import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ExternalLink,
  FileText,
  History,
  Link2,
  RefreshCw,
  Search,
} from "lucide-react";
import {
  Badge,
  downloadArtifact,
  Field,
  Modal,
  Spinner,
  type Ref,
} from "./shared";
import {
  captureCapabilities,
  captureHistory,
  captureIntents,
  collectCapture,
  importCapture,
  readCapture,
  retainCapture,
  sourceURL,
  forgetCapture,
  type CaptureHistory,
  type CaptureImport,
  type CaptureIntent,
  type CapturePage,
} from "./capture-client";

const captureDate = (value: string) =>
  new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai",
  }).format(new Date(value)) + "（北京时间）";

export function CaptureImportDialog({
  knowledge,
  name,
  close,
  saved,
}: {
  knowledge: Ref;
  name: string;
  close: () => void;
  saved: () => void;
}) {
  const [url, setURL] = useState("");
  const [id, setID] = useState("");
  const [intent, setIntent] = useState<CaptureIntent>();
  const [page, setPage] = useState<CapturePage>();
  const [offset, setOffset] = useState(0);
  const [receipt, setReceipt] = useState<CaptureImport>();
  const [recent, setRecent] = useState<CaptureIntent[]>([]);
  const [history, setHistory] = useState<CaptureHistory>();
  const [historyURL, setHistoryURL] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [capError, setCapError] = useState("");
  const [checking, setChecking] = useState(true);
  const mounted = useRef(false),
    active = useRef(false),
    capabilityRequest = useRef(0);
  const refreshRecent = () => setRecent(captureIntents(knowledge));
  const check = async () => {
    const request = ++capabilityRequest.current;
    setChecking(true);
    setReady(false);
    setCapError("");
    try {
      await captureCapabilities();
      if (mounted.current && request === capabilityRequest.current)
        setReady(true);
    } catch (e) {
      if (mounted.current && request === capabilityRequest.current)
        setCapError((e as Error).message);
    } finally {
      if (mounted.current && request === capabilityRequest.current)
        setChecking(false);
    }
  };
  useEffect(() => {
    mounted.current = true;
    try {
      refreshRecent();
    } catch (e) {
      setError((e as Error).message);
    }
    void check();
    return () => {
      mounted.current = false;
      capabilityRequest.current++;
    };
  }, []);

  const perform = async (label: string, action: () => Promise<void>) => {
    if (active.current) return;
    active.current = true;
    setBusy(label);
    setError("");
    try {
      await action();
    } catch (e) {
      if (mounted.current) setError((e as Error).message);
    } finally {
      active.current = false;
      if (mounted.current) {
        setBusy("");
        try {
          refreshRecent();
        } catch (e) {
          setError((e as Error).message);
        }
      }
    }
  };
  const show = (record: CaptureIntent, captured: CapturePage) => {
    if (!mounted.current) return;
    setIntent(record);
    setURL(record.url);
    setID(record.capture_id);
    setPage(captured);
    setOffset(0);
    setReceipt(undefined);
  };
  const recover = (captureID: string, expectedURL?: string) =>
    perform("正在找回原文…", async () => {
      setPage(undefined);
      setReceipt(undefined);
      if (expectedURL) {
        const record = retainCapture(knowledge, captureID.trim(), expectedURL);
        setIntent(record);
        setURL(record.url);
        setID(record.capture_id);
      } else setIntent(undefined);
      const captured = await readCapture(captureID.trim(), 0, expectedURL);
      if (!mounted.current) return;
      show(
        retainCapture(knowledge, captured.capture_id, captured.url),
        captured,
      );
    });
  const collect = () =>
    perform("正在采集网页…", async () => {
      const exact = sourceURL(url);
      const record =
        intent?.url === exact
          ? intent
          : retainCapture(
              knowledge,
              crypto.randomUUID().replaceAll("-", ""),
              exact,
            );
      // The recoverable pointer is durable before the first network write.
      setIntent(record);
      setID(record.capture_id);
      setReceipt(undefined);
      setPage(undefined);
      show(record, await collectCapture(record));
    });
  const readPage = (next: number) =>
    perform("正在读取原文…", async () => {
      if (!intent || !page) return;
      const captured = await readCapture(
        intent.capture_id,
        next,
        intent.url,
        page.raw_sha256,
      );
      if (mounted.current) {
        setPage(captured);
        setOffset(next);
      }
    });
  const findHistory = (after = "") =>
    perform("正在读取采集历史…", async () => {
      const exact = after ? historyURL : sourceURL(url);
      const result = await captureHistory(exact, after);
      if (mounted.current) {
        setHistoryURL(exact);
        setHistory(result);
      }
    });
  const save = () =>
    perform("正在保存并核对回执…", async () => {
      if (!intent || !page) return;
      const result = await importCapture(intent, page.raw_sha256);
      if (mounted.current) {
        setReceipt(result);
        saved();
      }
    });

  return (
    <Modal title="采集网页资料" close={close} wide>
      <div className="modal-body capture-dialog">
        <div className="capture-destination">
          <span className="capture-symbol">
            <Link2 size={22} />
          </span>
          <div>
            <b>
              保存到 {name}{" "}
              <span className="version">v{knowledge.revision}</span>
            </b>
            <p>先阅读提取原文，再将网页原始响应、正文和来源一起留存。</p>
          </div>
        </div>
        {checking && (
          <p className="field-hint" role="status">
            <Spinner /> 正在检查采集与保存服务…
          </p>
        )}
        {capError && (
          <div className="inline-warning" role="alert">
            {capError}
            <button className="text-button" onClick={() => void check()}>
              重新检查
            </button>
          </div>
        )}
        <div className="capture-layout">
          <section className="capture-inputs" aria-label="资料来源">
            <Field
              label="网页地址"
              hint="支持已配置来源的公开 HTTPS 网页；不支持登录页面、PDF 或需要 JavaScript 的正文。"
            >
              <input
                type="url"
                placeholder="https://…"
                value={url}
                disabled={!!busy}
                onChange={(e) => {
                  setURL(e.target.value);
                  setIntent(undefined);
                  setPage(undefined);
                  setReceipt(undefined);
                  setHistory(undefined);
                  setID("");
                  setError("");
                }}
              />
            </Field>
            <div className="capture-actions">
              <button
                className="button primary"
                disabled={!ready || !!busy || !url.trim()}
                onClick={() => void collect()}
              >
                <Link2 size={15} />
                {intent ? "重试同一采集" : "采集并预览"}
              </button>
              <button
                className="button"
                disabled={!!busy || !url.trim()}
                onClick={() => void findHistory()}
              >
                <History size={15} />
                历史记录
              </button>
            </div>
            {intent && (
              <div className="capture-recovery">
                <b>恢复编号已保存在本浏览器</b>
                <code>{intent.capture_id}</code>
                <p>
                  关闭页面不撤销请求。未收到结果时，先找回原记录；重试使用相同编号。
                </p>
                <div className="capture-actions">
                  <button
                    className="text-button"
                    disabled={!!busy}
                    onClick={() => void recover(intent.capture_id, intent.url)}
                  >
                    找回该采集
                  </button>
                  <button
                    className="text-button"
                    disabled={!!busy}
                    onClick={() => {
                      setIntent(undefined);
                      setPage(undefined);
                      setReceipt(undefined);
                      setID("");
                    }}
                  >
                    新建一次采集
                  </button>
                </div>
                <details>
                  <summary>管理本机记录</summary>
                  <p>
                    移除后仍可按地址或编号查询服务器已留存的原文；不会取消正在处理的请求。
                  </p>
                  <button
                    className="text-button"
                    disabled={!!busy}
                    onClick={() =>
                      void perform("正在移除本机记录…", async () => {
                        forgetCapture(intent);
                        setIntent(undefined);
                        setPage(undefined);
                        setReceipt(undefined);
                        setID("");
                      })
                    }
                  >
                    仅移除本机记录
                  </button>
                </details>
              </div>
            )}
            <details className="capture-lookup">
              <summary>通过采集编号找回</summary>
              <Field label="采集编号">
                <input
                  value={id}
                  disabled={!!busy}
                  maxLength={32}
                  onChange={(e) => setID(e.target.value)}
                  placeholder="32 位采集编号"
                />
              </Field>
              <button
                className="button"
                disabled={!!busy || !id.trim()}
                onClick={() => void recover(id)}
              >
                <Search size={15} />
                读取已保存的原文
              </button>
            </details>
            {!!recent.length && (
              <details className="capture-lookup" open>
                <summary>本浏览器记录 · {recent.length}</summary>
                <div className="capture-history-list">
                  {recent.map((item) => (
                    <button
                      key={item.capture_id}
                      disabled={!!busy}
                      onClick={() => void recover(item.capture_id, item.url)}
                    >
                      <span>{item.url}</span>
                      <small>
                        {item.saved_file ? "已确认保存" : "待回查 / 保存"} ·{" "}
                        {item.capture_id.slice(0, 8)}
                      </small>
                    </button>
                  ))}
                </div>
              </details>
            )}
            {history && (
              <section className="capture-lookup" aria-label="服务器采集历史">
                <h4>该地址的采集历史</h4>
                {!history.items.length && (
                  <p className="field-hint">尚无该地址的采集记录。</p>
                )}
                <div className="capture-history-list">
                  {history.items.map((item) => (
                    <button
                      key={item.capture_id}
                      disabled={!!busy}
                      onClick={() => void recover(item.capture_id, historyURL)}
                    >
                      <span>{item.title || item.url}</span>
                      <small>
                        {captureDate(item.fetched_at)} ·{" "}
                        {item.capture_id.slice(0, 8)}
                      </small>
                    </button>
                  ))}
                </div>
                {history.next_cursor && (
                  <button
                    className="text-button"
                    disabled={!!busy}
                    onClick={() => void findHistory(history.next_cursor)}
                  >
                    更早记录 <ArrowRight size={14} />
                  </button>
                )}
              </section>
            )}
          </section>
          <section className="capture-preview" aria-label="采集原文预览">
            {page ? (
              <>
                <h3>{page.title || "采集原文"}</h3>
                <a
                  className="capture-url"
                  href={page.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {page.url}
                  <ExternalLink size={13} />
                </a>
                <p className="capture-time">
                  采集于 {captureDate(page.fetched_at)}
                  <br />
                  采集时间不代表发布时间或统计期；页面内容仍需核验。
                </p>
                <pre className="capture-text">{page.content}</pre>
                <div className="capture-pagination">
                  <button
                    className="icon-button"
                    aria-label="上一段原文"
                    disabled={!!busy || offset === 0}
                    onClick={() => void readPage(Math.max(0, offset - 1200))}
                  >
                    <ArrowLeft size={16} />
                  </button>
                  <span>
                    {offset + (page.content ? 1 : 0)}–{page.next_offset} /{" "}
                    {page.total_characters} 字符
                  </span>
                  <button
                    className="icon-button"
                    aria-label="下一段原文"
                    disabled={!!busy || !page.has_more}
                    onClick={() => void readPage(page.next_offset)}
                  >
                    <ArrowRight size={16} />
                  </button>
                </div>
                <details className="capture-fingerprint">
                  <summary>原文指纹与提取版本</summary>
                  <code>SHA-256 {page.raw_sha256}</code>
                  <small>{page.extraction_version}</small>
                </details>
              </>
            ) : (
              <div className="capture-placeholder">
                <FileText size={32} />
                <h3>预览即将保留的资料</h3>
                <p>
                  输入网页地址，或从历史记录找回。正文按段读取，保存时包含完整提取原文。
                </p>
              </div>
            )}
          </section>
        </div>
        {busy && (
          <p className="capture-progress" role="status">
            <Spinner />
            {busy}
          </p>
        )}
        {error && (
          <div className="error-message" role="alert">
            {error}
            {intent && (
              <p>
                采集编号仍已保留。保存请求可使用同一编号重试，不会重复创建同一知识库版本的文件。
              </p>
            )}
          </div>
        )}
        {receipt && (
          <div className="capture-saved" role="status">
            <Check size={20} />
            <div>
              <b>资料与来源附件已保存</b>
              <p>文件编号：{receipt.file.id}</p>
              <Badge state={receipt.file.status} />
              <p>
                {receipt.file.status === "ready"
                  ? "该知识库版本现在可以检索这份资料。"
                  : "索引尚未就绪，请在资料列表查看后续状态。"}
              </p>
              <div className="capture-actions">
                <button
                  className="text-button"
                  onClick={() =>
                    void perform("正在下载原始响应…", () =>
                      downloadArtifact(
                        receipt.source.archive.stored_raw_sha256,
                        "capture-" + intent!.capture_id + "-raw",
                        true,
                      ),
                    )
                  }
                >
                  下载网页原始响应
                </button>
                <button
                  className="text-button"
                  onClick={() =>
                    void perform("正在下载完整正文…", () =>
                      downloadArtifact(
                        receipt.source.archive.text_sha256,
                        "capture-" + intent!.capture_id + ".txt",
                        true,
                      ),
                    )
                  }
                >
                  下载完整提取正文
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      <footer className="modal-footer">
        <button className="button" onClick={close}>
          {receipt ? "完成" : "稍后继续"}
        </button>
        <button
          className="button primary"
          disabled={!ready || !page || !intent || !!busy}
          onClick={() => void save()}
        >
          {busy ? (
            <Spinner />
          ) : receipt ? (
            <RefreshCw size={15} />
          ) : (
            <Check size={15} />
          )}
          {receipt ? "再次核对保存" : "保存到此知识库"}
        </button>
      </footer>
    </Modal>
  );
}
