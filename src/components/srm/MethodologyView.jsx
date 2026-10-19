import React from "react";
import { FileText, ArrowUpRight } from "lucide-react";
import { Stamp } from "./shared.jsx";
import { deliveryBucketLabels, tierRanges, MODEL_VERSION } from "@/lib/srm/scoring.js";
import { HISTORY_LIMIT } from "@/lib/srm/history.js";

export const REPORT_PDF_URL = "/supplier-reliability-matrix-development-report.pdf";

export default function MethodologyView({ config }) {
  const labels = deliveryBucketLabels(config.deliveryBuckets);
  return (
    <div className="stack-lg doc">
      <section className="panel">
        <h3>This page is the current methodology (model v{MODEL_VERSION})</h3>
        <p>
          Every score here is on a 0 to 5 scale where <strong>higher means safer</strong>. Values
          below reflect your active settings. This is a transparent rules-based heuristic for
          flagging suppliers worth a closer look. It is not a calibrated failure probability, not
          statistically validated, and not an estimate of financial loss.
        </p>
      </section>

      <section className="panel">
        <h3>Project development document</h3>
        <p className="note-line" role="note">
          <span>
            <strong>Updated 19 October 2026.</strong> The PRD describes model v2, current
            requirements, validation evidence and remaining limitations using default settings.
            The calculation tables below reflect your active settings.
          </span>
        </p>
        <a className="report-link" href={REPORT_PDF_URL} target="_blank" rel="noopener noreferrer">
          <FileText size={15} /> Open the updated PRD (PDF, 10 pages, opens in new tab){" "}
          <ArrowUpRight size={13} />
        </a>
      </section>

      <section className="panel">
        <h3>Why these few fields</h3>
        <p>
          The scorecard uses only fields a standard PO ledger and vendor master usually hold:
          delivery counts, a priority tier set by the category owner (P1 = most critical),
          sole-source status and annual spend (USD). That keeps it runnable on the data that exists.
          It also means important dimensions are absent: no measurement window or data freshness, no
          quality, lead-time, financial-health or geopolitical signals.
        </p>
      </section>

      <section className="panel">
        <h3>Why a simple weighted heuristic</h3>
        <p>
          Multi-criteria methods such as AHP, DEMATEL, TOPSIS and VIKOR are well suited to weighting
          or ranking many criteria. AHP and DEMATEL typically elicit expert judgements; TOPSIS can
          run on weights from any source, and many methods can be combined with missing-data rules.
          This project chose a small, transparent weighted score as a pragmatic choice for two
          inputs that is easy to audit and recompute, not because other methods could not work.
        </p>
        <p>
          The 0.65 / 0.35 weighting is a judgement call, not the output of a validated elicitation.
          The minimum order count ({config.minPOs}) is a simple guard against scoring tiny samples;
          it does not give statistical confidence.
        </p>
      </section>

      <section className="panel">
        <h3>Data checks</h3>
        <ul className="doc-list">
          <li>
            <strong>Invalid Data</strong>: required name missing, counts that are blank, negative,
            fractional or non-finite, on-time above total, priority outside P1 to P5, spend negative
            or not a number, or sole-source not Yes/No. Not scored, excluded from averages, the
            matrix, peer comparison and snapshots.
          </li>
          <li>
            <strong>Insufficient Data</strong>: valid data but fewer than {config.minPOs} POs (zero
            POs is never scored). Not scored.
          </li>
        </ul>
      </section>

      <section className="panel">
        <h3>Step 1. Delivery Score</h3>
        <p>On-Time Rate = On-Time Deliveries ÷ Total POs, bucketed using the active minima:</p>
        <p>
          Total POs should count only eligible completed or due orders within one consistent
          reporting period, excluding future, not-yet-due and cancelled orders. The app has no
          period or freshness fields, so it cannot check this; keep the period consistent across
          suppliers yourself.
        </p>
        <p>
          <strong>Needs attention signals</strong> sit alongside the tier and never change it: poor
          delivery (on-time rate below the active score-3 minimum), sole-source dependency
          (sole-sourced at P1 to P3) and sole source with too few POs to score. A weighted tier can
          otherwise look moderate while raw delivery is poor.
        </p>
        <table className="ref-table">
          <thead>
            <tr>
              <th>On-time rate</th>
              <th>Score</th>
            </tr>
          </thead>
          <tbody>
            {config.deliveryBuckets.map((b, i) => (
              <tr key={b.score}>
                <td>{labels[i]}</td>
                <td>{b.score}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <h3>Step 2. Dependency Score (higher = more sourcing resilience)</h3>
        <table className="ref-table">
          <thead>
            <tr>
              <th>Condition</th>
              <th>Score</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Not sole-sourced (alternates exist)</td>
              <td>5</td>
            </tr>
            <tr>
              <td>Sole-sourced, P4 to P5</td>
              <td>3</td>
            </tr>
            <tr>
              <td>Sole-sourced, P3</td>
              <td>2</td>
            </tr>
            <tr>
              <td>Sole-sourced, P1 to P2 (most critical)</td>
              <td>1</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="panel">
        <h3>Step 3. Performance Score</h3>
        <p className="formula">
          Performance = clamp(({config.weights.delivery} × Delivery) + ({config.weights.dependency}{" "}
          × Dependency) - Penalty, 0, 5)
        </p>
        <p className="formula">
          Penalty = {config.compoundingWeight} × max(0, 3 - Delivery) × max(0, 3 - Dependency)
        </p>
        <p className="note-line">
          The penalty applies only when both scores are below the midpoint, reflecting that a
          sole-sourced supplier that also misses dates has no fallback. Set it to 0 for a plain
          weighted sum.
        </p>
      </section>

      <section className="panel">
        <h3>Step 4. Priority adjustment</h3>
        <p>
          More critical suppliers need a higher bar, so the performance score is{" "}
          <strong>divided</strong> by a priority multiplier. Multipliers must not increase from P1
          to P5, so making a supplier more critical can never improve its score or tier when its
          data is unchanged.
        </p>
        <table className="ref-table">
          <thead>
            <tr>
              <th>Priority</th>
              <th>Divide by</th>
            </tr>
          </thead>
          <tbody>
            {[1, 2, 3, 4, 5].map((p) => (
              <tr key={p}>
                <td>
                  P{p}
                  {p === 1 ? " (most critical)" : ""}
                </td>
                <td>{config.multipliers[p]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="formula">Adjusted reliability = clamp(Performance ÷ Multiplier, 0, 5)</p>
      </section>

      <section className="panel">
        <h3>Step 5. Tier</h3>
        <table className="ref-table">
          <thead>
            <tr>
              <th>Adjusted reliability</th>
              <th>Tier</th>
            </tr>
          </thead>
          <tbody>
            {tierRanges(config.thresholds).map((r) => (
              <tr key={r.tier}>
                <td>{r.range}</td>
                <td>
                  <Stamp tier={r.tier} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="note-line">
          Tiers are assigned at full precision. Scores are displayed to 2 decimals, so a displayed
          value equal to a threshold may sit just below it.
        </p>
      </section>

      <section className="panel">
        <h3>Step 6. Peer comparison (descriptive only)</h3>
        <p>
          For each scored supplier, the average adjusted reliability of the <em>other</em> scored
          suppliers in the same category is computed (the supplier itself is excluded). A supplier
          more than {config.peerGapThreshold} below that average is labelled a category laggard.
          Small peer groups and mixed priority tiers limit what this means, and an entire category
          can be risky without anyone lagging. It never overrides the absolute tier.
        </p>
      </section>

      <section className="panel">
        <h3>Reliability matrix</h3>
        <p>
          x is the on-time rate and y is the dependency score. Bottom-left (late and sole-sourced)
          is the highest raw exposure; top-right is the strongest raw resilience. Position excludes
          the priority adjustment; color by tier includes it. Bubble area is proportional to annual
          spend.
        </p>
      </section>

      <section className="panel">
        <h3>Snapshots</h3>
        <p>
          Each snapshot records the model version and a fingerprint of the active settings. Trends
          compare only snapshots made with the same model and settings. Older snapshots from the
          previous model are kept and labelled legacy. Up to {HISTORY_LIMIT} snapshots are kept per
          supplier.
        </p>
      </section>
    </div>
  );
}
