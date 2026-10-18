# Audit remediation (baseline 4e9f9197)

Scope: browser-only app, no backend. Design, demo suppliers, author credit, repository and slug unchanged.

## Findings and fixes

| # | Finding | Fix |
| --- | --- | --- |
| 1 | Priority inversion: `performance x multiplier` made P1 look safer | `adjusted = clamp(performance / multiplier, 0, 5)`; multipliers must be positive and non-increasing P1 to P5; performance also clamped; tiers use full precision with explicit non-overlapping ranges; "Adjusted reliability (higher = safer)" labels throughout |
| 2 | Invalid rows clamped/coerced and scored | `validateSupplier` (integer counts, onTime <= total, P1-P5, spend >= 0, name, boolean). Separate **Invalid Data** vs **Insufficient Data**; zero POs never scored even if minPOs is 0; inline blanks stay blank (invalid), never become 0; row errors linked via `aria-describedby`/`aria-invalid` |
| 3 | Settings applied while invalid | Draft settings with Apply/Cancel; `validateConfig` with inline errors; bucket labels derived from active minima |
| 4 | Persistence data loss | Versioned save of suppliers, config, history and custom columns together (empty ledgers included); random collision-resistant IDs; duplicate legacy IDs repaired without dropping records; corrupt saves not overwritten (download raw / discard); read vs write errors distinguished; views hidden until hydrated; flush on pagehide/visibilitychange; cross-tab write-token conflict notice |
| 5 | CSV correctness/safety | Exact normalized aliases (no substring), ambiguous/missing required headers rejected, BOM/quoted commas/`$1,200` handled, unparseable values rejected, preview with explicit skip/update for duplicates, input reset each attempt, export with IDs, `Custom:` columns and `escapeFormulae`; reserved/duplicate custom labels rejected; imported categories kept in the select; versioned JSON backup/restore validated before replace |
| 6 | Snapshot comparability | Entries carry model version + config fingerprint; only compatible entries compared/plotted; legacy and other-settings entries kept and labelled; 50 per supplier limit disclosed; empty snapshots blocked; success announced |
| 7 | Peer stats | Leave-one-out average of other scored peers, Map-based grouping, normalized keys, prototype-safe, small-group / mixed-priority notes, no % when baseline is 0 |
| 8 | Matrix semantics | Bottom-left = highest exposure, top-right = strongest raw resilience; reference line from active score-3 minimum; omission note uses active minPOs and invalid count; true area-proportional bubbles with disclosed 3px minimum; accessible plotted-supplier list; empty state |
| 9 | Accessibility | Specific labels on number inputs, `aria-pressed` sole-source toggles, button sort headers with `aria-sort`, `aria-expanded/controls` on expanders, button watchlist rows, Radix Dialog (focus trap, initial focus, restore focus, inert background, scroll lock), polite live region and alert regions |
| 10 | KPI/copy/docs | Spend attached to Critical/High tiers labelled not-expected-loss; separate unassessed spend; demo / USD / P1 / local-storage / backup notes; methodology claims about MCDM corrected; PDF marked historical; privacy wording qualified; README updated |
| 11 | Engine/tests | Pure modules in `src/lib/srm/` (scoring, csv, storage, history, ids, seed) with Vitest regressions |

## Validation results (this change)

- `bunx vitest run`: 36 tests passed (priority monotonicity/bounds, delivery and tier boundaries, zero/below-min, blank/negative/fractional/Infinity/NaN/onTime>total, invalid settings, leave-one-out and `__proto__` categories, ambiguous headers, quoted currency, invalid booleans, formula escaping, custom-field round trip, duplicate ID repair, empty ledger and custom-column-only save, corrupt saves, compatible/incompatible trends, history limit).
- `tsc --noEmit -p .`: exit 0 (JS modules are not type-checked by tsconfig).
- `vite build`: succeeded.
- Playwright smoke (localhost, 1280px and 390px): register render, snapshot announcement, modal focus trap / Escape / focus restore / scroll lock, blank total -> Invalid Data and back, delete + undo, CSV preview (1 new / 1 duplicate / 1 invalid) and apply, invalid weights block Apply, backup download, restore and persistence across reload, corrupt save preserved with recovery notice, zero horizontal page overflow on all tabs at 390px, no console errors.

## Residual limitations

- The heuristic is not calibrated or validated; weights are judgement calls.
- No measurement window, freshness, quality or financial dimensions.
- Cross-tab detection relies on the browser `storage` event plus a write token check before each save; simultaneous writes within the same instant could still race.
- Screen-reader behaviour was checked structurally (roles, names, focus), not with a real screen reader.
- The historical PDF is unchanged except for the in-app historical notice.
- JS engine modules are covered by tests, not by TypeScript.


## Follow-up review fixes (second audit pass)

- Storage: history is only sliced when it is a real array (`{length:1e30}` no longer throws); `parseSaved`/`parseBackup`/`normalizeState` convert any unexpected error into a recovery result.
- Custom column ID repair keeps an old-ID to new-ID map and remaps each supplier's values; ambiguous shared legacy IDs keep raw values in `_legacyCustom` with a warning instead of dropping them.
- Derived rows expose validated numeric values (`spendValue`, `totalValue`, `onTimeValue`, `priorityValue`; null when invalid, blanks never become 0). KPIs, matrix and details use them, so legacy string spend such as "1200" displays and totals correctly.
- Total POs definition: eligible completed/due orders within one consistent reporting period, excluding future, not-yet-due and cancelled orders. Limitation: no period/freshness data exists, so this cannot be enforced.
- Needs attention signals, independent of tier: poor delivery (rate below active score-3 minimum), sole-source dependency (P1 to P3), sole source with thin data. Example: non-sole P5 with 0/10 on time stays Medium by formula but is flagged Poor delivery.
- Methodology modal explicitly restores focus to the "How this is scored" button on close.
