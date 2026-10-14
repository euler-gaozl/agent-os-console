import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import {
  captureCapabilities,
  captureHistory,
  captureIntents,
  collectCapture,
  importCapture,
  readCapture,
  retainCapture,
  sourceURL,
  type CapturePage,
} from "../src/capture-client";

const ref = { id: "library/甲?", revision: 3 };
const id = "a".repeat(32),
  hash = "b".repeat(64),
  url = "https://source.invalid/report?year=2026&month=10";
const page: CapturePage = {
  capture_id: id,
  url,
  title: "原文",
  fetched_at: "2026-10-01T00:00:00Z",
  raw_sha256: hash,
  extraction_version: "agentos-text-html-v1",
  content: "🙂甲",
  next_offset: 2,
  total_characters: 2,
  has_more: false,
};
function storage(t: TestContext) {
  const entries = new Map<string, string>();
  const local = {
    get length() {
      return entries.size;
    },
    key: (index: number) => [...entries.keys()][index] ?? null,
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => {
      entries.set(key, value);
    },
    removeItem: (key: string) => {
      entries.delete(key);
    },
  };
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: local,
  });
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: { getItem: () => null },
  });
  t.after(() => {
    delete (globalThis as any).localStorage;
    delete (globalThis as any).sessionStorage;
  });
  return { entries, local };
}
const receipt = () => ({
  file: {
    id: "c".repeat(32),
    document_id: "d".repeat(32),
    kb_id: ref.id,
    kb_revision: ref.revision,
    artifact_hash: "e".repeat(64),
    status: "external_pending",
  },
  source: {
    manifest_sha256: "f".repeat(64),
    archive: {
      format: 2,
      file_id: "c".repeat(32),
      document_id: "d".repeat(32),
      knowledge: ref,
      url,
      raw_sha256: hash,
      text_sha256: "1".repeat(64),
      stored_raw_sha256: hash,
      capture: { capture_id: id },
    },
  },
});

test("lost capture and import replies retain exact IDs and pinned targets across reopen and retry", async (t) => {
  storage(t);
  const intent = retainCapture(ref, id, url);
  let discard = true;
  const bodies: unknown[] = [];
  t.mock.method(globalThis, "fetch", async (path, options) => {
    assert.equal(
      captureIntents(ref)[0].capture_id,
      id,
      "intent was not durable before sending",
    );
    bodies.push(JSON.parse(options!.body as string));
    if (discard) throw new TypeError("reply lost");
    return new Response(
      JSON.stringify(
        String(path).endsWith("import-capture") ? receipt() : page,
      ),
    );
  });
  await assert.rejects(() => collectCapture(intent), /reply lost/);
  const restored = captureIntents(ref)[0];
  assert.deepEqual(restored, intent);
  assert.deepEqual(captureIntents({ ...ref, revision: 4 }), []);
  discard = false;
  assert.deepEqual(await collectCapture(restored), page);
  assert.deepEqual(bodies[0], bodies[1]);
  discard = true;
  await assert.rejects(() => importCapture(restored, hash), /reply lost/);
  assert.equal(captureIntents(ref)[0].saved_file, undefined);
  discard = false;
  const result = await importCapture(captureIntents(ref)[0], hash);
  assert.deepEqual(bodies[2], bodies[3]);
  assert.equal(
    result.file.status,
    "external_pending",
    "external index must not be relabelled ready",
  );
  assert.equal(captureIntents(ref)[0].saved_file, result.file.id);
  await importCapture(captureIntents(ref)[0], hash);
  assert.deepEqual(bodies[3], bodies[4]);
});

test("storage refusal prevents requests and credential URLs never become recovery records", async (t) => {
  const { local, entries } = storage(t);
  let network = 0;
  t.mock.method(globalThis, "fetch", async () => {
    network++;
    return new Response("{}");
  });
  for (const bad of [
    "http://source.invalid/",
    "https://user:pass@source.invalid/",
    "https://source.invalid/?api_key=private",
    "https://source.invalid/#secret",
    "https://source.invalid:123/path",
  ])
    assert.throws(() => retainCapture(ref, id, bad));
  assert.equal(entries.size, 0);
  t.mock.method(local, "setItem", () => {
    throw new Error("storage denied");
  });
  await assert.rejects(
    () =>
      collectCapture({
        format: 1,
        capture_id: id,
        url,
        knowledge: ref,
        created_at: new Date().toISOString(),
      }),
    /storage denied/,
  );
  assert.equal(network, 0);
  assert.equal(sourceURL(url), url);
});

test("reads stay bounded and reject mismatched observations and Unicode pagination", async (t) => {
  storage(t);
  let response: any = page;
  let requests = 0;
  t.mock.method(globalThis, "fetch", async (path) => {
    requests++;
    assert.equal(
      String(path),
      `/api/sources/captures/${id}?offset=0&limit=1200`,
    );
    return new Response(JSON.stringify(response));
  });
  assert.deepEqual(await readCapture(id, 0, url, hash), page);
  for (const changed of [
    { capture_id: "f".repeat(32) },
    { url: "https://another.invalid/" },
    { raw_sha256: "0".repeat(64) },
    { next_offset: 3 },
    { total_characters: 1 },
    { has_more: true },
    { content: "🙂".repeat(1201), next_offset: 1201, total_characters: 1201 },
  ]) {
    response = { ...page, ...changed };
    await assert.rejects(() => readCapture(id, 0, url, hash), /不匹配/);
  }
  const before = requests;
  await assert.rejects(() => readCapture("../invalid"));
  assert.equal(requests, before);
});

test("import confirmation checks both file and archive identity before marking saved", async (t) => {
  storage(t);
  const intent = retainCapture(ref, id, url);
  let response = receipt();
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response(JSON.stringify(response)),
  );
  const changes = [
    () => {
      response.file.kb_revision++;
    },
    () => {
      response.source.archive.capture.capture_id = "9".repeat(32);
    },
    () => {
      response.source.archive.raw_sha256 = "9".repeat(64);
    },
    () => {
      response.source.archive.document_id = "9".repeat(32);
    },
  ];
  for (const change of changes) {
    response = receipt();
    change();
    await assert.rejects(() => importCapture(intent, hash), /不匹配/);
    assert.equal(captureIntents(ref)[0].saved_file, undefined);
  }
});

test("capability failures never silently downgrade and history remains exact-URL scoped", async (t) => {
  storage(t);
  let enabled = false;
  let historyResponse: any = { items: [{ ...page }], next_cursor: "" };
  t.mock.method(globalThis, "fetch", async (path) => {
    const p = String(path);
    if (p.endsWith("/capture-capabilities"))
      return new Response(
        JSON.stringify({
          protocol: "source-capture-v1",
          durable_capture_ids: true,
        }),
      );
    if (p.endsWith("/capture-import-capabilities"))
      return new Response(
        JSON.stringify({
          protocol: "source-capture-import-v1",
          configured: enabled,
          atomic: true,
          source_archive_formats: [1, 2],
        }),
      );
    const u = new URL(p, "http://fixture.invalid");
    assert.equal(u.searchParams.get("url"), url);
    return new Response(JSON.stringify(historyResponse));
  });
  await assert.rejects(captureCapabilities, /尚未配置/);
  enabled = true;
  await captureCapabilities();
  assert.equal((await captureHistory(url)).items[0].capture_id, id);
  historyResponse = {
    items: [{ ...page, url: "https://other.invalid/" }],
    next_cursor: "",
  };
  await assert.rejects(() => captureHistory(url), /不匹配/);
});

test("recovery pointer retention never evicts unconfirmed captures", (t) => {
  storage(t);
  for (let i = 0; i < 30; i++)
    retainCapture(ref, i.toString(16).padStart(32, "0"), url);
  assert.throws(() => retainCapture(ref, id, url), /30 条待确认/);
  assert.equal(captureIntents(ref).length, 30);
  assert.equal(captureIntents(ref).filter((item) => item.saved_file).length, 0);
  assert.throws(
    () => retainCapture(ref, "0".repeat(32), "https://other.invalid/"),
    /另一地址/,
  );
});
