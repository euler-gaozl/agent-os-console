import assert from "node:assert/strict";
import React from "react";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ModelCapabilities, modelCapabilitySource, nativeModelDraft } from "../src/model-capabilities";

const model = { base_url: "https://api.deepseek.com", model: "deepseek-flash", key_env: "PROVIDER_KEY" };
const limits = { ...model, protocol: "openai-chat-completions", context_window: 1048576, max_output_tokens: 393216, source: "https://api.deepseek.com/models", observed_at: "2026-10-14T00:00:00Z", metadata_sha256: "a".repeat(64) };
test("native conversion keeps old revision intact and removes inherited token allowances", () => {
  const previous = { model: { ...model, max_tokens: 4096 }, context_bytes: 64000, context_tokens: 32000, model_token_budget: 250000, max_model_attempts: 12, prompt: "用户约束", skills: [{ id: "evidence", revision: 3 }] };
  const next = nativeModelDraft(previous);
  assert.equal(previous.model.max_tokens, 4096);
  assert.equal(next.model.max_tokens, 0);
  assert.equal(next.model_token_budget, 0);
  assert.equal(next.context_tokens, 0);
  assert.deepEqual(next.model.limits, {});
  assert.equal(next.max_model_attempts, 12);
  assert.deepEqual(next.skills, previous.skills);
  assert.equal(next.prompt, previous.prompt);
});
test("capability display refuses mismatched or credential-bearing sources", () => {
  assert.equal(modelCapabilitySource(model, limits), limits.source);
  for (const changed of [ { model: "other" }, { base_url: "https://elsewhere.invalid" }, { source: "javascript:alert(1)" }, { source: "https://api.deepseek.com/models?key=secret" }, { source: "https://user:secret@api.deepseek.com/models" }, { max_output_tokens: 1048577 }, { context_window: 1.5 }, { observed_at: "unknown" } ]) {
    assert.equal(modelCapabilitySource(model, { ...limits, ...changed }), null);
  }
});
test("native display states shared physical window without editable token caps", () => {
  const html = renderToStaticMarkup(<ModelCapabilities model={{ ...model, limits }} enableNative={() => {}} />);
  assert.match(html, /1,048,576/);
  assert.match(html, /393,216/);
  assert.match(html, /输入与输出共享模型窗口/);
  assert.doesNotMatch(html, /type="number"/);
  assert.doesNotMatch(html, /PROVIDER_KEY/);
});
test("unresolved capability and legacy configuration remain visibly distinct", () => {
  const native = renderToStaticMarkup(<ModelCapabilities model={{ ...model, limits: {} }} enableNative={() => {}} />);
  const legacy = renderToStaticMarkup(<ModelCapabilities model={model} enableNative={() => {}} />);
  assert.match(native, /读取模型能力/);
  assert.doesNotMatch(native, /1,048,576/);
  assert.match(legacy, /当前版本保留历史额度/);
  assert.match(legacy, /新版本使用原生能力/);
});
