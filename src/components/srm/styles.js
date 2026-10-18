import { C, F_DISPLAY, F_BODY, F_DATA } from "./tokens.js";
export const APP_CSS = `
        .ledger-app * { box-sizing: border-box; }
        .ledger-app {
          background: ${C.paper};
          min-height: 100vh; color: ${C.ink}; font-family: ${F_BODY}; overflow-x: hidden;
        }
        .ledger-app ::-webkit-scrollbar { width: 8px; height: 8px; }
        .ledger-app ::-webkit-scrollbar-thumb { background: ${C.paperLineStrong}; border-radius: 4px; }
        .ledger-app button, .ledger-app input, .ledger-app select { font-family: ${F_BODY}; }
        .ledger-app *:focus-visible { outline: 2px solid ${C.navy}; outline-offset: 2px; }
        @media (prefers-reduced-motion: reduce) { .ledger-app * { transition: none !important; animation: none !important; } }
        .spin { animation: spin 0.9s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }

        .masthead { max-width: 1080px; margin: 0 auto; padding: 36px 24px 0; }
        .masthead .title-row { display: flex; align-items: center; gap: 14px; }
        .masthead .brand-logo { height: 32px; width: auto; flex: 0 0 auto; object-fit: contain; display: block; }
        .masthead h1 { font-family: ${F_DISPLAY}; font-size: 34px; font-weight: 600; margin: 6px 0 6px; letter-spacing: -0.01em; }
        .masthead .sub { font-family: ${F_BODY}; color: ${C.inkMuted}; font-size: 14px; max-width: 620px; line-height: 1.55; margin: 0 0 16px; }
        .meta-row { display: flex; gap: 18px; flex-wrap: wrap; font-family: ${F_DATA}; font-size: 11px; color: ${C.inkMuted}; border-top: 1px solid ${C.paperLineStrong}; border-bottom: 1px solid ${C.paperLineStrong}; padding: 10px 0; margin-bottom: 0; }
        .meta-row b { color: ${C.ink}; }

        .tabbar { max-width: 1080px; margin: 0 auto; padding: 0 24px; display: flex; gap: 2px; overflow-x: auto; }
        .tab-btn {
          display: flex; align-items: center; gap: 7px; padding: 11px 16px; border: 1px solid ${C.paperLineStrong};
          border-bottom: none; background: ${C.surfaceAlt}; color: ${C.inkMuted}; font-size: 13px; font-weight: 500;
          border-radius: 6px 6px 0 0; cursor: pointer; white-space: nowrap; margin-top: 8px; position: relative; top: 1px;
        }
        .tab-btn.active { background: ${C.surface}; color: ${C.navy}; border-color: ${C.paperLineStrong}; border-bottom: 1px solid ${C.surface}; font-weight: 600; }

        .content-wrap { max-width: 1080px; margin: 0 auto; padding: 22px 24px 60px; border-top: 1px solid ${C.paperLineStrong}; background: ${C.surface}; min-height: 60vh; }
        .app-footer { max-width: 1080px; margin: 0 auto; padding: 18px 24px 32px; font-size: 11px; font-family: ${F_DATA}; color: ${C.ink}; display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; border-top: 1px solid ${C.paperLineStrong}; }
        .footer-linkedin { margin-left: auto; display: inline-flex; align-items: center; gap: 6px; color: ${C.navy}; text-decoration: none; font-weight: 600; }
        .footer-linkedin:hover { text-decoration: underline; }

        .stack-lg { display: flex; flex-direction: column; gap: 22px; min-width: 0; }
        .stack-lg > * { min-width: 0; }
        .grid-2 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 18px; }
        @media (max-width: 980px) { .grid-2 { grid-template-columns: 1fr 1fr; } }
        @media (max-width: 640px) { .grid-2 { grid-template-columns: 1fr; } }
        .laggard-category { font-size: 10.5px; color: ${C.ink}; opacity: 0.6; font-family: ${F_DATA}; }

        .kpi-hero-row { display: flex; align-items: baseline; gap: 28px; flex-wrap: wrap; padding-bottom: 16px; border-bottom: 1px solid ${C.paperLineStrong}; }
        .hero-stat-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: ${C.ink}; opacity: 0.65; margin-bottom: 4px; }
        .hero-stat-value { font-family: ${F_DATA}; font-size: 40px; font-weight: 700; line-height: 1; }
        .hero-stat-sub { font-size: 11.5px; color: ${C.ink}; opacity: 0.6; margin-top: 4px; }
        .stat-strip { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px; font-size: 12.5px; align-self: flex-end; padding-bottom: 4px; }
        .stat-strip-item { display: inline-flex; align-items: baseline; gap: 5px; }
        .stat-strip-sep { color: ${C.ink}; opacity: 0.35; margin-right: 8px; }
        .stat-strip-label { color: ${C.ink}; opacity: 0.65; }
        .stat-strip-value { font-family: ${F_DATA}; font-weight: 700; color: ${C.ink}; }

        .panel { border: 1px solid ${C.paperLineStrong}; border-radius: 4px; padding: 18px 20px; background: ${C.surface}; }
        .panel-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
        .panel h3 { font-family: ${F_DISPLAY}; font-size: 17px; font-weight: 600; margin: 0 0 10px; display: flex; align-items: center; gap: 6px; }
        .panel-head h3 { margin: 0; }
        .panel-hint { font-size: 11.5px; color: ${C.inkFaint}; font-family: ${F_DATA}; }
        .panel p { font-size: 13.5px; line-height: 1.6; color: ${C.ink}; margin: 0 0 8px; }

        .matrix-section { padding: 4px 0 8px; }
        .matrix-section-head { margin-bottom: 14px; }
        .matrix-section-head h2 { font-family: ${F_DISPLAY}; font-size: 22px; font-weight: 600; margin: 0 0 2px; }
        .matrix-section .panel-hint { display: block; }

        .matrix-svg { width: 100%; height: auto; }
        .matrix-point { cursor: pointer; }
        .matrix-point:hover circle { opacity: 1; stroke-width: 2.5; }
        .matrix-point:focus-visible circle { outline: 2px solid ${C.navy}; outline-offset: 2px; }
        .matrix-note { font-size: 11.5px; color: ${C.ink}; font-style: italic; font-family: ${F_DISPLAY}; margin-top: 6px; }
        .matrix-legend { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 10px; align-items: center; }
        .legend-item { display: flex; align-items: center; gap: 5px; font-size: 11px; font-family: ${F_DATA}; color: ${C.ink}; }
        .legend-swatch { width: 9px; height: 9px; border-radius: 50%; display: inline-block; }
        .legend-note { color: ${C.ink}; opacity: 0.65; font-style: italic; font-family: ${F_DISPLAY}; }
        .colorby-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
        .colorby-label { font-size: 11.5px; font-weight: 600; color: ${C.ink}; }
        .snapshot-btn { margin-left: auto; }
        .snapshot-note { font-size: 11px; font-family: ${F_DATA}; color: ${C.ink}; opacity: 0.7; }

        .tally { display: flex; flex-direction: column; gap: 10px; }
        .tally-row { display: grid; grid-template-columns: 110px 1fr 28px; align-items: center; gap: 10px; }
        .tally-label { font-size: 12px; font-weight: 600; }
        .tally-track { height: 8px; background: ${C.paper}; border: 1px solid ${C.paperLineStrong}; border-radius: 4px; overflow: hidden; }
        .tally-fill { height: 100%; }
        .tally-count { font-family: ${F_DATA}; font-size: 12px; text-align: right; color: ${C.inkMuted}; }

        .watchlist { display: flex; flex-direction: column; }
        .watchlist-row { display: flex; align-items: center; justify-content: space-between; padding: 8px 0; border-top: 1px solid ${C.paperLine}; cursor: pointer; }
        .watchlist-row:hover { background: ${C.surfaceAlt}; }
        .watchlist-name { display: flex; align-items: center; gap: 7px; font-size: 12.5px; }
        .watchlist-score { font-family: ${F_DATA}; font-size: 13px; font-weight: 600; }
        .empty-note { color: ${C.inkFaint}; font-size: 13px; font-style: italic; }

        .info-tip { position: relative; display: inline-flex; align-items: center; justify-content: center; width: 15px; height: 15px; border-radius: 50%; border: 1px solid ${C.ink}; font-size: 10px; font-family: ${F_DATA}; font-weight: 600; cursor: help; opacity: 0.55; }
        .info-tip:hover, .info-tip:focus { opacity: 1; outline: none; }
        .info-tip-bubble { visibility: hidden; opacity: 0; position: absolute; bottom: 130%; left: 0; width: 240px; max-width: calc(100vw - 40px); background: ${C.ink}; color: ${C.surface}; font-family: ${F_BODY}; font-weight: 400; font-size: 11.5px; line-height: 1.55; padding: 9px 11px; border-radius: 4px; transition: opacity 0.15s ease; z-index: 30; pointer-events: none; }
        .info-tip:hover .info-tip-bubble, .info-tip:focus .info-tip-bubble { visibility: visible; opacity: 1; }
        .data-privacy-note { font-size: 11.5px; opacity: 0.7; }

        .methodology-trigger { margin-left: auto; display: flex; align-items: center; gap: 6px; padding: 8px 10px; border: none; background: transparent; color: ${C.ink}; opacity: 0.7; font-size: 12.5px; font-family: ${F_BODY}; cursor: pointer; white-space: nowrap; }
        .methodology-trigger:hover { opacity: 1; text-decoration: underline; }
        .github-link { align-self: center; margin-left: 10px; display: inline-flex; align-items: center; gap: 5px; padding: 8px 10px; color: ${C.ink}; opacity: 0.7; font-size: 12.5px; text-decoration: none; white-space: nowrap; }
        .github-link:hover { opacity: 1; text-decoration: underline; }
        .report-link { display: inline-flex; align-items: center; gap: 8px; margin: 4px 0 10px; padding: 10px 14px; border: 1px solid ${C.navy}; border-radius: 4px; background: ${C.surfaceAlt}; color: ${C.navy}; font-size: 13px; font-weight: 600; text-decoration: none; }
        .report-link:hover { background: ${C.navy}; color: ${C.surface}; }



        .modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: flex-start; justify-content: center; padding: 40px 20px; z-index: 100; overflow-y: auto; }
        .modal-panel { background: ${C.surface}; border-radius: 6px; max-width: 900px; width: 100%; max-height: calc(100vh - 80px); display: flex; flex-direction: column; box-shadow: 0 20px 60px rgba(0,0,0,0.35); }
        .modal-head { display: flex; align-items: center; justify-content: space-between; padding: 16px 22px; border-bottom: 1px solid ${C.paperLineStrong}; flex-shrink: 0; }
        .modal-head h2 { font-family: ${F_DISPLAY}; font-size: 19px; font-weight: 600; margin: 0; }
        .modal-close { border: none; background: transparent; cursor: pointer; color: ${C.ink}; padding: 5px; border-radius: 4px; display: flex; }
        .modal-close:hover { background: ${C.surfaceAlt}; }
        .modal-body { padding: 20px 22px; overflow-y: auto; background: ${C.paper}; }

        .stamp { display: inline-block; border: 1.5px solid; border-radius: 3px; font-family: ${F_DATA}; font-weight: 700; letter-spacing: 0.08em; transform: rotate(-2deg); background: ${C.surface}; }

        .ledger-toolbar { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between; }
        .search-box { display: flex; align-items: center; gap: 8px; border: 1px solid ${C.paperLineStrong}; border-radius: 4px; padding: 7px 10px; background: ${C.surfaceAlt}; min-width: 220px; }
        .search-box input { border: none; background: transparent; outline: none; font-size: 12.5px; width: 100%; color: ${C.ink}; }
        .chip-row { display: flex; gap: 6px; flex-wrap: wrap; }
        .chip { border: 1px solid ${C.paperLineStrong}; background: ${C.surfaceAlt}; color: ${C.inkMuted}; font-size: 11.5px; padding: 5px 11px; border-radius: 999px; cursor: pointer; }
        .chip-active { background: ${C.navy}; color: white; border-color: ${C.navy}; }
        .toolbar-actions { display: flex; gap: 8px; align-items: center; }
        .btn-outline, .btn-primary { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; padding: 7px 12px; border-radius: 4px; cursor: pointer; }
        .btn-outline { background: ${C.surface}; border: 1px solid ${C.paperLineStrong}; color: ${C.ink}; }
        .btn-outline:hover { border-color: ${C.navy}; color: ${C.navy}; }
        .btn-primary { background: ${C.navy}; border: 1px solid ${C.navy}; color: white; }
        .btn-primary:hover { background: ${C.navySoft}; }

        .columns-menu { position: relative; }
        .columns-panel { position: absolute; top: calc(100% + 6px); right: 0; background: ${C.surface}; border: 1px solid ${C.paperLineStrong}; border-radius: 5px; padding: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.15); z-index: 20; min-width: 170px; }
        .columns-panel-item { display: flex; align-items: center; gap: 8px; font-size: 12.5px; padding: 5px 4px; cursor: pointer; white-space: nowrap; }
        .columns-panel-item:hover { background: ${C.surfaceAlt}; }
        .columns-panel { max-height: 70vh; overflow-y: auto; max-width: calc(100vw - 32px); }
        .columns-panel-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.07em; color: ${C.inkFaint}; font-family: ${F_DATA}; padding: 8px 4px 3px; border-top: 1px solid ${C.paperLine}; margin-top: 4px; }
        .columns-panel-label:first-child { border-top: none; margin-top: 0; padding-top: 2px; }
        .columns-panel-item.custom { justify-content: space-between; gap: 6px; }
        .columns-panel-check { display: flex; align-items: center; gap: 8px; cursor: pointer; min-width: 0; }
        .col-label-text { overflow: hidden; text-overflow: ellipsis; max-width: 150px; }
        .col-remove { border: none; background: transparent; color: ${C.inkMuted}; cursor: pointer; padding: 2px 3px; border-radius: 3px; display: inline-flex; }
        .col-remove:hover { color: ${C.danger || C.navy}; background: ${C.surfaceAlt}; }
        .columns-add { display: flex; flex-direction: column; gap: 6px; padding: 2px 4px 4px; }
        .columns-add-input { border: 1px solid ${C.paperLineStrong}; border-radius: 4px; padding: 6px 7px; font-size: 12.5px; background: ${C.surface}; color: ${C.ink}; width: 100%; }
        .columns-add-row { display: flex; gap: 6px; align-items: center; }
        .columns-add-row .cell-select { flex: 1; }

        .ledger-scroll { overflow-x: auto; max-width: 100%; border: 1px solid ${C.paperLineStrong}; border-radius: 4px; position: relative; -webkit-overflow-scrolling: touch; }
        .ledger-table { width: 100%; border-collapse: collapse; min-width: 980px; font-size: 12.5px; }
        .ledger-table thead th { text-align: left; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.06em; color: ${C.inkMuted}; background: ${C.surfaceAlt}; padding: 9px 8px; border-bottom: 1px solid ${C.paperLineStrong}; white-space: nowrap; }
        .th-sort { cursor: pointer; display: table-cell; }
        .th-sort span { margin-right: 4px; }
        .ledger-table tbody tr:not(.row-detail) { border-top: 1px solid ${C.paperLine}; }
        .ledger-table td { padding: 5px 8px; vertical-align: middle; }
        .row-open { background: ${C.surfaceAlt}; }
        .data-cell { font-family: ${F_DATA}; }
        .sticky-col { position: sticky; left: 0; z-index: 3; background: ${C.surfaceAlt}; }
        .sticky-col-2 { position: sticky; left: 24px; z-index: 3; background: ${C.surfaceAlt}; box-shadow: 2px 0 4px -2px rgba(0,0,0,0.18); }
        .ledger-table tbody td.sticky-col, .ledger-table tbody td.sticky-col-2 { background: ${C.surface}; }
        .ledger-table tbody tr.row-open td.sticky-col, .ledger-table tbody tr.row-open td.sticky-col-2 { background: ${C.surfaceAlt}; }
        .cell-input { border: 1px solid transparent; background: transparent; font-size: 12.5px; padding: 4px 5px; border-radius: 3px; width: 100%; color: ${C.ink}; }
        .cell-input:hover, .cell-input:focus { border-color: ${C.paperLineStrong}; background: ${C.surface}; }
        .cell-name { font-weight: 600; min-width: 170px; }
        .cell-select { border: 1px solid ${C.paperLineStrong}; background: ${C.surface}; font-family: ${F_DATA}; font-size: 12px; border-radius: 3px; padding: 3px 4px; }
        .field-num { border: 1px solid ${C.paperLineStrong}; background: ${C.surface}; font-family: ${F_DATA}; font-size: 12.5px; padding: 4px 6px; border-radius: 3px; text-align: right; }
        .field-num-warn { border-color: ${C.critical}; background: ${C.criticalDim}; }
        .toggle-y-n { width: 26px; height: 22px; border-radius: 3px; border: 1px solid ${C.paperLineStrong}; background: ${C.surface}; font-family: ${F_DATA}; font-size: 11px; font-weight: 700; cursor: pointer; color: ${C.inkMuted}; }
        .toggle-y-n.on { background: ${C.brassDim}; border-color: ${C.brass}; color: ${C.brass}; }
        .peer-badge { font-family: ${F_DATA}; font-size: 10px; color: ${C.brass}; background: ${C.brassDim}; border-radius: 3px; padding: 1px 5px; margin-top: 4px; display: inline-block; white-space: nowrap; }
        .row-expand, .row-delete { border: none; background: transparent; cursor: pointer; color: ${C.inkFaint}; padding: 4px; border-radius: 3px; display: flex; }
        .row-expand:hover, .row-delete:hover { background: ${C.paper}; color: ${C.ink}; }

        .undo-toast { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background: ${C.ink}; color: ${C.surface}; font-family: ${F_BODY}; font-size: 13px; padding: 10px 16px; border-radius: 6px; display: flex; align-items: center; gap: 14px; z-index: 50; box-shadow: 0 6px 20px rgba(0,0,0,0.3); }
        .undo-toast button { background: none; border: none; color: ${C.surface}; text-decoration: underline; font-weight: 600; font-size: 13px; cursor: pointer; padding: 0; font-family: ${F_BODY}; }

        .row-detail td { background: ${C.surfaceAlt}; border-bottom: 1px solid ${C.paperLineStrong}; padding: 14px 18px; }
        .detail-chain { display: flex; align-items: center; gap: 20px; flex-wrap: wrap; }
        .detail-left { flex: 1; min-width: 260px; }
        .detail-text { font-size: 12.5px; line-height: 1.6; margin: 0; }
        .detail-warn { color: ${C.critical}; font-weight: 600; }
        .detail-chain-math { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
        .chip-math { font-family: ${F_DATA}; font-size: 11px; background: ${C.surface}; border: 1px solid ${C.paperLineStrong}; padding: 4px 8px; border-radius: 3px; white-space: nowrap; }
        .chip-math.strong { font-weight: 700; border-color: ${C.navy}; color: ${C.navy}; }
        .chip-math.penalty { border-color: ${C.high}; color: ${C.high}; }
        .op { color: ${C.ink}; font-family: ${F_DATA}; font-size: 12px; }
        .detail-meta { font-size: 12px; font-family: ${F_DATA}; color: ${C.ink}; opacity: 0.75; margin: 0 0 6px; }
        .detail-peer { width: 100%; border-top: 1px solid ${C.paperLine}; margin-top: 4px; padding-top: 10px; }
        .detail-history { width: 100%; border-top: 1px solid ${C.paperLine}; margin-top: 4px; padding-top: 10px; display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
        .sparkline-svg { width: 160px; height: 34px; flex-shrink: 0; }
        .history-meta { display: flex; gap: 14px; flex-wrap: wrap; font-size: 11.5px; font-family: ${F_DATA}; color: ${C.ink}; align-items: center; }
        .trend-up, .trend-down, .trend-flat, .trend-empty { display: inline-flex; align-items: center; gap: 3px; font-family: ${F_DATA}; font-size: 11.5px; }
        .trend-up { color: ${C.low}; }
        .trend-down { color: ${C.critical}; }
        .trend-flat, .trend-empty { color: ${C.ink}; opacity: 0.6; }

        .doc .panel h3 { border-bottom: 1px solid ${C.paperLine}; padding-bottom: 8px; }
        .doc-list { padding-left: 20px; margin: 8px 0; }
        .doc-list li { font-size: 13.5px; line-height: 1.6; margin-bottom: 6px; }
        .ref-table { width: 100%; border-collapse: collapse; margin: 8px 0 4px; font-size: 12.5px; }
        .ref-table th { text-align: left; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.05em; color: ${C.ink}; padding: 5px 8px; border-bottom: 1px solid ${C.paperLineStrong}; }
        .ref-table td { padding: 6px 8px; border-top: 1px solid ${C.paperLine}; font-family: ${F_DATA}; }
        .note-line { font-size: 12px; color: ${C.ink}; font-style: italic; }
        .formula { font-family: ${F_DATA}; font-size: 13px; background: ${C.surfaceAlt}; border: 1px solid ${C.paperLineStrong}; padding: 8px 10px; border-radius: 3px; display: inline-block; }

        .settings-row { display: flex; align-items: center; gap: 10px; padding: 6px 0; border-top: 1px solid ${C.paperLine}; }
        .settings-row:first-of-type { border-top: none; }
        .settings-row label { flex: 1; font-size: 12.5px; color: ${C.ink}; }
        .settings-row .unit { font-size: 11px; color: ${C.ink}; font-family: ${F_DATA}; }
        .status-label { display: flex; align-items: center; gap: 6px; font-family: ${F_DATA}; }
        .reset-all-btn { color: ${C.critical}; border-color: ${C.critical}; margin-top: 4px; }
        .reset-all-btn.armed { background: ${C.criticalDim}; }
        .warn-line { font-size: 11.5px; color: ${C.high}; margin-top: 4px; }

        /* ---- Responsive: tablet ---- */
        @media (max-width: 900px) {
          .masthead { padding: 26px 18px 0; }
          .masthead h1 { font-size: 28px; }
          .masthead .sub { font-size: 13.5px; }
          .tabbar { padding: 0 18px; -webkit-overflow-scrolling: touch; }
          .content-wrap { padding: 18px 18px 48px; }
          .app-footer { padding: 16px 18px 28px; }
          .hero-stat-value { font-size: 34px; }
          .kpi-hero-row { gap: 20px; }
          .ledger-toolbar { align-items: stretch; }
          .toolbar-actions { flex-wrap: wrap; }
        }

        /* ---- Responsive: phone ---- */
        @media (max-width: 640px) {
          .masthead { padding: 20px 14px 0; }
          .masthead .title-row { gap: 10px; }
          .masthead .brand-logo { height: 26px; }
          .masthead h1 { font-size: 23px; line-height: 1.2; }
          .masthead .sub { font-size: 13px; }
          .meta-row { gap: 10px 14px; font-size: 10.5px; }
          .tabbar { padding: 0 14px; gap: 4px; scrollbar-width: none; }
          .tabbar::-webkit-scrollbar { display: none; }
          .tab-btn { padding: 9px 12px; font-size: 12px; }
          .content-wrap { padding: 16px 14px 40px; }
          .app-footer { padding: 14px 14px 24px; flex-direction: column; align-items: flex-start; gap: 8px; }
          .footer-linkedin { margin-left: 0; }
          .panel { padding: 14px 14px; }
          .panel h3 { font-size: 15.5px; }
          .hero-stat-value { font-size: 30px; }
          .kpi-hero-row { gap: 16px; }
          .stat-strip { align-self: flex-start; }
          .ledger-toolbar { flex-direction: column; align-items: stretch; gap: 10px; }
          .search-box { min-width: 0; width: 100%; }
          .chip-row { overflow-x: auto; flex-wrap: nowrap; padding-bottom: 2px; scrollbar-width: none; }
          .chip-row::-webkit-scrollbar { display: none; }
          .toolbar-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
          .toolbar-actions > * { width: 100%; }
          .toolbar-actions .btn-outline, .toolbar-actions .btn-primary { width: 100%; justify-content: center; }
          .columns-menu { position: relative; }
          .columns-panel { right: auto; left: 0; min-width: 200px; }
          .ledger-table { min-width: 760px; font-size: 12px; }
          .sticky-col-2 { min-width: 130px; }
          .cell-name { min-width: 110px; }
          .ref-table { font-size: 12px; }
          .undo-toast { left: 12px; right: 12px; bottom: 12px; }
        }
`;
