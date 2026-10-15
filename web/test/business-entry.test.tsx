import assert from "node:assert/strict";
import React from "react";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { BusinessEntryLink, businessEntryFromConfig } from "../src/business-entry";

test("explicit local or remote browser entry is used without a token or inferred port", () => {
  for (const url of ["http://127.0.0.1:18098", "https://research.example.invalid/workspace/"]) {
    const entry = businessEntryFromConfig({ futures_public_url: url });
    assert.deepEqual(entry, { status: "ready", url });
    const html = renderToStaticMarkup(<BusinessEntryLink entry={entry} />);
    assert.match(html, new RegExp(`href="${url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
    assert.match(html, /target="_blank"/);
    assert.match(html, /rel="noopener noreferrer"/);
    assert.doesNotMatch(html, /:8098(?:["/]|$)|admin-token|Authorization/);
  }
});

test("unconfigured, loading and failed entry never render an actionable fallback link", () => {
  assert.deepEqual(businessEntryFromConfig({ futures_public_url: "" }), { status: "unconfigured" });
  for (const status of ["unconfigured", "loading", "unavailable"] as const) {
    const html = renderToStaticMarkup(<BusinessEntryLink entry={{ status }} />);
    assert.match(html, /aria-disabled="true"/);
    assert.doesNotMatch(html, /<a |href=|127\.0\.0\.1/);
  }
});

test("malformed or credential-bearing public configuration cannot become browser navigation", () => {
  for (const value of [null, {}, { futures_public_url: 18098 }])
    assert.equal(businessEntryFromConfig(value).status, "unavailable");
  for (const value of ["/futures", "//example.invalid", "javascript:alert(1)", "https://", "https://user:secret@example.invalid", "https://example.invalid?token=secret", "https://example.invalid?", "https://example.invalid#secret", "https://example.invalid#", "https://example.invalid\\other", "https://example.invalid/\npath"])
    assert.equal(businessEntryFromConfig({ futures_public_url: value }).status, "unavailable");
});
