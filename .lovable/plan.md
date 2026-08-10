# Supplier Risk Scorecard — ship it live

## What you get
The uploaded Supplier Risk Scorecard app becomes the home page of this project, with a credit line at the bottom, then the site is published to a live Lovable URL.

## Steps

1. **Bring the app in**
   - Port the uploaded `supplier-risk-scorecard.jsx` (1,687 lines) into the project as the home page at `/`, replacing the blank placeholder.
   - Install the one missing package it needs (`papaparse`, used for CSV import/export). Everything else it uses (React, lucide icons) is already here.
   - Load Open Sans and JetBrains Mono web fonts so the ledger styling renders as designed.

2. **Footer credit**
   - Add a footer at the very end of the page: "Made by Shubham Gambhire" on the left, and a LinkedIn link (icon + "LinkedIn") aligned to the right, pointing to https://www.linkedin.com/in/shubhambg (opens in a new tab).
   - Styled to match the existing parchment/navy look of the scorecard.

3. **Page metadata**
   - Title and description for the scorecard page so link previews and search results read properly.

4. **Publish**
   - Run a security scan, then publish. You get a live `.lovable.app` URL (renameable, and a custom domain can be attached later from Project settings).

## Technical notes
- The uploaded file is a single default-export React component; it will live in `src/components/` (split lightly if needed) and be rendered from `src/routes/index.tsx`.
- All state is in-memory/localStorage as written — no backend or database is added.
- The LinkedIn mention is treated as a plain profile link in the footer, not a LinkedIn API connector. Say the word if you actually want LinkedIn data or sign-in wired in.
