<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules

- Scoring, validation, CSV, storage and history logic live as pure modules in `src/lib/srm/` with Vitest tests (`npm test`); UI in `src/components/srm/` only calls them, so rules stay testable.
- Scores are higher = safer; the priority adjustment divides by non-increasing multipliers so more critical tiers can never score safer.
- Persisted state is versioned (`STORAGE_VERSION`) and normalized on load; corrupt saves are never overwritten without an explicit user choice.
