import assert from "node:assert/strict";
import React from "react";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CallReceipts,
  ReceiptReader,
  loadCallPage,
  loadCallSegment,
  type CallPage,
  type CallSegment,
} from "../src/call-receipts";

test("receipt reads scope pages, encode operation IDs and never fall back to full history", async (t) => {
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: { getItem: () => null },
  });
  t.after(() => {
    delete (globalThis as any).sessionStorage;
  });
  const page: CallPage = {
    run_id: "run",
    filter: "unresolved",
    items: [],
    next_cursor: "",
  };
  const version = "a".repeat(64);
  const part: CallSegment = {
    run_id: "run",
    operation_id: "run/tool/甲醇?&",
    kind: "tool",
    status: "completed",
    field: "response",
    text: "🙂甲",
    value_null: false,
    offset: 8192,
    next_offset: null,
    version,
  };
  let reply: unknown = page;
  let status = 200;
  const paths: string[] = [];
  t.mock.method(globalThis, "fetch", async (path) => {
    paths.push(String(path));
    assert.ok(
      /\/calls\/(page|record)\?/.test(String(path)),
      "unbounded fallback requested",
    );
    return new Response(JSON.stringify(reply), { status });
  });
  assert.deepEqual(await loadCallPage("run", "unresolved", "opaque"), page);
  assert.equal(
    paths[0],
    "/api/runs/run/calls/page?limit=25&filter=unresolved&after=opaque",
  );
  for (const bad of [
    { ...page, run_id: "another" },
    { ...page, filter: "all" },
    { ...page, items: Array(26).fill({ id: "same" }) },
    { ...page, items: [{ id: "same" }, { id: "same" }] },
  ]) {
    reply = bad;
    await assert.rejects(() => loadCallPage("run", "unresolved"), /不匹配/);
  }
  reply = part;
  assert.deepEqual(
    await loadCallSegment("run", part.operation_id, "response", 8192, version),
    part,
  );
  const query = new URL(paths.at(-1)!, "http://fixture.invalid").searchParams;
  assert.equal(query.get("operation_id"), part.operation_id);
  assert.equal(query.get("version"), version);
  for (const bad of [
    { ...part, run_id: "other" },
    { ...part, operation_id: "foreign" },
    { ...part, field: "request" },
    { ...part, offset: 0 },
    { ...part, version: "b".repeat(64) },
    { ...part, next_offset: 8194 },
    { ...part, text: "🙂".repeat(8193) },
    { ...part, value_null: true },
  ]) {
    reply = bad;
    await assert.rejects(
      () =>
        loadCallSegment("run", part.operation_id, "response", 8192, version),
      /不匹配/,
    );
  }
  reply = { ...part, text: "🙂".repeat(8192), next_offset: 16384 };
  assert.equal(
    (await loadCallSegment("run", part.operation_id, "response", 8192, version))
      .text.length,
    16384,
    "Unicode code points, not JS UTF-16 units",
  );
  status = 409;
  reply = { error: "receipt changed" };
  await assert.rejects(
    () => loadCallSegment("run", part.operation_id, "response", 8192, version),
    /receipt changed/,
  );
  status = 404;
  reply = { error: "not available" };
  const before = paths.length;
  await assert.rejects(() => loadCallPage("run", "all"), /not available/);
  assert.equal(
    paths.length,
    before + 1,
    "must not retry an unbounded legacy endpoint",
  );
});

test("source reader starts closed and pending calls have a distinct scoped surface", () => {
  const reader = renderToStaticMarkup(
    <ReceiptReader run="run" operation="run/tool/3" />,
  );
  assert.ok(reader.includes("读取回执原文"));
  assert.ok(reader.includes('aria-expanded="false"'));
  assert.ok(!reader.includes("<pre"));
  const panel = renderToStaticMarkup(
    <CallReceipts run="run" filter="unresolved" />,
  );
  assert.ok(panel.includes("待核对的调用"));
  assert.ok(panel.includes("不受下方历史列表翻页影响"));
  assert.ok(
    !panel.includes("提交核对记录"),
    "no mutation until a specific receipt is selected",
  );
});
