import assert from "node:assert/strict";
import React from "react";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  hasArchiveManifest,
  SOURCE_ENGINE,
  RESIDENT_ENGINE,
  isSourceEngine,
  loadWorkingView,
  WorkingStateContent,
  type WorkingView,
} from "../src/working-state";

const view: WorkingView = {
  run_id: "test-run",
  task: "Compare supply and inventory; fixture only.",
  constraints: ["Keep actual data separate from plans."],
  rule_revision: 4,
  source_rule_revision: 2,
  revision: 3,
  stale: true,
  state: {
    format: 1,
    phase: "Source verification",
    questions: [{ id: "q", text: "Which reporting date?", status: "open" }],
    observations: [
      {
        id: "actual",
        kind: "observation",
        text: "Actual fixture: 17 units",
        receipts: ["test-run/dsh/3"],
      },
      {
        id: "plan",
        kind: "plan",
        text: "Planned fixture: 20 units",
        receipts: ["test-run/dsh/3"],
      },
      {
        id: "forecast",
        kind: "third_party_forecast",
        text: "Third-party fixture: 24 units <script>unsafe()</script>",
        receipts: ["test-run/dsh/3"],
      },
    ],
    conflicts: [
      {
        id: "c",
        text: "Reporting periods differ",
        observations: ["actual", "plan"],
      },
    ],
    next_steps: [{ id: "next", text: "Read source dates", status: "pending" }],
  },
  evidence: [
    { operation_id: "test-run/dsh/3", response_sha256: "a".repeat(64) },
  ],
};
test("history retains current constraints, staleness and provenance without treating classifications as verified facts", () => {
  const html = renderToStaticMarkup(
    <WorkingStateContent view={view} historical />,
  );
  for (const value of [
    "约束 v4",
    "基于约束 v2",
    "正在查看历史",
    "不代表事实已核实",
    "观察记录",
    "第三方预测",
    "计划",
    "Reporting periods differ",
    "a".repeat(64),
    "读取回执原文",
    "test-run/dsh/3",
  ])
    assert.ok(html.includes(value), value);
  assert.ok(!html.includes("<script>"), "untrusted working data became markup");
  const empty = renderToStaticMarkup(
    <WorkingStateContent
      view={{ ...view, state: null, stale: false, revision: 0, evidence: [] }}
    />,
  );
  assert.ok(empty.includes("尚未保存工作状态"));
  assert.ok(!empty.includes("工作状态 v0"));
  assert.equal(hasArchiveManifest(SOURCE_ENGINE), true);
  assert.equal(hasArchiveManifest(RESIDENT_ENGINE), true);
  assert.equal(isSourceEngine(RESIDENT_ENGINE), true);
  assert.equal(isSourceEngine(SOURCE_ENGINE), true);
  assert.equal(isSourceEngine("dsh-0.2.0-rc.2"), false);
  assert.equal(hasArchiveManifest("dsh-0.2.0-rc.2"), false);
});
test("working-state reads retain requested run and revision and surface failures", async (t) => {
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: { getItem: () => null },
  });
  t.after(() => {
    delete (globalThis as any).sessionStorage;
  });
  let reply = view;
  const mock = t.mock.method(globalThis, "fetch", async (path) => {
    assert.equal(path, "/api/runs/test-run/working-state?revision=3");
    return new Response(JSON.stringify(reply));
  });
  assert.deepEqual(await loadWorkingView("test-run", 3), view);
  reply = { ...view, run_id: "different" };
  await assert.rejects(() => loadWorkingView("test-run", 3), /版本不匹配/);
  reply = { ...view, revision: 4 };
  await assert.rejects(() => loadWorkingView("test-run", 3), /版本不匹配/);
  mock.mock.mockImplementation(
    async () =>
      new Response(JSON.stringify({ error: "offline" }), { status: 503 }),
  );
  await assert.rejects(() => loadWorkingView("test-run", 3), /offline/);
});
