import React, { useEffect, useRef, useState } from "react";
import { api, date, Spinner } from "./shared";

export type ModelLimits = {
  model: string;
  base_url: string;
  protocol: string;
  context_window: number;
  max_output_tokens: number;
  source: string;
  observed_at: string;
  metadata_sha256: string;
};
export type ModelConnection = {
  model: string;
  base_url: string;
  key_env: string;
  max_tokens?: number;
  limits?: Partial<ModelLimits>;
};

export function modelIdentity(model: ModelConnection) {
  return JSON.stringify([model.base_url, model.model, model.key_env]);
}

// A new observation is requested from Registry on save. Browser values never
// authorize a provider endpoint or change a saved revision's capabilities.
export function nativeModelDraft(draft: Record<string, any>) {
  return {
    ...draft,
    model: { ...draft.model, max_tokens: 0, limits: {} },
    context_tokens: 0,
    context_bytes: 0,
    model_token_budget: 0,
  };
}

export function modelCapabilitySource(model: ModelConnection, limits?: Partial<ModelLimits>) {
  if (!limits || limits.model !== model.model || limits.base_url !== model.base_url.replace(/\/+$/, "") ||
      limits.protocol !== "openai-chat-completions" ||
      !Number.isSafeInteger(limits.context_window) || !Number.isSafeInteger(limits.max_output_tokens) ||
      limits.context_window! <= 0 || limits.max_output_tokens! <= 0 || limits.max_output_tokens! > limits.context_window! ||
      !/^[a-f0-9]{64}$/.test(limits.metadata_sha256 || "") || !Number.isFinite(Date.parse(limits.observed_at || ""))) return null;
  try {
    const base = new URL(limits.base_url!);
    const source = new URL(limits.source!);
    if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash ||
        source.protocol !== "https:" || source.origin !== base.origin || source.username || source.password || source.search || source.hash ||
        source.pathname !== base.pathname.replace(/\/+$/, "") + "/models") return null;
    return source.href;
  } catch { return null; }
}

export function ModelCapabilities({ model, enableNative }: {
  model: ModelConnection;
  enableNative: () => void;
}) {
  // A save may freeze a newer observation for the same connection. Do not let
  // an earlier preview (including an in-flight reply) mask the saved values.
  const identity = JSON.stringify([modelIdentity(model), model.limits ?? null]);
  const current = useRef(identity);
  current.current = identity;
  const generation = useRef(0);
  const [preview, setPreview] = useState<{ identity: string; limits: ModelLimits }>();
  const [request, setRequest] = useState<{ identity: string; busy: boolean; error?: string }>();
  useEffect(() => () => { generation.current++; }, []);
  const native = model.limits != null;
  const limits = preview?.identity === identity ? preview.limits : model.limits;
  const source = modelCapabilitySource(model, limits);
  const busy = request?.identity === identity && request.busy;
  const error = request?.identity === identity ? request.error : "";
  const resolve = async () => {
    const version = ++generation.current;
    setRequest({ identity, busy: true });
    try {
      const resolved = await api<ModelLimits>("/models/resolve", {
        base_url: model.base_url, model: model.model, key_env: model.key_env,
      });
      if (version !== generation.current || current.current !== identity) return;
      if (!modelCapabilitySource(model, resolved)) throw new Error("返回的模型能力与当前连接不匹配。");
      setPreview({ identity, limits: resolved });
      setRequest({ identity, busy: false });
    } catch (e) {
      if (version !== generation.current || current.current !== identity) return;
      setRequest({ identity, busy: false, error: "无法读取模型能力：" + (e as Error).message });
    }
  };
  return <section className="model-capabilities" aria-label="模型输入输出能力">
    <div className="model-capabilities-heading">
      <div><b>{native ? "使用模型原生能力" : "当前版本保留历史额度"}</b>
        <p>{native ? "保存时从供应商读取能力并固定到新版本，无额外的输入或输出 token 额度。" : "修改只作用于新版本，已提交的任务继续使用原配置。"}</p></div>
      {native ? <button type="button" className="button" disabled={busy} onClick={() => void resolve()}>
        {busy && <Spinner />} {source ? "刷新能力" : "读取模型能力"}
      </button> : <button type="button" className="button" onClick={enableNative}>新版本使用原生能力</button>}
    </div>
    {error && <p role="alert" className="inline-warning">{error}</p>}
    {native && source && <>
      <dl className="model-capabilities-values">
        <div><dt>输入与输出总窗口</dt><dd>{limits!.context_window!.toLocaleString("zh-CN")} <small>tokens</small></dd></div>
        <div><dt>单次输出能力</dt><dd>{limits!.max_output_tokens!.toLocaleString("zh-CN")} <small>tokens</small></dd></div>
      </dl>
      <p className="field-hint">来源：<a href={source} target="_blank" rel="noreferrer">供应商模型接口</a> · {date(limits!.observed_at!)}{preview?.identity === identity ? " · 当前预览" : " · 已保存版本"}</p>
    </>}
    {native && <p className="field-hint">输入与输出共享模型窗口。接近容量时由 DSH 压缩上下文，原始资料保留供回查。能力读取失败时不会保存新版本。</p>}
  </section>;
}
