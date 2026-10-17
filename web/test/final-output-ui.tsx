// Synthetic fixture of the production editor. No server writes or model calls.
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { FinalOutputEditor, finalOutputError } from "../src/final-output";
import { nativeModelDraft } from "../src/model-capabilities";
import "../src/console.css";
import "../src/final-output.css";
let hold = false, fail = false;
const waiting: (() => void)[] = [];
globalThis.fetch = async path => {
  const match = String(path).match(/^\/api\/toolhub\/assets\/connector\/review\/(3|7)$/);
  if (!match) throw Error("unexpected request");
  const revision = Number(match[1]);
  const response = new Response(JSON.stringify(fail ? { error: "fixture unavailable" } : {
    kind: "connector", id: "review", revision, spec: { name: "review", tools: [{ name: `check_v${revision}` }] },
  }), { status: fail ? 503 : 200 });
  if (hold) await new Promise<void>(resolve => waiting.push(resolve));
  return response;
};
function Fixture() {
  const [draft, setDraft] = useState<any>({ model: { limits: {} }, connectors: [{ id: "review", revision: 3 }] });
  const [message, setMessage] = useState(""), [saved, setSaved] = useState<any>(), [narrow, setNarrow] = useState(false);
  return <main style={{ width: narrow ? 360 : "100%", maxWidth: 780, padding: 16, margin: "auto" }}>
    <h1>模型与执行</h1><p>合成界面验收；无真实写入或供应商调用。</p>
    <FinalOutputEditor draft={draft} change={final_output => setDraft({ ...draft, final_output })} />
    <div className="button-row">
      <button className="button" onClick={() => { const error = finalOutputError(draft); setMessage(error || "模拟保存成功"); if (!error) setSaved(JSON.parse(JSON.stringify(draft))); }}>模拟保存</button>
      <button className="button" disabled={!saved} onClick={() => { setDraft(saved); setMessage("已重新打开保存版本"); }}>重新打开保存版本</button>
      <button className="button" onClick={() => setDraft({ ...draft, model: {} })}>使用历史模型</button>
      <button className="button" onClick={() => setDraft(nativeModelDraft(draft))}>启用原生能力</button>
      <button className="button" onClick={() => { hold = !hold; setMessage(`延迟回复：${hold}`); }}>切换延迟回复</button>
      <button className="button" onClick={() => { hold = false; for (const resolve of waiting.splice(0)) resolve(); }}>返回挂起回复</button>
      <button className="button" onClick={() => setDraft({ ...draft, connectors: [{ id: "review", revision: 7 }] })}>切换绑定到 v7</button>
      <button className="button" onClick={() => { fail = !fail; setMessage(`读取失败：${fail}`); }}>切换读取失败</button>
      <button className="button" onClick={() => setNarrow(!narrow)}>切换窄屏容器</button>
    </div>
    <p role="status">{message}</p><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(draft, null, 2)}</pre>
  </main>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
