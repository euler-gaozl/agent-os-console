# Agent OS console

Owns the console HTTP BFF and its separately built React/TypeScript Web. Service role is **control**, default port **8090**. The integration repository selects this owner by exact commit. This repository never reads a database and has no migration command; release migration owner is none. Registry, ToolHub, Runtime, Knowledge, Storage and Sources retain their own data and authorization.

## Build

Go 1.27.2, Node 24.19.0 and pnpm 11.25.0. Fixed SDK rc.2 is vendored with canonical Go checksums; GOWORK=off and GOPROXY=off need no sibling clone or private module token. Run scripts/Build.ps1 for native BFF/healthcheck binaries. Run pnpm --dir web install --frozen-lockfile --ignore-scripts, pnpm --dir web test and pnpm --dir web run build. Docker builds only this service and Web; runtime image has no Node compiler or DB.

Use deploy/service.example.json as the configuration contract, never commit real configuration. Start the BFF with --config pointing to a private file and WEB_DIR pointing to web/dist in a source build, or web in a Package-Web release (relative to its root). The healthcheck reads its private config from AGENTOS_CONFIG. Readiness verifies this process, not every downstream service; UI reports downstream availability separately.

## Boundaries

User authentication uses ADMIN_TOKEN; outbound requests use a separate SERVICE_TOKEN. DEV_LOCAL=1 is for this exact loopback port only and still rejects foreign Origin/Host and unmarked writes. Static GET/HEAD assets are public; API/metrics/readyz remain protected. Startup rejects a missing/short effective user token or reuse of SERVICE_TOKEN, including DEV_LOCAL. Futures retains the prior ADMIN_TOKEN fallback when BUSINESS_TOKEN is absent, provided it is separate from SERVICE_TOKEN. No secrets are embedded in Web assets. Console aggregates independently unavailable resource catalogs and proxies permitted management APIs with its control identity.

The small CSS/React foundation and bounded HTTP proxy were copied from the recorded integration commit. Each repository owns its copy, dependency lock and tests; no build reads the sibling Web. Existing UI appearance is preserved for extraction. Complete redesign and real desktop/narrow-screen workflows remain the platform P3 gate.

Independent tests use synthetic HTTP peers and do not prove paid provider or deployed-service operation. Current source/build/CI/live validation is recorded separately in the integration P2 ledger. Upgrade and rollback require the same HTTP/data/tool contract and bundle the matching BFF plus Web; there is no DB migration to undo.

The 2026-10-13 user-flow increment preserves Enter/newlines in Agent constraints
until save and distinguishes resource-selector loading from an empty catalog.
An authenticated loopback preview using actual platform services created and
reopened `document-checker` with two constraints and pinned Skill/MCP/knowledge
bindings. Its official DeepSeek trial `94255f1d53b1763b43bbb2da197faab7` completed
two model requests, read the public source catalog and searched the knowledge
base. The search returned zero hits for 豆粕: no document read or completed
market research is claimed. Desktop and narrow-screen checks, nine Web tests,
Go tests/vet and independent builds passed. Evidence remains local under
`console-user-flow-39810be19f1046d7ad0e4844a3ada7b8`; the formal Console release
has not yet been replaced. Full W03–W06 acceptance remains open.

Run scripts/Package-Web.ps1 -Destination <new-path> for a complete immutable native BFF/Web package, then scripts/Test-RelocatedPackage.ps1 -Package <path> to move it to a new sibling and exercise the actual executable with synthetic HTTP peers. The original location must be absent. No source, Node compiler or database is required by the package.

## Source-engine run management candidate

Run details recognize `dsh-source-639ed015-state-v1` and
`dsh-source-639ed015-resident-v2` and read the Runtime-owned
working-state API. The panel separates current authoritative task/constraints
from derived questions, observations, plans, third-party forecasts, conflicts
and next steps. It supports exact historical revisions, stale-constraint
warnings and retained source receipt hashes/bodies. An empty ledger is shown as
not yet saved. Classification and retrievability do not imply verified truth.

Source-state recovery uses Runtime's control-only preview and fenced management
action; the browser does not infer safety from a status string. Unknown external
calls retain the existing reconciliation form. Source-engine archives are
labelled as manifests. A failed optional state/preview read is explicit while
other run details remain available. Mutation replies after closing/switching a
task cannot reopen the old task. No new database or business-effect code lives
in Console; the BFF uses its existing authenticated Runtime proxy.

The latest candidate replaces complete `/calls` loading with 25-item summary
pages and explicit per-field 8,192-character reads. Only the visible history
page and open text segment are retained. Source receipts are fetched by ID even
when absent from that page. Pending reconciliation has its own unresolved query;
opening a specific item reveals its existing server-validated reconciliation
action. Failed reads and version conflicts stay visible; no fallback fetches
full history. Closing or changing a reader invalidates its late responses.

This Console requires Runtime `call-receipts-v1`. Upgrade Runtime first and
roll Console back first. The Windows integrator checks the capability and bound
local Runtime URL before replacement/startup. Direct manual or Linux deployment
still needs this compatibility check; the owner declaration alone is not live
capability discovery. The execution/data protocol and BFF routing are unchanged.

Evidence `receipt-console-1a3f9e8ce0794404971f5d3de4873057` records independent
Go checks, nine Web tests/build and actual browser interaction with this BFF/Web
and synthetic Runtime peers. Desktop/390px, 25/25/13 summary pages, independent
pending item, source lookup, Unicode segments, 409/restart, field changes and
late read/reconciliation close checks passed. Request logs contain no legacy
full `/calls` fetch. This is not formal deployment or real-provider evidence.

Windows evidence `p25-console-source-aa4e7925d9af46f585b1ecd111476ca5` records Go
and Web checks plus real-browser testing against the actual candidate BFF and
synthetic Runtime peers. Desktop and 390px views, historical state, receipt
expansion, recovery and constraint mutation delayed-reply/close cases passed.
This is not a deployed service or real-provider E2E result. Full P3 UI acceptance
and deployment selection remain open; historical engines retain their old view.
