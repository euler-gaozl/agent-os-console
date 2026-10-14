// Browser-only synthetic acceptance harness; not a production entrypoint.
// Real UI component, no live service credentials, network collection or model.
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { CaptureImportDialog } from "../src/capture-import";
import "../src/console.css";
import "../src/console-layout.css";
import "../src/capture-import.css";

const hash = "b".repeat(64),
  body = "[合成验收资料，并非期货事实] 🙂原文、统计期与计划分别核对。\n".repeat(
    95,
  );
const fixtureKey = "capture-ui-fixture-state-v1";
const state = JSON.parse(
  localStorage.getItem(fixtureKey) ||
    '{"captures":{},"imports":{},"requests":[]}',
);
let holdCapture = false,
  holdImport = false,
  drop = false,
  configured = true;
let pending: (() => void)[] = [];
const originalFetch = globalThis.fetch;
const persist = () => localStorage.setItem(fixtureKey, JSON.stringify(state));
const page = (c: any, offset = 0) => ({
  ...c,
  content: Array.from(body)
    .slice(offset, offset + 1200)
    .join(""),
  next_offset: Math.min(offset + 1200, Array.from(body).length),
  total_characters: Array.from(body).length,
  has_more: offset + 1200 < Array.from(body).length,
});
globalThis.fetch = async (path, options) => {
  if (!String(path).startsWith("/api/")) return originalFetch(path, options);
  const u = new URL(String(path), location.origin),
    input = options?.body ? JSON.parse(options.body as string) : undefined;
  state.requests.push({ path: u.pathname, input });
  persist();
  const result = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status });
  if (u.pathname.endsWith("/capture-capabilities"))
    return result({ protocol: "source-capture-v1", durable_capture_ids: true });
  if (u.pathname.endsWith("/capture-import-capabilities"))
    return result({
      protocol: "source-capture-import-v1",
      atomic: true,
      configured,
      source_archive_formats: [1, 2],
    });
  if (u.pathname === "/api/sources/captures" && input) {
    const old = state.captures[input.capture_id];
    if (old && old.url !== input.url)
      return result({ error: "capture ID conflict" }, 409);
    const captured = old || {
      capture_id: input.capture_id,
      url: input.url,
      title: "合成资料 · 中文分页与恢复",
      fetched_at: "2026-10-14T00:00:00Z",
      raw_sha256: hash,
      extraction_version: "agentos-text-html-v1",
    };
    state.captures[input.capture_id] = captured;
    persist();
    if (holdCapture)
      await new Promise<void>((resolve) => pending.push(resolve));
    if (drop) throw new TypeError("夹具：服务端已提交，回复丢失");
    return result(page(captured));
  }
  if (u.pathname === "/api/sources/captures")
    return result({
      items: Object.values(state.captures).filter(
        (c: any) => c.url === u.searchParams.get("url"),
      ),
      next_cursor: "",
    });
  if (u.pathname.startsWith("/api/sources/captures/")) {
    const captured = state.captures[u.pathname.split("/").at(-1)!];
    return captured
      ? result(page(captured, Number(u.searchParams.get("offset") || 0)))
      : result({ error: "capture not found" }, 404);
  }
  if (u.pathname === "/api/knowledge/import-capture") {
    const captured = state.captures[input.capture_id];
    if (!captured) return result({ error: "capture not found" }, 404);
    const key = JSON.stringify(input);
    const n = Object.keys(state.imports).length + 1;
    const fid = n.toString(16).padStart(32, "0"),
      did = (n + 100).toString(16).padStart(32, "0");
    state.imports[key] ||= {
      file: {
        id: fid,
        document_id: did,
        kb_id: input.knowledge.id,
        kb_revision: input.knowledge.revision,
        artifact_hash: "e".repeat(64),
        status:
          input.knowledge.id === "fixture-b" ? "external_pending" : "ready",
      },
      source: {
        manifest_sha256: "f".repeat(64),
        archive: {
          format: 2,
          file_id: fid,
          document_id: did,
          knowledge: input.knowledge,
          url: captured.url,
          raw_sha256: hash,
          text_sha256: "1".repeat(64),
          stored_raw_sha256: hash,
          capture: { capture_id: captured.capture_id },
        },
      },
    };
    persist();
    if (holdImport) await new Promise<void>((resolve) => pending.push(resolve));
    if (drop) throw new TypeError("夹具：服务端已提交，回复丢失");
    return result(state.imports[key]);
  }
  return result({ error: "unknown fixture route" }, 404);
};

function Fixture() {
  const [selected, select] = useState<string>();
  const [callbacks, callback] = useState<string[]>([]);
  const [report, setReport] = useState("");
  return (
    <main style={{ padding: 32 }}>
      <h1>采集组件故障验收</h1>
      <p>仅合成 HTTP 回包。不会连接实际数据、模型或服务器。</p>
      <div className="button-row">
        <button className="button" onClick={() => select("fixture-a")}>
          打开资料库 A
        </button>
        <button className="button" onClick={() => select("fixture-b")}>
          打开资料库 B
        </button>
        <button
          className="button"
          onClick={() => {
            pending.splice(0).forEach((resolve) => resolve());
          }}
        >
          释放全部回复
        </button>
        <button
          className="button"
          onClick={() => {
            setTimeout(
              () => pending.splice(0).forEach((resolve) => resolve()),
              3000,
            );
          }}
        >
          3 秒后释放回复
        </button>
        <button
          className="button"
          onClick={() =>
            setReport(
              JSON.stringify(
                {
                  captures: Object.keys(state.captures).length,
                  imports: Object.values(state.imports).map((r: any) => r.file),
                  callbacks,
                  requests: state.requests,
                },
                null,
                2,
              ),
            )
          }
        >
          查看验收记录
        </button>
      </div>
      <p>
        <label>
          <input
            type="checkbox"
            onChange={(e) => {
              holdCapture = e.target.checked;
            }}
          />
          延迟采集回复
        </label>
      </p>
      <p>
        <label>
          <input
            type="checkbox"
            onChange={(e) => {
              holdImport = e.target.checked;
            }}
          />
          延迟保存回复
        </label>
      </p>
      <p>
        <label>
          <input
            type="checkbox"
            onChange={(e) => {
              drop = e.target.checked;
            }}
          />
          丢失写请求回复
        </label>
      </p>
      <p>
        <label>
          <input
            type="checkbox"
            onChange={(e) => {
              configured = !e.target.checked;
            }}
          />
          禁用保存能力
        </label>
      </p>
      <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
        {report}
      </pre>
      {selected && (
        <CaptureImportDialog
          key={selected}
          knowledge={{ id: selected, revision: 1 }}
          name={selected === "fixture-a" ? "资料库 A" : "资料库 B · 外部索引"}
          close={() => select(undefined)}
          saved={() => callback((old) => [...old, selected])}
        />
      )}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
