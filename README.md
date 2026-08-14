# Supplier Reliability Matrix

A self-contained, browser-based tool that scores suppliers on delivery reliability and sourcing
risk using only the data a real procurement team can be expected to maintain.

**Live app**: https://supplierreliabilitymatrix.lovable.app

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

## Scoring methodology

Every weight, threshold and multiplier below is editable in the app's Settings panel and
recalculates everything live.

1. **Delivery Score** — on-time rate (on-time deliveries ÷ total POs) bucketed 1–5:
   ≥90% → 5, 75–89% → 4, 60–74% → 3, 45–59% → 2, <45% → 1.
2. **Dependency Score** — not sole-sourced → 5; sole-sourced with priority 4–5 → 3, priority 3 → 2,
   priority 1–2 → 1.
3. **Performance Score** — `(0.65 × Delivery) + (0.35 × Dependency) − compounding penalty`, where
   the penalty is `0.15 × max(0, 3 − Delivery) × max(0, 3 − Dependency)`. It activates only when
   both scores fall below the midpoint, because a sole-sourced supplier that also misses dates has
   no fallback to absorb the miss.
4. **Risk Score** — Performance × priority multiplier (P1 1.5x, P2 1.3x, P3 1.1x, P4 1.0x, P5 0.9x).
5. **Risk Tier** — ≥3.75 Low, 2.50–3.74 Medium, 1.50–2.49 High, <1.50 Critical.
6. **Insufficient Data guard** — suppliers with fewer than 3 POs on file are flagged rather than
   scored. A 1-of-1 delivery record is not a rate.
7. **Peer-relative comparison** — a secondary signal that flags a supplier as a category laggard
   when it sits more than a configurable gap (default 0.5) below its category average. It never
   overrides the absolute tier.

Structured MCDM methods (AHP, DEMATEL, TOPSIS) were deliberately not used: they need an expert
panel and pairwise comparison matrices, which makes them periodic and deliberative. This tool does
continuous, automated monitoring off transactional data, and has an explicit thin-data guard those
methods have no equivalent for.

## Features

- **Register** — a Spend at Risk hero KPI, the reliability matrix (on-time rate vs dependency
  score, bubble-sized by annual spend, colorable by tier/category/region, click to open a
  supplier), risk-tier tally, Critical/High watchlist, category laggards, and manual snapshots.
- **Supplier Ledger** — fully inline-editable data grid, sortable, filterable by tier, searchable,
  sticky identity columns, column show/hide, CSV import/export with tolerant header matching,
  undo-able row deletion, and per-row calculation breakdowns.
- **Settings** — every weight, threshold, multiplier and guard, plus persistence status and a
  two-step reset-all control.
- **How this is scored** — the full project development report and methodology, opened on demand
  from the tab bar.

## Tech stack

| Layer | Approach |
| --- | --- |
| Framework | React 19 on TanStack Start (Vite) |
| Visualization | Hand-built SVG risk matrix, no charting library |
| CSV | PapaParse with fuzzy column-header matching |
| Icons | lucide-react |
| Persistence | Browser localStorage, debounced autosave |
| Styling | Hand-written CSS with design tokens, no UI component library |

There is no backend. Data stays in the browser and is never transmitted.

## Known limitations

- No lead time, last-order-date, owner or Incoterms fields — scoped out to keep the field set
  defensible against thin procurement data.
- No PDF/print export; CSV export covers the data.
- No fleet-level "what changed" roll-up (per-supplier trend exists).
- No bulk supplier actions and no mobile-specific layout — dense grids are the desktop use case.
- Peer comparison can be masked when an entire category is structurally risky; the absolute tier is
  what catches that.

## Development

```sh
git clone https://github.com/Shubham-Gambhire/supplierreliabilitymatrix
cd supplierreliabilitymatrix
npm i
npm run dev
```

Built with [Lovable](https://lovable.dev) — continue in the
[Lovable editor](https://lovable.dev/projects/5f69e257-a043-4bef-9b7f-697a0f8f5829). Changes pushed
to `main` on GitHub sync back into Lovable.

---

Made by Shubham Gambhire · [LinkedIn](https://www.linkedin.com/in/shubhambg)
