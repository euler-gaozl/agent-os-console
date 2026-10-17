import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  continuationContext, lookupContinuation, retainContinuation, startContinuation,
  sendPendingContinuation, confirmContinuation, pendingContinuations,
  continuationStorageChanged, continuationRefresh, supportsContinuation, type PendingContinuation,
} from "../src/continuation-client";
import { ContinuationPanel } from "../src/continuation";

class MemoryStorage {
  values = new Map<string, string>();
  get length() { return this.values.size; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}
Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: { getItem: () => "fixture-user-token" } });
const version = "a".repeat(64), when = "2026-10-15T09:00:00Z";
function receipt(pending: PendingContinuation, rejected = false) {
  return { protocol: "failed-run-continuation-receipt-v1", run_id: pending.run_id, request_id: pending.request_id,
    failure_version: pending.expected_failure_version, committed: true,
    ...(rejected ? { outcome: "rejected", assessment: "blocked", reason: "failure_version_changed", rejected_at: when } :
      { outcome: "queued", status_at_acceptance: "queued", accepted_at: when }) };
}
const reply = (value: unknown, status = 202) => new Response(JSON.stringify(value), { status });
const create = (storage: MemoryStorage, id = "stable") => retainContinuation("task/a", version, storage, () => id);

test("actual action stores the exact request before POST and clears only its committed reply", async () => {
  const storage = new MemoryStorage();
  let calls = 0;
  const saved = await startContinuation("task/a", version, storage, async (path, init) => {
    calls++;
    const pending = pendingContinuations("task/a", storage)[0];
    assert.ok(pending);
    assert.equal(path, "/api/runs/task%2Fa/continuation");
    assert.equal(init?.method, "POST");
    assert.equal(init?.cache, "no-store");
    assert.equal(init?.redirect, "error");
    assert.deepEqual(JSON.parse(String(init?.body)), { request_id: pending.request_id, expected_failure_version: version });
    assert.equal((init?.headers as any).Authorization, "Bearer fixture-user-token");
    assert.equal((init?.headers as any)["Idempotency-Key"], pending.request_id);
    return reply(receipt(pending));
  });
  assert.equal(saved.outcome, "queued"); assert.equal(calls, 1); assert.equal(storage.length, 0);
});

test("storage failure or malformed local recovery pointer never sends a new request", async () => {
  let calls = 0;
  const fetcher = async () => { calls++; return reply({}); };
  const denied = new MemoryStorage(); denied.setItem = () => { throw Error("blocked storage"); };
  await assert.rejects(startContinuation("task/a", version, denied, fetcher), /blocked storage/);
  const corrupt = new MemoryStorage(); create(corrupt);
  corrupt.setItem(corrupt.key(0)!, "{broken");
  await assert.rejects(startContinuation("task/a", version, corrupt, fetcher));
  assert.equal(corrupt.length, 1); assert.equal(calls, 0);
  assert.throws(() => retainContinuation("task/a", version, new MemoryStorage(), () => 123 as any));
  assert.throws(() => retainContinuation("task/a", 123 as any, new MemoryStorage()));
});

test("lost POST response survives reload and lookup 404; explicit retry reuses the same ID", async () => {
  const storage = new MemoryStorage(), first = create(storage);
  await assert.rejects(sendPendingContinuation(first, storage, async () => { throw Error("lost response"); }));
  const reloaded = pendingContinuations("task/a", storage)[0];
  assert.deepEqual(reloaded, first);
  await assert.rejects(lookupContinuation(reloaded, async (_path, init) => {
    assert.equal(init?.method, "GET"); assert.equal(init?.body, undefined);
    return reply({ error: "not observed" }, 404);
  }));
  assert.equal(storage.length, 1);
  assert.deepEqual(retainContinuation("task/a", "b".repeat(64), storage, () => { throw Error("must not generate new ID"); }), first);
  await sendPendingContinuation(reloaded, storage, async (_path, init) => {
    assert.equal(JSON.parse(String(init?.body)).request_id, first.request_id);
    return reply(receipt(first));
  });
  assert.equal(storage.length, 0);
});

test("only a matching committed rejection clears recovery; ambiguous responses retain it", async () => {
  const cases = [
    { status: 401, body: {} }, { status: 404, body: {} }, { status: 503, body: {} },
    { status: 409, body: { error: "request_id_conflict" } },
    { status: 202, alter: { committed: false } }, { status: 202, alter: { run_id: "another-task" } },
    { status: 202, alter: { request_id: "another-request" } }, { status: 202, alter: { failure_version: "b".repeat(64) } },
    { status: 202, alter: { rejected_at: when } }, { status: 202, alter: { reason: "contradiction" } },
    { status: 202, alter: { assessment: "blocked" } }, { status: 200, alter: {} },
    { status: 409, rejected: true, alter: { accepted_at: when } },
    { status: 409, rejected: true, alter: { status_at_acceptance: "queued" } },
  ];
  for (const item of cases) {
    const storage = new MemoryStorage(), pending = create(storage);
    await assert.rejects(sendPendingContinuation(pending, storage, async () => reply(
      "body" in item ? item.body : { ...receipt(pending, item.rejected), ...item.alter }, item.status)));
    assert.deepEqual(pendingContinuations("task/a", storage), [pending]);
  }
  const storage = new MemoryStorage(), pending = create(storage);
  const result = await sendPendingContinuation(pending, storage, async () => reply(receipt(pending, true), 409));
  assert.equal(result.outcome, "rejected"); assert.equal(storage.length, 0);
});

test("incomplete, malformed, invalid UTF8 and oversized replies never clear the pointer", async () => {
  for (const response of [
    new Response("{", { status: 202 }), new Response(new Uint8Array([255]), { status: 202 }),
    new Response("x".repeat(16_385), { status: 202 }), new Response(null, { status: 202 }),
    new Response(new ReadableStream({ start(c) { c.error(Error("stream lost")); } }), { status: 202 }),
  ]) {
    const storage = new MemoryStorage(), pending = create(storage);
    await assert.rejects(sendPendingContinuation(pending, storage, async () => response));
    assert.equal(storage.length, 1);
  }
});

test("a late reply removes only its own key across tabs, tasks and newer failures", async () => {
  const firstTab = new MemoryStorage(), secondTab = new MemoryStorage();
  const first = create(firstTab, "one"), second = create(secondTab, "two");
  for (const [key, value] of secondTab.values) firstTab.setItem(key, value);
  const other = retainContinuation("other", version, firstTab, () => "other");
  confirmContinuation(first, receipt(first) as any, firstTab);
  assert.deepEqual(pendingContinuations("task/a", firstTab), [second]);
  assert.deepEqual(pendingContinuations("other", firstTab), [other]);
  confirmContinuation(first, receipt(first) as any, firstTab);
  assert.equal(firstTab.length, 2);
  assert.equal(continuationStorageChanged("task/a", firstTab.key(0)), true);
  assert.equal(continuationStorageChanged("task/a", "unrelated"), false);
});

test("context and receipt reads are GET only and bind the exact task and failure version", async () => {
  const context = { protocol: "failed-run-continuation-action-context-v1", run_id: "task/a",
    engine: "dsh-source-639ed015-native-v4", status: "failed", assessment: "same_run_candidate",
    reason: "retained_transient_model_failure", observed_at: when, failure_version: version };
  assert.deepEqual(await continuationContext("task/a", async (path, init) => {
    assert.equal(path, "/api/runs/task%2Fa/continuation/request-context");
    assert.equal(init?.method, "GET"); assert.equal(init?.body, undefined); return reply(context, 200);
  }), context);
  const finalContext = { ...context, engine: "dsh-source-639ed015-final-v5" };
  assert.deepEqual(await continuationContext("task/a", async () => reply(finalContext, 200)), finalContext);
  assert.equal(supportsContinuation(finalContext.engine), true);
  for (const changed of [{ run_id: "other" }, { status: "completed" }, { failure_version: 123 }, { engine: "legacy" }, { engine: "dsh-source-639ed015-final-v6" }])
    await assert.rejects(continuationContext("task/a", async () => reply({ ...context, ...changed }, 200)));
  const storage = new MemoryStorage(), pending = create(storage);
  const got = await lookupContinuation(pending, async (path, init) => {
    assert.equal(path, "/api/runs/task%2Fa/continuation/requests/stable");
    assert.equal(init?.method, "GET"); return reply(receipt(pending), 200);
  });
  assert.equal(storage.length, 1); confirmContinuation(pending, got, storage); assert.equal(storage.length, 0);
});

test("initial panel makes no request and offers no continue action before eligibility is read", () => {
  const markup = renderToStaticMarkup(<ContinuationPanel run="task/a" status="failed" attempts={2} maxAttempts={4} refreshRun={async () => { throw Error("unexpected refresh"); }} />);
  assert.match(markup, /正在读取续跑条件/); assert.match(markup, /原预算 4 次/);
  assert.doesNotMatch(markup, /按原快照继续|从检查点继续|重发同一请求/);
});

test("late action refresh cannot override a newer selection while its details are still loading", async () => {
  let selected = { run: "task/a", version: 7 }, calls: string[] = [];
  const refresh = continuationRefresh("task/a", 7, () => selected, async run => { calls.push(run); });
  selected = { run: "task/a", version: 8 }; // A different row was clicked; old details remain visible during GET.
  await refresh(); assert.deepEqual(calls, []);
  selected = { run: "task/b", version: 8 };
  await refresh(); assert.deepEqual(calls, []);
  const current = continuationRefresh("task/b", 8, () => selected, async run => { calls.push(run); });
  await current(); assert.deepEqual(calls, ["task/b"]);
});
