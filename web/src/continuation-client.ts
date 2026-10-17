export const NATIVE_CONTINUATION_ENGINE = "dsh-source-639ed015-native-v4";
export const FINAL_CONTINUATION_ENGINE = "dsh-source-639ed015-final-v5";
export const GUARDED_CONTINUATION_ENGINE = "dsh-source-639ed015-guarded-v6";
export const supportsContinuation = (engine: string) =>
  engine === NATIVE_CONTINUATION_ENGINE || engine === FINAL_CONTINUATION_ENGINE || engine === GUARDED_CONTINUATION_ENGINE;
const pendingPrefix = "agentos-continuation-pending:v1:";
const requestID = /^[A-Za-z0-9_-]{1,128}$/;
const failureVersion = /^[a-f0-9]{64}$/;
const assessments = ["same_run_candidate", "blocked", "manual_review", "not_applicable"];
export type PendingContinuation = {
  format: 1;
  run_id: string;
  request_id: string;
  expected_failure_version: string;
  created_at: string;
};
export type ContinuationContext = {
  protocol: "failed-run-continuation-action-context-v1";
  run_id: string;
  engine: string;
  status: string;
  assessment: string;
  reason: string;
  observed_at: string;
  failure_version?: string;
};
export type ContinuationReceipt = {
  protocol: "failed-run-continuation-receipt-v1";
  run_id: string;
  request_id: string;
  failure_version: string;
  committed: true;
} & (
  | { outcome: "queued"; status_at_acceptance: "queued"; accepted_at: string }
  | { outcome: "rejected"; assessment: string; reason: string; rejected_at: string }
);
export type PendingStorage = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;
export type ContinuationFetch = typeof fetch;
const validRun = (run: unknown): run is string =>
  typeof run === "string" && run.length > 0 && new TextEncoder().encode(run).length <= 512 && !run.includes("\0");
const dateValue = (value: unknown): value is string =>
  typeof value === "string" && value.length <= 64 && Number.isFinite(Date.parse(value));
const shortString = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 128;
const storageKey = (run: string, id: string) => pendingPrefix + encodeURIComponent(run) + ":" + id;
function requireRun(run: string) {
  if (!validRun(run)) throw new Error("任务标识无效，不能发送续跑请求。");
}
function validPending(value: any): value is PendingContinuation {
  return value?.format === 1 && validRun(value.run_id) && typeof value.request_id === "string" && requestID.test(value.request_id) &&
    typeof value.expected_failure_version === "string" && failureVersion.test(value.expected_failure_version) && dateValue(value.created_at);
}
export const continuationStorageChanged = (run: string, key: string | null) =>
  key === null || key.startsWith(pendingPrefix + encodeURIComponent(run) + ":");
// Capture the parent selection before a POST. A different row may have been
// selected while its details are still loading and the old panel is mounted.
export function continuationRefresh(
  run: string, version: number,
  current: () => { run: string; version: number },
  refresh: (run: string) => Promise<unknown>,
): () => Promise<void> {
  return async () => {
    const selected = current();
    if (selected.run === run && selected.version === version) await refresh(run);
  };
}
function decodePending(raw: string, run: string, key: string): PendingContinuation {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error("本地待确认请求损坏，请保留记录并核对；没有发送新请求。"); }
  if (!validPending(value) || value.run_id !== run || storageKey(run, value.request_id) !== key)
    throw new Error("本地待确认请求不匹配，请保留记录并核对；没有发送新请求。");
  return value;
}
export function pendingContinuations(run: string, storage: PendingStorage = localStorage): PendingContinuation[] {
  requireRun(run);
  const prefix = pendingPrefix + encodeURIComponent(run) + ":", result: PendingContinuation[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key?.startsWith(prefix)) continue;
    const raw = storage.getItem(key);
    if (raw !== null) result.push(decodePending(raw, run, key));
  }
  return result.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.request_id.localeCompare(b.request_id));
}
export function retainContinuation(
  run: string,
  version: string,
  storage: PendingStorage = localStorage,
  newID: () => string = () => crypto.randomUUID(),
): PendingContinuation {
  requireRun(run);
  if (typeof version !== "string" || !failureVersion.test(version)) throw new Error("续跑依据已失效，请重新读取任务状态。");
  const existing = pendingContinuations(run, storage)[0];
  if (existing) return existing;
  const id = newID();
  if (typeof id !== "string" || !requestID.test(id)) throw new Error("无法生成续跑请求标识，没有发送请求。");
  const value: PendingContinuation = { format: 1, run_id: run, request_id: id, expected_failure_version: version, created_at: new Date().toISOString() };
  // One durable key per request: another tab cannot overwrite an uncertain ID.
  // Different tabs may race with different IDs; the server's version check is
  // the authority which permits only one queue action for the same failure.
  const key = storageKey(run, id), raw = JSON.stringify(value);
  if (storage.getItem(key) !== null) throw new Error("本地请求标识冲突，没有发送新请求。");
  storage.setItem(key, raw);
  if (storage.getItem(key) !== raw) throw new Error("无法保存待确认请求，没有发送新请求。");
  return value;
}
export function checkedContinuationReceipt(value: any, pending: PendingContinuation): ContinuationReceipt {
  const base = value?.protocol === "failed-run-continuation-receipt-v1" && value.committed === true &&
    value.run_id === pending.run_id && value.request_id === pending.request_id && value.failure_version === pending.expected_failure_version;
  const queued = value?.outcome === "queued" && value.status_at_acceptance === "queued" && dateValue(value.accepted_at) &&
    !Object.hasOwn(value, "rejected_at") && !Object.hasOwn(value, "assessment") && !Object.hasOwn(value, "reason");
  const rejected = value?.outcome === "rejected" && assessments.includes(value.assessment) && shortString(value.reason) && dateValue(value.rejected_at) &&
    !Object.hasOwn(value, "accepted_at") && !Object.hasOwn(value, "status_at_acceptance");
  if (!base || (!queued && !rejected)) throw new Error("续跑回执不匹配，原请求仍保留待核对。");
  return value;
}
export function confirmContinuation(
  pending: PendingContinuation,
  receipt: ContinuationReceipt,
  storage: PendingStorage = localStorage,
) {
  checkedContinuationReceipt(receipt, pending);
  const key = storageKey(pending.run_id, pending.request_id), raw = storage.getItem(key);
  if (raw === null) return; // Another tab already confirmed this exact request.
  const stored = decodePending(raw, pending.run_id, key);
  if (stored.expected_failure_version !== pending.expected_failure_version)
    throw new Error("本地待确认版本已变化，请保留记录并核对。");
  storage.removeItem(key);
}
export class ContinuationHTTPError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
async function request(
  path: string,
  body: Record<string, string> | undefined,
  fetcher: ContinuationFetch,
): Promise<{ status: number; value: any }> {
  const token = sessionStorage.getItem("admin-token");
  let response: Response;
  try {
    response = await fetcher("/api" + path, {
      method: body ? "POST" : "GET", cache: "no-store", redirect: "error",
      signal: AbortSignal.timeout(15_000),
      headers: {
        "Content-Type": "application/json", "X-AgentOS-Client": "web",
        ...(body ? { "Idempotency-Key": body.request_id } : {}),
        ...(token ? { Authorization: "Bearer " + token } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch { throw new Error("未取得续跑回复。已发送的请求仍待核对，请核对结果或重发同一请求。"); }
  if (![200, 202, 409].includes(response.status)) {
    await response.body?.cancel();
    const message = response.status === 401 ? "登录已失效，请重新登录后核对原请求。" :
      response.status === 404 ? "尚未查到请求结果，或当前服务尚不支持此接口。原请求会保留，不会自动改用旧接口。" :
      "续跑接口暂不可用，请稍后核对原请求。";
    throw new ContinuationHTTPError(response.status, message);
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("续跑回复为空，原请求仍待核对。");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 16_384) { await reader.cancel(); throw new Error("续跑回复超出读取范围，原请求仍待核对。"); }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let value: unknown;
  try { value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw new Error("无法核验续跑回复，原请求仍待核对。"); }
  return { status: response.status, value };
}
export async function continuationContext(run: string, fetcher: ContinuationFetch = fetch): Promise<ContinuationContext> {
  requireRun(run);
  const { status, value } = await request(`/runs/${encodeURIComponent(run)}/continuation/request-context`, undefined, fetcher);
  if (status !== 200 || value?.protocol !== "failed-run-continuation-action-context-v1" || value.run_id !== run ||
    !supportsContinuation(value.engine) || !shortString(value.status) || !assessments.includes(value.assessment) ||
    !shortString(value.reason) || !dateValue(value.observed_at) ||
    (value.assessment === "same_run_candidate" && (value.status !== "failed" || typeof value.failure_version !== "string" || !failureVersion.test(value.failure_version))))
    throw new Error("无法核验当前任务的续跑条件，没有发送请求。");
  return value;
}
export async function lookupContinuation(pending: PendingContinuation, fetcher: ContinuationFetch = fetch): Promise<ContinuationReceipt> {
  const { status, value } = await request(`/runs/${encodeURIComponent(pending.run_id)}/continuation/requests/${pending.request_id}`, undefined, fetcher);
  if (status !== 200) throw new Error("无法核验续跑回执，原请求仍待核对。");
  return checkedContinuationReceipt(value, pending);
}
export async function sendPendingContinuation(
  pending: PendingContinuation,
  storage: PendingStorage = localStorage,
  fetcher: ContinuationFetch = fetch,
): Promise<ContinuationReceipt> {
  // This exported action is also the UI's path: no request without its exact
  // durable pointer, and no clearing on an HTTP code or transport error alone.
  const raw = storage.getItem(storageKey(pending.run_id, pending.request_id));
  if (!raw) throw new Error("无法确认本地已保存原请求，没有发送请求。");
  const stored = decodePending(raw, pending.run_id, storageKey(pending.run_id, pending.request_id));
  if (stored.expected_failure_version !== pending.expected_failure_version || stored.created_at !== pending.created_at)
    throw new Error("无法确认本地已保存原请求，没有发送请求。");
  const { status, value } = await request(`/runs/${encodeURIComponent(pending.run_id)}/continuation`, {
    request_id: pending.request_id, expected_failure_version: pending.expected_failure_version,
  }, fetcher);
  const receipt = checkedContinuationReceipt(value, pending);
  if (status !== (receipt.outcome === "queued" ? 202 : 409)) throw new Error("续跑回执状态不一致，原请求仍待核对。");
  confirmContinuation(pending, receipt, storage);
  return receipt;
}
export async function startContinuation(
  run: string, version: string, storage: PendingStorage = localStorage, fetcher: ContinuationFetch = fetch,
): Promise<ContinuationReceipt> {
  return sendPendingContinuation(retainContinuation(run, version, storage), storage, fetcher);
}

const reasons: Record<string, string> = {
  retained_transient_model_failure: "已保存完整的暂时性模型错误，可以按原快照申请继续。",
  cancelled: "任务已取消，不能继续。", already_completed: "任务已完成。", not_failed: "当前任务不是失败状态。",
  unresolved_tool_effect: "存在结果未确认的外部调用，请先核对。", reconciliation_required: "需要先核对未知执行结果。",
  engine_not_assessed: "当前执行器尚不支持此续跑方式。", child_requires_family_review: "子任务需要结合父任务核对。",
  children_not_settled: "仍有子任务尚未结束。", unsettled_model_attempt: "仍有模型尝试未取得确定结果。",
  constraints_changed: "任务约束已修改，旧模型意图不能直接继续。", attempt_budget_exhausted: "原模型尝试预算已用尽。",
  step_budget_exhausted: "原任务轮次预算已用尽。", archive_unconfirmed: "执行记录的保存尚未确认。",
  failure_version_changed: "任务已推进或产生新的失败，请更新详情后重新核对。",
  family_exceeds_action_capacity: "任务树超出当前续跑检查范围，需要进一步核对。",
};
export const continuationReason = (reason: string) => reasons[reason] || "当前记录不足以直接续跑，需要核对执行详情。";
