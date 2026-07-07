# VisaFlow integration layer

The active application entry point now runs the canonical V-19 cockpit from `src/App.tsx` and `src/main.tsx`.

## Active flow

The production flow is wired through `src/modules/submissions` and includes:

- agent document collection and questionnaire progress;
- canonical file slots: `passport_scan`, `selfie`, `selfie_2`;
- admin review, precise issues, correction handoff, and acceptance;
- Supabase cockpit persistence and private `submission-media` storage;
- export package generation and exported terminal state.

## Bridge/prototype files

`visaflowBusinessBridge.tsx` and `createVisaflowRuntimeBridge.ts` are kept as a compatibility/prototype bridge for standalone UI experiments. They are not the primary source of truth for the V-19 cockpit.

The text references below mirror the current active entry files so the canonical flow is not accidentally replaced by the old mock shell:

- `legacy-current-App.tsx.txt`
- `legacy-current-main.tsx.txt`
