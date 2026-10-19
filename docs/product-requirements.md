# Supplier Reliability Matrix
## Project Development Document
*A Personal Prototype in Supply Chain Risk Analytics*

**Prepared by:** Shubham Gambhire

**Revision:** 19 October 2026 | **Current model:** v2

**Implementation baseline:** 2eb25f3e3baed543c857c3e0a4dfd89fd14a3cfe

Prototype status - Not affiliated with, and containing no data from, any employer

## Contents

| Section | Page |
| --- | --- |
| 1.  Executive Summary | 3 |
| 2.  Background and Origin | 3 |
| 3.  Objectives | 3 |
| 4.  Scope and Design Philosophy | 4 |
| 5.  Scoring Methodology | 5 |
| 6.  System Architecture and Technology Stack | 7 |
| 7.  Feature Overview | 7 |
| 8.  Design and User-Experience Evolution | 8 |
| 9.  Data Privacy and Confidentiality Approach | 9 |
| 10.  Testing and Validation Approach | 9 |
| 11.  Known Limitations and Future Work | 10 |
| 12.  Conclusion | 10 |

<!-- PAGE -->

## 1. Executive Summary

The Supplier Reliability Matrix is a self-contained, browser-based tool that screens suppliers using delivery history, sourcing dependency and business priority. It began as a spreadsheet scorecard built during an internship and has been rebuilt as an interactive prototype: an editable supplier ledger, a live reliability matrix, configurable scoring and a methodology that makes its limitations visible.

This document records the current model v2 implementation, including the priority-direction correction, strict data validation, recoverable local saving and comparable snapshots. Scores prioritize human investigation; they do not automatically approve, reject or award business to suppliers. They are not failure probabilities or estimates of financial loss.

## 2. Background and Origin

The original Supplier Risk Scorecard was built in Excel to flag suppliers worth a closer look before a sourcing or renewal decision. It used the fields that could be maintained consistently: on-time delivery counts, sole-source status and a priority tier assigned by the category owner. Other dimensions, such as quality and financial health, were outside that initial dataset.

This project reimplements that approach as an independent web application. All demonstration suppliers, locations and industries are fictional. No employer supplier dataset is included. It is a portfolio prototype intended to demonstrate supply chain domain knowledge and explainable analytical design.

## 3. Objectives

- Make a spreadsheet-based methodology interactive, inspectable and editable.

- Keep poor delivery, sole-source exposure and unassessed spend visible alongside the overall tier.

- Provide validated imports, recoverable persistence, full backups and meaningful history.

- Retain a distinctive procurement-ledger identity with accessible keyboard controls and usable phone-width layouts.

<!-- PAGE -->

## 4. Scope and Design Philosophy

### 4.1  Why a Small Field Set

A textbook supplier model can ask for lead-time variance, quality rejection rates, responsiveness, capacity and financial health. This prototype starts with delivery counts, sole-source status and priority, using annual spend for exposure summaries and bubble sizing. Name, stable ID, category and location support record management and context; custom fields do not affect scores.

Users must use a consistent reporting period and on-time definition. Total POs should count eligible completed/due orders, excluding future, not-yet-due and cancelled orders; partial-delivery treatment must be agreed. The app does not store or enforce those operational definitions. All spend is assumed to be USD, and P1 means highest criticality.

### 4.2  Choice of a Transparent Weighted Model

A two-component weighted model was chosen for clarity and the available inputs. AHP, DEMATEL and TOPSIS address different parts of multi-criteria evaluation and can also use transactional data or explicit missing-data rules. This prototype does not establish that they are unsuitable or that its own rankings are superior.

| Aspect | Other MCDM approaches | This Tool |
| --- | --- | --- |
| Purpose | Supplier selection, weighting or evaluation, depending on the method | Screen suppliers already on file for investigation |
| Inputs | Pairwise judgments, influence estimates or an alternatives-by-criteria matrix | Delivery counts, sole-source status and assigned priority |
| Recalculation | Depends on the implementation and data-refresh process | Re-runs after valid data edits or applied settings |
| Thin data | Requires explicit handling; not an inherent exclusion | Invalid Data and Insufficient Data guards |
| Interactions | Some methods model criteria dependence explicitly | A configurable heuristic compounding penalty |

Weights, cutoffs, priority factors and the compounding penalty are judgment-based. Outcome calibration and representative-user validation remain future work.

<!-- PAGE -->

## 5. Scoring Methodology

Higher scores always mean safer. Component scores use 1-5; performance and adjusted reliability are bounded to 0-5. The tables show defaults. Settings are edited as a draft and affect the application only after a valid Apply action; Cancel preserves the active configuration.

### 5.1  Delivery Score

On-Time Rate = On-Time Deliveries / Total POs. Bucket boundaries are configurable and displayed from the active settings.

| On-Time Rate | Delivery Score |
| --- | --- |
| At least 90% | 5 |
| 75% to below 90% | 4 |
| 60% to below 75% | 3 |
| 45% to below 60% | 2 |
| Below 45% | 1 |

### 5.2  Dependency Score

This fixed model v2 lookup combines sole-source status and assigned priority. Higher means greater sourcing resilience; alternative-supplier capability is not verified.

| Condition | Score |
| --- | --- |
| Not sole-sourced (alternatives exist) | 5 |
| Sole-sourced, Priority 4 or 5 | 3 |
| Sole-sourced, Priority 3 | 2 |
| Sole-sourced, Priority 1 or 2 | 1 |

### 5.3  Performance Score and Compounding Penalty

Penalty = c x max(0, 3 - Delivery) x max(0, 3 - Dependency).

Performance = clamp(wD x Delivery + wS x Dependency - Penalty, 0, 5).

Defaults: wD = 0.65, wS = 0.35 and c = 0.15. The penalty applies only when both components fall below 3. Setting c to zero gives a plain weighted sum. The interaction is a heuristic, not an estimated disruption probability.

<!-- PAGE -->

### 5.4  Priority Factor and Adjusted Reliability

| Priority Tier | Divisor |
| --- | --- |
| P1 (most critical) | 1.5 |
| P2 | 1.3 |
| P3 | 1.1 |
| P4 | 1.0 |
| P5 (least critical) | 0.9 |

Adjusted reliability = clamp(Performance / Priority factor, 0, 5). Division corrects the earlier multiplication error. Factors must be positive and nonincreasing P1-P5, so greater criticality cannot improve safety with other inputs unchanged.

### 5.5  Risk Tier

| Adjusted Reliability | Tier |
| --- | --- |
| At least 3.75 | Low Risk |
| At least 2.50, below 3.75 | Medium Risk |
| At least 1.50, below 2.50 | High Risk |
| Below 1.50 | Critical Risk |

Tiers use full precision; displayed scores use two decimals. A rounded value at a cutoff can still belong to the lower tier.

### 5.6  Data Quality and Minimum-History Guards

Invalid Data covers blank names, invalid/negative spend, non-whole or negative counts, on-time counts above total POs, priorities outside P1-P5 or unknown sole-source values. Blank numeric edits stay invalid. Valid rows below the minimum history, default 3 POs, are Insufficient Data; zero POs never receives a score.

Both states are excluded from the matrix, scored averages, peer comparisons and new snapshots. Their valid spend is shown separately as unassessed spend. Three POs is a guard, not statistical confidence.

### 5.7  Peer-Relative Comparison (Secondary Signal)

Compare each scored supplier with the average of the other scored suppliers in its normalized category. Flag it when more than the active gap, default 0.5, below that average. Show peer count and small-group/mixed-priority caveats; omit percentage gaps when the baseline is zero. Peer context never overrides the absolute tier.

<!-- PAGE -->

## 6. System Architecture and Technology Stack

The current implementation separates pure calculation and data modules from React view components. Supplier records have no shared backend; local browser storage is the persistence layer.

| Layer | Current Approach |
| --- | --- |
| UI and build | React/TanStack Start and Vite; view components call pure modules for scoring, validation, CSV, storage, history and IDs. |
| Visualization | Hand-built SVG matrix; area reflects annual spend with a disclosed minimum radius. An accessible list exposes overlapping suppliers. |
| Data exchange | PapaParse; explicit header aliases, validation preview, duplicate skip/update choice, stable IDs and formula-escaped CSV export. JSON provides full backup/restore. |
| Persistence | Versioned localStorage with debounced saving, save/error states, corrupt-save recovery, ID repair and newer cross-tab save detection. |
| Interface | Hand-written CSS and lucide-react icons; Radix dialogs provide focus management. |
| History | Manual snapshots include model/configuration identity. Only compatible entries are compared; at most 50 are retained per supplier. |

## 7. Feature Overview

### 7.1  Register (Dashboard)

- Summaries distinguish annual spend attached to Critical/High tiers from valid spend in unassessed rows. Neither is expected financial loss.

- The matrix plots on-time rate against dependency score: bottom-left is highest raw exposure, top-right strongest raw resilience. Position excludes priority adjustment; tier color includes it.

- Watchlist and category laggards link to ledger records. Independent attention signals flag poor delivery, P1-P3 sole-source dependency and thin-data sole sources without changing tiers.

- Record Snapshot saves scored suppliers only, blocks empty snapshots and announces the result. Legacy or differently configured history remains labeled and non-comparable.

<!-- PAGE -->

### 7.2  Supplier Ledger

- Inline editing with row validation; search, sortable headers, tier filters, sticky identity columns, column visibility and expandable calculation breakdowns.

- Custom text/number columns require unique, non-reserved labels. Stable IDs keep records distinct; repaired custom IDs preserve values, including ambiguous legacy values for review.

- CSV preview reports invalid rows and ambiguous/missing headers. Supported quoted USD amounts are parsed; unknown values are not silently defaulted. Matching records require an explicit skip/update choice.

- Deletion has a short Undo window. Export includes IDs/custom fields and spreadsheet-formula escaping. JSON restore validates a full backup before replacement and offers a current-data download.

### 7.3  Settings and Data Recovery

Apply requires weights in 0-1 summing to 1; descending delivery cutoffs within 0-100%, with score 1 fixed at 0%; and 5 >= Low > Medium > High >= 0. Priority factors are positive, at most 10 and nonincreasing P1-P5. Minimum POs is an integer 1-1000; compounding is 0-1 and peer gap 0-5. Reset-to-defaults fills a draft.

Persistence includes settings, custom columns, history and an empty ledger. Saving failures are visible; unreadable saves are preserved for download or explicit discard. Newer cross-tab saves pause overwriting, and pending changes flush when the page is hidden.

### 7.4  Methodology

An on-demand dialog explains active formulas, sample guards, score direction and limitations. Keyboard focus is contained, Escape closes it and focus returns to the trigger. This downloadable project document records model v2 defaults and evidence.

## 8. Design and User-Experience Evolution

The app retains its enterprise procurement-ledger identity: parchment, institutional navy and brass accents, a clear KPI hierarchy, sticky columns and undo-based deletion. Subsequent remediation added accessible controls, an overlap-safe matrix list, draft settings, visible save states and focused phone-width overflow checks.

This document revision retains the original cover, serif typography, section rules, navy/cream tables and twelve-section structure while correcting the implementation record. It changes documentation and download wording only, without changing scoring, supplier records, features or integrations.

<!-- PAGE -->

## 9. Data Privacy and Confidentiality Approach

- Demonstration suppliers, locations and industries are fictional. No employer supplier dataset is included. Illustrative watchlists do not constitute sanctions or denied-party screening.

- Supplier records remain in browser localStorage in this implementation; there is no supplier-data backend, account synchronization or automatic server backup. Browser storage and downloaded backups are not encrypted by the app.

- External fonts/images and technical error reporting can still use the network. Local storage therefore does not imply that the whole application makes no network requests.

- Users must retain usable JSON backups. CSV alone omits full configuration/history and is not a complete recovery copy. Clearing browser storage or losing the device can otherwise lose records.

## 10. Testing and Validation Approach

The following evidence was recorded during the 18 October 2026 remediation at baseline commit 2eb25f3. This documentation revision does not claim a new full application test run or a new feature release.

- Lovable reported 41/41 project Vitest regression tests passing. Independent checks passed 11/11 core test groups against final modules retrieved from GitHub.

- Production build and TypeScript checks passed in that environment. JavaScript calculation modules are tested separately; the TypeScript check does not cover their logic.

- Direct live checks covered impossible counts remaining unscored, invalid settings blocked from Apply, dialog focus restoration, bad CSV rejection and quoted-currency CSV preview.

- Register, Ledger and Settings were checked at 390px without page-level overflow or recorded browser errors in those checks. This is focused evidence, not a complete accessibility or device audit.

### Regression Requirements

Priority cannot improve safety; scores stay within 0-5; invalid/thin data cannot appear safely scored; active boundaries are exact. Empty ledgers and column-only changes must persist, malformed saves/history must recover safely, repaired IDs must preserve values, peer grouping must handle prototype-like names, and incompatible history must not become a comparable trend.

<!-- PAGE -->

## 11. Known Limitations and Future Work

| Gap | Current Limitation | Possible Next Step |
| --- | --- | --- |
| Uncalibrated model | Judgment-based weights, factors and tiers; no validated failure probabilities or loss estimates. | Validate against outcomes and review sensitivity. |
| Thin order samples | The 3-PO default does not establish confidence; uncertainty is not quantified. | Define sample policy and show uncertainty. |
| Missing context and risks | No period/freshness or order-level detail; quality, capacity, financial and geopolitical risks are absent. | Add observation dates, evidence ownership and relevant dimensions. |
| Sourcing and priority | Alternatives are not verified. Subjective priority can influence both dependency and adjustment. | Define priority criteria and validate fallback capability. |
| Compensation and peers | Averages can mask weakness; small, mixed-priority or weak categories can mislead. | Keep attention signals and validate category-level context. |
| Local-only records | No sign-in, roles, shared database or automatic cross-device/server backup. Backups are unencrypted. | Agree the operating context before adding shared storage and access control. |
| Concurrency and history | Cross-tab writes can still race. Manual history is capped at 50/supplier; no immutable audit or fleet change summary. | Strengthen concurrency and add auditable change tracking. |
| Workflow and exports | No bulk actions, ERP ingestion, scheduled alerts or supplier-assessment PDF/print export. | Prioritize workflows after representative-user testing. |
| Assurance coverage | No full real screen-reader, formal security, representative-user or large-dataset benchmark recorded. | Run targeted accessibility, security and performance evaluations. |

## 12. Conclusion

The Supplier Reliability Matrix provides a transparent starting point for supplier review using a small input set. Model v2 corrects score direction and adds stronger data, saving, import and history safeguards. It does not establish superiority over other models or replace procurement judgment. Use its signals to prioritize investigation, verify the underlying evidence and make a human decision.

- End of document -
