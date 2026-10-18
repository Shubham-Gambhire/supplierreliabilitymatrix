# Supplier Reliability Matrix

A self-contained, browser-based tool that scores suppliers on delivery reliability and sourcing
risk using only the data a real procurement team can be expected to maintain.

**Live app**: https://supplierreliabilitymatrix.lovable.app

**Project development report (PDF)**: https://supplierreliabilitymatrix.lovable.app/supplier-reliability-matrix-development-report.pdf

Prototype status · Not affiliated with, and containing no data from, any employer. All example
supplier names, locations and industries are fictional.

## Background

The scoring logic originates from a Supplier Risk Scorecard built in Excel during an internship,
used to flag suppliers worth a closer look ahead of a sourcing or renewal decision. It scored on a
small set of operational fields — on-time delivery history, sole-source status, and an internally
assigned priority tier — because those were the fields the business actually kept current. This
project reimplements that logic as a standalone web application: an editable supplier ledger, a
live risk-matrix visualization, a fully tunable scoring engine, and a methodology documented inside
the app that states its own limitations.

## Scoring methodology (model v2)

All scores use a 0 to 5 scale where **higher means safer**. P1 is the most critical priority tier.
Every weight, threshold and multiplier is editable in Settings as a draft; nothing recalculates
until a valid draft is applied.

1. **Data checks** - rows with a blank name, blank/negative/fractional/non-finite counts,
   on-time deliveries above total POs, priority outside P1-P5, invalid spend or a non Yes/No
   sole-source flag are **Invalid Data**. Valid rows with fewer than the minimum POs (default 3;
   zero POs is never scored) are **Insufficient Data**. Neither is scored, plotted, averaged,
   compared against peers or snapshotted.
2. **Delivery Score** - on-time rate bucketed 1-5 using the active minima (defaults: >=90% 5,
   75% to <90% 4, 60% to <75% 3, 45% to <60% 2, below 45% 1).
3. **Dependency Score** (higher = more sourcing resilience) - not sole-sourced 5; sole-sourced
   P4-P5 3, P3 2, P1-P2 1.
4. **Performance Score** - `clamp(0.65 x Delivery + 0.35 x Dependency - penalty, 0, 5)`, with
   penalty `0.15 x max(0, 3 - Delivery) x max(0, 3 - Dependency)`.
5. **Priority adjustment** - `Adjusted reliability = clamp(Performance / multiplier, 0, 5)` with
   P1 1.5, P2 1.3, P3 1.1, P4 1.0, P5 0.9. Multipliers must be positive and non-increasing from
   P1 to P5, so making a supplier more critical can never improve its score or tier.
6. **Tier** - Low `>= 3.75`, Medium `2.50 <= s < 3.75`, High `1.50 <= s < 2.50`, Critical `< 1.50`,
   assigned at full precision (display is rounded to 2 decimals).
7. **Peer comparison** (descriptive only) - leave-one-out average of the other scored suppliers in
   the same category; flagged when more than the gap (default 0.5) below. Small groups and mixed
   priorities limit interpretation. Never overrides the tier.

This is a transparent heuristic for prioritising review. It is not a calibrated failure
probability, not statistically validated and not an estimate of financial loss. A small weighted
score was chosen pragmatically for two inputs; methods such as AHP or TOPSIS could also be used.

The bundled PDF development report is **historical**: it describes the earlier model that
multiplied by the priority factor. The in-app "How this is scored" page is the current method.

## Features

- **Register** - annual spend attached to Critical/High tiers (USD, not expected loss), unassessed
  spend, reliability matrix (bottom-left = highest raw exposure, top-right = strongest raw
  resilience; area-proportional bubbles; accessible supplier list), tier tally, watchlist,
  category laggards and versioned snapshots.
- **Supplier Ledger** - inline editing with row-level validation messages, sortable keyboard
  headers, filters, custom columns (reserved/duplicate names rejected), undo-able deletion.
- **CSV import/export** - explicit header aliases, ambiguous/missing headers rejected, row-level
  validation, preview before applying, explicit skip/update for duplicates, formula-escaped
  export with stable IDs and `Custom: <name>` columns.
- **Backup/restore** - versioned JSON backup of suppliers, IDs, custom columns, settings and
  history; validated before replacing, with a prompt to download current data first.
- **Persistence** - versioned localStorage save, ID repair for legacy duplicates, corrupt-save
  recovery (never silently overwritten), save-error reporting, flush on page hide, cross-tab
  conflict notice.

## Tech stack

| Layer | Approach |
| --- | --- |
| Framework | React 19 on TanStack Start (Vite) |
| Engine | Pure modules in `src/lib/srm/` (scoring, CSV, storage, history, IDs) |
| Tests | Vitest (`npm test`) |
| Visualization | Hand-built SVG |
| CSV | PapaParse |
| Dialog | Radix Dialog (focus trap, scroll lock) |

There is no backend. Supplier records are kept in this browser's local storage and are not
uploaded by the app; the page still loads fonts/images from external hosts and may send
technical error reports.

## Known limitations

- No measurement window, data freshness, quality, lead-time or financial-health inputs.
- A minimum PO count is a sample-size guard, not statistical confidence.
- Weights and multipliers are judgement calls, not validated elicitation.
- Snapshot trends compare only snapshots taken under the same model and settings.
- No PDF/print export, bulk actions or server sync; localStorage can be cleared by the browser.

See [AUDIT.md](AUDIT.md) for the audit findings and fixes.

## Development

```sh
git clone https://github.com/Shubham-Gambhire/supplierreliabilitymatrix
cd supplierreliabilitymatrix
npm i
npm test
npm run dev
```

Built with [Lovable](https://lovable.dev) — continue in the
[Lovable editor](https://lovable.dev/projects/5f69e257-a043-4bef-9b7f-697a0f8f5829). Changes pushed
to `main` on GitHub sync back into Lovable.

---

Made by Shubham Gambhire · [LinkedIn](https://www.linkedin.com/in/shubhambg)
