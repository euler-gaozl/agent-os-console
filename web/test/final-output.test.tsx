import assert from "node:assert/strict";
import React from "react";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { boundFinalTools, FinalOutputEditor, finalOutputError } from "../src/final-output";
import { nativeModelDraft } from "../src/model-capabilities";

const policy = { protocol: "receipt-field-v1", tool: "mcp_review_check", input_field: "draft", ready_path: ["structuredContent", "ready"] };
test("editing and native model conversion preserve the complete fixed delivery policy", () => {
  const previous = { prompt: "原约束", final_output: policy, model: { max_tokens: 8192 } };
  const draft = nativeModelDraft(previous);
  assert.equal(finalOutputError(draft), "");
  assert.deepEqual(JSON.parse(JSON.stringify({ ...draft, prompt: "新约束" })).final_output, policy);
  assert.equal(previous.model.max_tokens, 8192);
  assert.deepEqual(previous.final_output, policy);
  assert.equal(finalOutputError({ ...draft, final_output: undefined }), "");
  assert.ok(finalOutputError(previous));
});
test("invalid policies cannot be silently repaired before saving", () => {
  for (const changed of [{ protocol: "future-v2" }, { tool: "final_output_commit" }, { tool: "working_state_update" },
    { tool: "a.b" }, { tool: "x".repeat(129) }, { input_field: "arguments.draft" }, { ready_path: [] },
    { ready_path: ["structuredContent", "", "ready"] }, { ready_path: ["ready[0]"] }, { ready_path: Array(9).fill("a") },
    { ready_path: "ready" }, { tool: null }]) {
    const draft = { model: { limits: {} }, final_output: { ...policy, ...changed } as any };
    const original = JSON.stringify(draft);
    assert.ok(finalOutputError(draft), JSON.stringify(changed));
    assert.equal(JSON.stringify(draft), original);
  }
});
test("bound tools use exact immutable connector identity and never a catalog summary", async () => {
  const refs = [{ id: "review-id", revision: 3 }, { id: "another", revision: 7 }];
  const reads: any[] = [];
  const result = await boundFinalTools(refs, async ref => {
    reads.push(ref);
    return { ...ref, summary: false, spec: { name: ref.id === "review-id" ? "研究草稿字段与比较检查" : "另一个显示名", tools: [{ name: "check" }] } };
  });
  assert.deepEqual(reads.map(r => [r.kind, r.id, r.revision, r.summary]), [["connector", "review-id", 3, true], ["connector", "another", 7, true]]);
  assert.deepEqual(result.map(t => t.name), ["mcp_review-id_check", "mcp_another_check"]);
  assert.match(result[0].label, /研究草稿字段与比较检查/);
  for (const bad of [{ summary: true }, { id: "other" }, { revision: 4 }, { kind: "agent" }, { spec: { name: "review" } }]) {
    await assert.rejects(boundFinalTools([refs[0]], async ref => ({ ...ref, summary: false, spec: { name: "review", tools: [] }, ...bad })));
  }
  await assert.rejects(boundFinalTools(refs, async () => { throw Error("ToolHub unavailable"); }));
});
test("delivery editor describes structural readiness without a claim of verified research", () => {
  const html = renderToStaticMarkup(<FinalOutputEditor draft={{ model: { limits: {} }, final_output: policy }} change={() => assert.fail("render changed policy")} />);
  for (const text of ["交付已检查原文", "结构就绪不代表事实", "JSON 布尔值 true", "mcp_review_check", "structuredContent.ready"]) assert.ok(html.includes(text), text);
  const unknown = renderToStaticMarkup(<FinalOutputEditor draft={{ model: { limits: {} }, final_output: { ...policy, protocol: "future-v2" } }} change={() => assert.fail("render changed policy")} />);
  assert.match(unknown, /不支持这项交付协议/);
  assert.doesNotMatch(unknown, /<input/);
});
