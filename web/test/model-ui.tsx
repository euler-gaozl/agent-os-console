// Synthetic UI fixture; excluded from the production entrypoint.
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { ModelCapabilities, nativeModelDraft } from "../src/model-capabilities";
import "../src/console.css";
import "../src/model-capabilities.css";

let hold = false, fail = false;
const waiting: (() => void)[] = [];
globalThis.fetch = async (path, options) => {
  if (path !== "/api/models/resolve") throw new Error("unexpected fixture request");
  const model = JSON.parse(String(options?.body));
  const response = new Response(JSON.stringify(fail ? { error: "合成供应商暂不可用" } : {
    model: model.model, base_url: model.base_url, protocol: "openai-chat-completions",
    context_window: 1048576, max_output_tokens: 393216,
    source: model.base_url + "/models", observed_at: "2026-10-14T00:00:00Z", metadata_sha256: "b".repeat(64),
  }), { status: fail ? 502 : 200 });
  if (hold) await new Promise<void>((resolve) => waiting.push(resolve));
  return response;
};
function Fixture() {
  const initial = { model: { base_url: "https://api.deepseek.com", model: "deepseek-flash", key_env: "SYNTHETIC_KEY", max_tokens: 4096 }, model_token_budget: 250000, max_model_attempts: 12 };
  const [draft, setDraft] = useState<any>(initial), [shown, setShown] = useState(true);
  return <main style={{ maxWidth: 760, padding: 24, margin: "auto" }}>
    <h1>模型与执行设置</h1><p>合成交互验收，不访问供应商、不保存 Agent。</p>
    <label>模型名称<input aria-label="模型名称" value={draft.model.model} onChange={e => setDraft({ ...draft, model: { ...draft.model, model: e.target.value, ...(draft.model.limits ? { limits: {} } : {}) } })} /></label>
    {shown && <ModelCapabilities model={draft.model} enableNative={() => setDraft(nativeModelDraft(draft))} />}
    <div className="button-row">
      <button onClick={() => { hold = !hold; }}>切换延迟回复</button>
      <button onClick={() => { for (const resolve of waiting.splice(0)) resolve(); }}>返回挂起回复</button>
      <button onClick={() => { fail = !fail; }}>切换供应商失败</button>
      <button onClick={() => setShown(!shown)}>关闭或重新打开</button>
      <button onClick={() => setDraft(initial)}>恢复历史配置</button>
      <button onClick={() => setDraft({ ...nativeModelDraft(draft), model: { ...draft.model, max_tokens: 200000, limits: {
        model: draft.model.model, base_url: draft.model.base_url, protocol: "openai-chat-completions", context_window: 1000000,
        max_output_tokens: 200000, source: draft.model.base_url + "/models", observed_at: "2026-10-14T01:00:00Z", metadata_sha256: "c".repeat(64),
      } } })}>模拟保存返回新能力</button>
    </div>
    <p>当前总 token 额度：{draft.model_token_budget}；模型尝试次数：{draft.max_model_attempts}</p>
  </main>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
