import assert from "node:assert/strict";
import React from "react";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { RunArchiveButton, RunEvidenceDetails } from "../src/run-evidence";

const sourceEngines = [
  "dsh-source-639ed015-state-v1",
  "dsh-source-639ed015-resident-v2",
  "dsh-source-639ed015-budget-v3",
  "dsh-source-639ed015-native-v4",
  "dsh-source-639ed015-final-v5",
];

test("all five fixed source engines render the real working-state and archive surfaces", () => {
  for (const engine of sourceEngines) {
    const html = renderToStaticMarkup(
      <RunEvidenceDetails id="run-one" engine={engine} status="failed" refreshRun={async () => {}} />,
    );
    assert.ok(html.includes('aria-label="已保存的工作状态"'), engine);
    assert.ok(html.includes("正在读取已保存的版本"), engine);
    assert.ok(html.includes("查看历史"), engine);
    assert.ok(html.includes("执行记录按批次保存"), engine);
    assert.ok(!html.includes("从已保存的回执继续"), "failed is not source-state recovery permission");
  }
});

test("evidence-v1 keeps only its manifest and legacy or unknown engines gain no state surface", () => {
  for (const [engine, manifest] of [
    ["dsh-0.2.0-rc.2-evidence-v1", true],
    ["dsh-0.2.0-rc.2", false],
    ["legacy-go", false],
    ["", false],
    ["dsh-source-639ed015-native-v5", false],
    ["dsh-source-639ed015-native-v4-extra", false],
  ] as const) {
    const html = renderToStaticMarkup(
      <RunEvidenceDetails id="run-one" engine={engine} status="waiting_unknown" refreshRun={async () => {}} />,
    );
    assert.equal(html.includes("执行记录按批次保存"), manifest, engine);
    assert.ok(!html.includes("已保存的工作状态"), engine);
    assert.ok(!html.includes("继续当前任务"), engine);
  }
});

test("source waiting_unknown shows recovery checks without granting a continue action", () => {
  for (const engine of sourceEngines) {
    const html = renderToStaticMarkup(
      <RunEvidenceDetails id="run-one" engine={engine} status="waiting_unknown" refreshRun={async () => {}} />,
    );
    assert.ok(html.includes("正在检查恢复条件"), engine);
    assert.ok(!html.includes("从已保存的回执继续"), engine);
    assert.ok(!html.includes("提交核对记录"), engine);
  }
});

test("the displayed archive button downloads the matching original artifact and filename", () => {
  for (const [engine, manifest] of [
    ...sourceEngines.map((engine) => [engine, true] as const),
    ["dsh-0.2.0-rc.2-evidence-v1", true],
    ["dsh-0.2.0-rc.2", false],
    ["dsh-source-639ed015-native-v5", false],
  ] as const) {
    const calls: [string, string][] = [];
    const button = RunArchiveButton({
      id: "run-one",
      engine,
      artifact: "a".repeat(64),
      download: (artifact, filename) => calls.push([artifact, filename]),
    });
    assert.ok(button);
    const html = renderToStaticMarkup(button);
    assert.equal(html.includes("下载执行记录清单"), manifest, engine);
    assert.equal(html.includes("下载完整 DSH 执行记录"), !manifest, engine);
    assert.equal(calls.length, 0, "render must not download or continue execution");
    button.props.onClick();
    assert.deepEqual(calls, [["a".repeat(64), manifest ? "dsh-manifest-run-one.json" : "dsh-run-one.json"]]);
  }
});

test("an absent artifact does not render an actionable download", () => {
  const button = RunArchiveButton({
    id: "run-one",
    engine: sourceEngines[3],
    download: () => assert.fail("missing artifact requested"),
  });
  assert.equal(button, null);
});
