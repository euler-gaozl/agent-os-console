import React, { useEffect, useId, useState } from "react";
import { Field, resourceDetail, type Ref, type Resource } from "./shared";

export type FinalOutputPolicy = {
  protocol: string;
  tool: string;
  input_field: string;
  ready_path: string[];
};
type Draft = { model?: { limits?: unknown }; final_output?: FinalOutputPolicy | null; connectors?: Ref[] };
type ToolOption = { name: string; label: string };
const namePattern = /^[A-Za-z_][A-Za-z0-9_-]{0,127}$/;

// These are editing hints only. Registry resolves immutable bindings and Runtime
// validates the frozen snapshot; a browser choice never authorizes execution.
export function finalOutputError(draft: Draft): string {
  const policy = draft.final_output;
  if (policy == null) return "";
  if (draft.model?.limits == null) return "原文交付需要先启用模型原生能力。";
  if (policy.protocol !== "receipt-field-v1") return "当前页面不支持这项交付协议，请保留原配置并升级中台。";
  if (typeof policy.tool !== "string" || !namePattern.test(policy.tool) ||
      ["final_output_commit", "working_state_update"].includes(policy.tool)) return "请输入已绑定的检查工具名，不能使用执行器保留工具。";
  if (typeof policy.input_field !== "string" || !namePattern.test(policy.input_field)) return "输入字段必须是合法的顶层对象字段名。";
  if (!Array.isArray(policy.ready_path) || policy.ready_path.length < 1 || policy.ready_path.length > 8 ||
      policy.ready_path.some(key => typeof key !== "string" || !namePattern.test(key))) return "就绪路径需包含 1–8 个对象字段，用英文句点分隔，不能留空。";
  return "";
}

export async function boundFinalTools(refs: Ref[], read: (r: Resource) => Promise<Resource> = resourceDetail): Promise<ToolOption[]> {
  const resources = await Promise.all(refs.map(ref => read({ kind: "connector", ...ref, summary: true, spec: {} })));
  return resources.flatMap((r, i) => {
    if (r.summary || r.kind !== "connector" || r.id !== refs[i].id || r.revision !== refs[i].revision ||
        typeof r.spec?.name !== "string" || !Array.isArray(r.spec.tools)) throw new Error("绑定的 MCP 版本或工具列表无效。");
    return r.spec.tools.map((tool: { name: string }) => ({
      name: `mcp_${r.id}_${tool.name}`,
      label: `${r.spec.name} / ${tool.name} · v${r.revision}`,
    })).filter((option: ToolOption) => namePattern.test(option.name));
  });
}

export function FinalOutputEditor({ draft, change }: { draft: Draft; change: (value: FinalOutputPolicy | undefined) => void }) {
  const policy = draft.final_output;
  const listID = useId();
  const bindingKey = JSON.stringify(draft.connectors || []);
  const [retry, setRetry] = useState(0);
  const [options, setOptions] = useState<{ key: string; tools?: ToolOption[]; error?: string }>();
  const key = JSON.stringify([bindingKey, retry, policy != null]);
  useEffect(() => {
    if (policy == null) return;
    let current = true;
    // Capture exact revisions; a late response from a previous binding cannot
    // replace the choices or the policy currently being edited.
    void boundFinalTools(JSON.parse(bindingKey)).then(
      tools => { if (current) setOptions({ key, tools }); },
      () => { if (current) setOptions({ key, error: "无法读取绑定的 MCP 工具。原配置已保留；保存时仍由 Registry 校验。" }); },
    );
    return () => { current = false; };
  }, [key]);
  const current = options?.key === key ? options : undefined;
  const unsupported = policy != null && policy.protocol !== "receipt-field-v1";
  const error = finalOutputError(draft);
  return <section className="final-output" aria-label="交付方式">
    <div className="final-output-heading"><b>交付方式</b><span>固定到 Agent 新版本</span></div>
    <Field label="结果生成方式">
      <select value={policy == null ? "answer" : "receipt"} onChange={event => change(event.target.value === "answer" ? undefined : {
        protocol: "receipt-field-v1", tool: "", input_field: "draft", ready_path: ["structuredContent", "ready"],
      })}>
        <option value="answer">模型直接回答</option>
        <option value="receipt">交付已检查原文</option>
      </select>
    </Field>
    {policy == null ? <p className="field-hint">使用模型最后一次回答作为结果。</p> : <>
      <p className="final-output-description">检查工具返回明确的就绪信号后，执行器从已提交回执读取送检原文。模型最后一步不再复制或改写这份内容。</p>
      {error && <p role="alert" className="inline-warning">{error}</p>}
      {!unsupported && <>
        <Field label="检查工具名" hint="可从已绑定 MCP 的固定版本中选择；其他工具请填写完整执行名称。Registry 会在保存时核对绑定。">
          <input list={listID} autoComplete="off" value={policy.tool} onChange={event => change({ ...policy, tool: event.target.value })} />
        </Field>
        <datalist id={listID}>{current?.tools?.map((tool, i) => <option key={`${tool.name}:${i}`} value={tool.name}>{tool.label}</option>)}</datalist>
        {!current && <p role="status" className="field-hint">正在读取绑定工具…</p>}
        {current?.error && <div className="final-output-retry"><p role="status" className="field-hint">{current.error}</p><button type="button" className="button" onClick={() => setRetry(value => value + 1)}>重新读取工具</button></div>}
        <div className="final-output-fields">
          <Field label="原文输入字段" hint="工具输入中的一个字符串字段，不改动空白或换行。">
            <input autoComplete="off" value={policy.input_field} onChange={event => change({ ...policy, input_field: event.target.value })} />
          </Field>
          <Field label="就绪结果路径" hint="只接受 JSON 布尔值 true；文字“true”无效。">
            <input autoComplete="off" value={Array.isArray(policy.ready_path) ? policy.ready_path.join(".") : ""} onChange={event => change({ ...policy, ready_path: event.target.value.split(".") })} />
          </Field>
        </div>
      </>}
      <p className="final-output-boundary">原文一致只证明交付内容没有再次改写。结构就绪不代表事实、引文或研究完整性已核实。</p>
    </>}
  </section>;
}
