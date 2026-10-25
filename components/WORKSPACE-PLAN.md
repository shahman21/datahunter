# Search workspace

Approved direction: centred brief composer, initially collapsed search history, and
individual run dashboards. Request and metrics remain fixed while only activity scrolls.
Use simulated runs for design review; make no backend requests or payments.

Implementation:
1. Add a browser-local run model and validated storage reader, with tests for corrupt
   storage, multiple runs, independent progress, and refresh recovery.
2. Reuse activity events in a new Console shell: collapsed sidebar, new-search landing,
   selected-run dashboard, compact expandable brief, metrics, scrollable activity.
3. Persist runs, progress simulations independently, preserve scroll when reading older
   activity, and offer Jump to latest. Preview examples cover success and failure.
4. Scope CSS to the console shell; retain the existing layout on other routes. Use warm
   neutral surfaces, restrained green accents, typographic hierarchy, and small line icons.
5. Verify storage tests, existing suites, production build, and Chrome: sidebar switching,
   independent runs, refresh, fixed brief/metrics, activity scrolling, zero API calls.

Scope: components/, app/console/, app/globals.css only. History is local to this browser;
background progress pauses when the page closes. Live execution is outside this UI phase.

Current direction: dark neutral/slate surfaces and muted green controls, with semantic
blue/violet/teal metric cards. Decorative sci-fi effects and bright textbox focus rings
were removed. Radix Themes is a visual reference, not an installed dependency.
Trust assessments and a non-personal-only policy were added. Real backend enforcement
is pending owner authorization; see FRONTEND-HANDOFF.md and trust/BACKEND-HANDOFF.md.
