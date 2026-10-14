import { api, type Ref } from "./shared";

export type CaptureIntent = {
  format: 1;
  capture_id: string;
  url: string;
  knowledge: Ref;
  created_at: string;
  saved_file?: string;
};
export type CapturePage = {
  capture_id: string;
  url: string;
  title: string;
  fetched_at: string;
  raw_sha256: string;
  extraction_version: string;
  content: string;
  next_offset: number;
  total_characters: number;
  has_more: boolean;
};
export type CaptureSummary = Omit<
  CapturePage,
  "content" | "next_offset" | "total_characters" | "has_more"
>;
export type CaptureHistory = { items: CaptureSummary[]; next_cursor: string };
export type CaptureImport = {
  file: {
    id: string;
    document_id: string;
    status: string;
    artifact_hash: string;
    kb_id: string;
    kb_revision: number;
  };
  source: {
    manifest_sha256: string;
    archive: {
      format: number;
      file_id: string;
      document_id: string;
      knowledge: Ref;
      url: string;
      raw_sha256: string;
      text_sha256: string;
      stored_raw_sha256: string;
      capture: { capture_id: string };
    };
  };
};
const idPattern = /^[a-f0-9]{32}$/;
const hashPattern = /^[a-f0-9]{64}$/;
const sameRef = (a: Ref, b: Ref) =>
  a?.id === b.id && a?.revision === b.revision;
const prefix = (ref: Ref) =>
  `agentos-capture:v1:${encodeURIComponent(ref.id)}:${ref.revision}:`;
const key = (intent: CaptureIntent) =>
  prefix(intent.knowledge) + intent.capture_id;

export function sourceURL(value: string): string {
  const raw = value.trim();
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("请输入完整的 HTTPS 网页地址。");
  }
  if (
    raw.length > 2000 ||
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.hash ||
    parsed.port ||
    /[\s\\]/.test(raw)
  )
    throw new Error("请输入不含账号、密码、片段或自定义端口的 HTTPS 地址。");
  for (const name of parsed.searchParams.keys())
    if (/token|api_?key|password|secret|signature/i.test(name))
      throw new Error("地址中不能包含密钥或访问令牌。");
  // Do not normalize: Sources binds the capture ID to the exact URL string.
  return raw;
}

function parseIntent(raw: string, ref: Ref): CaptureIntent {
  const item = JSON.parse(raw) as CaptureIntent;
  if (
    item?.format !== 1 ||
    !idPattern.test(item.capture_id) ||
    !sameRef(item.knowledge, ref) ||
    sourceURL(item.url) !== item.url ||
    !Number.isFinite(Date.parse(item.created_at)) ||
    (item.saved_file !== undefined && !idPattern.test(item.saved_file))
  )
    throw new Error(
      "浏览器保存的采集记录格式异常。请保留记录，使用采集编号回查。",
    );
  return item;
}

// Small recovery pointers only: no source body, credentials or model state.
// One key per capture avoids overwriting another tab's pending operation.
export function captureIntents(ref: Ref): CaptureIntent[] {
  const items: CaptureIntent[] = [];
  const start = prefix(ref);
  for (let index = 0; index < localStorage.length; index++) {
    const name = localStorage.key(index);
    if (!name?.startsWith(start)) continue;
    const raw = localStorage.getItem(name);
    if (!raw) continue;
    const item = parseIntent(raw, ref);
    if (name !== key(item))
      throw new Error("采集记录编号不匹配，请使用编号回查。");
    items.push(item);
  }
  return items.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function retainCapture(
  ref: Ref,
  id: string,
  url: string,
): CaptureIntent {
  if (
    !idPattern.test(id) ||
    !ref.id ||
    !Number.isSafeInteger(ref.revision) ||
    ref.revision < 1
  )
    throw new Error("需要有效的采集编号和固定知识库版本。");
  const intent: CaptureIntent = {
    format: 1,
    capture_id: id,
    url: sourceURL(url),
    knowledge: { ...ref },
    created_at: new Date().toISOString(),
  };
  const old = localStorage.getItem(key(intent));
  if (old) {
    const existing = parseIntent(old, ref);
    if (existing.url !== intent.url)
      throw new Error("该采集编号已绑定另一地址。");
    return existing;
  }
  const all = captureIntents(ref);
  if (all.length >= 30) {
    const completed = all.filter((item) => item.saved_file).at(-1);
    if (!completed)
      throw new Error("已有 30 条待确认采集，请先找回并保存已有结果。");
    localStorage.removeItem(key(completed)); // Server archives are never removed.
  }
  localStorage.setItem(key(intent), JSON.stringify(intent));
  if (localStorage.getItem(key(intent)) !== JSON.stringify(intent))
    throw new Error("无法保存恢复编号，尚未发出采集请求。");
  return intent;
}

export function forgetCapture(intent: CaptureIntent): void {
  const existing = localStorage.getItem(key(intent));
  if (existing && parseIntent(existing, intent.knowledge).url !== intent.url)
    throw new Error("采集记录已变化，请重新回查。");
  localStorage.removeItem(key(intent)); // Explicit browser-pointer removal only.
}

export async function captureCapabilities(): Promise<void> {
  const [source, knowledge] = await Promise.all([
    api("/sources/capture-capabilities"),
    api("/knowledge/capture-import-capabilities"),
  ]);
  if (
    source.protocol !== "source-capture-v1" ||
    source.durable_capture_ids !== true ||
    knowledge.protocol !== "source-capture-import-v1" ||
    knowledge.configured !== true ||
    knowledge.atomic !== true ||
    !knowledge.source_archive_formats?.includes(2)
  )
    throw new Error("网页采集或知识库保存服务尚未配置完整，请检查服务状态。");
}

export function validateCapture(
  page: CapturePage,
  id: string,
  offset: number,
  url?: string,
  hash?: string,
): CapturePage {
  const count =
    typeof page?.content === "string" ? Array.from(page.content).length : -1;
  if (
    page?.capture_id !== id ||
    !idPattern.test(id) ||
    (url !== undefined && page.url !== url) ||
    (hash !== undefined && page.raw_sha256 !== hash) ||
    !hashPattern.test(page.raw_sha256) ||
    typeof page.title !== "string" ||
    !Number.isFinite(Date.parse(page.fetched_at)) ||
    count < 0 ||
    count > 1200 ||
    page.next_offset !== offset + count ||
    !Number.isSafeInteger(page.total_characters) ||
    page.total_characters < page.next_offset ||
    page.has_more !== page.next_offset < page.total_characters ||
    (page.has_more && count === 0)
  )
    throw new Error("采集原文的编号、指纹或分页范围不匹配，请重新回查。");
  sourceURL(page.url);
  return page;
}

export async function readCapture(
  id: string,
  offset = 0,
  url?: string,
  hash?: string,
): Promise<CapturePage> {
  if (!idPattern.test(id) || !Number.isSafeInteger(offset) || offset < 0)
    throw new Error("采集编号应为 32 位小写十六进制字符。");
  return validateCapture(
    await api(`/sources/captures/${id}?offset=${offset}&limit=1200`),
    id,
    offset,
    url,
    hash,
  );
}

export async function collectCapture(
  intent: CaptureIntent,
): Promise<CapturePage> {
  // Retry the body ID, never a freshly generated generic HTTP idempotency key.
  retainCapture(intent.knowledge, intent.capture_id, intent.url);
  return validateCapture(
    await api("/sources/captures", {
      capture_id: intent.capture_id,
      url: intent.url,
    }),
    intent.capture_id,
    0,
    intent.url,
  );
}

export async function captureHistory(
  url: string,
  after = "",
): Promise<CaptureHistory> {
  const exact = sourceURL(url);
  if (after && !idPattern.test(after)) throw new Error("采集历史游标无效。");
  const result = await api<CaptureHistory>(
    `/sources/captures?url=${encodeURIComponent(exact)}${after ? "&after=" + after : ""}`,
  );
  if (
    !Array.isArray(result.items) ||
    result.items.length > 20 ||
    typeof result.next_cursor !== "string" ||
    (result.next_cursor !== "" &&
      (!idPattern.test(result.next_cursor) ||
        result.next_cursor === after ||
        result.items.at(-1)?.capture_id !== result.next_cursor)) ||
    new Set(result.items.map((item) => item.capture_id)).size !==
      result.items.length ||
    result.items.some(
      (item) =>
        !idPattern.test(item.capture_id) ||
        item.url !== exact ||
        !hashPattern.test(item.raw_sha256),
    )
  )
    throw new Error("采集历史范围不匹配，请重新读取。");
  return result;
}

export async function importCapture(
  intent: CaptureIntent,
  rawHash: string,
): Promise<CaptureImport> {
  retainCapture(intent.knowledge, intent.capture_id, intent.url);
  const result = await api<CaptureImport>("/knowledge/import-capture", {
    knowledge: intent.knowledge,
    capture_id: intent.capture_id,
  });
  const archive = result?.source?.archive;
  if (
    !idPattern.test(result?.file?.id) ||
    !idPattern.test(result.file.document_id) ||
    result.file.kb_id !== intent.knowledge.id ||
    result.file.kb_revision !== intent.knowledge.revision ||
    !sameRef(archive?.knowledge, intent.knowledge) ||
    archive?.format !== 2 ||
    archive.file_id !== result.file.id ||
    archive.document_id !== result.file.document_id ||
    archive.capture?.capture_id !== intent.capture_id ||
    archive.url !== intent.url ||
    archive.raw_sha256 !== rawHash ||
    !hashPattern.test(result.source.manifest_sha256) ||
    !hashPattern.test(archive.text_sha256) ||
    !hashPattern.test(archive.stored_raw_sha256)
  )
    throw new Error("保存回执与采集记录不匹配。请保留编号并重试核对。");
  // Failure to persist confirmation is recoverable with the same exact request.
  localStorage.setItem(
    key(intent),
    JSON.stringify({ ...intent, saved_file: result.file.id }),
  );
  return result;
}
