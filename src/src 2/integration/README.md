# VisaFlow UI integration layer

This folder keeps the new top-product UI decoupled from the existing V-19 business logic.

## Main entry point

`visaflowBusinessBridge.tsx` exposes a small bridge contract. The UI calls bridge handlers for important user intents:

- workspace switch: agent/admin;
- agent navigation;
- admin navigation;
- submission open;
- questionnaire open;
- package creation/upload screen;
- admin document review;
- remark open/submit;
- export start.

## How to connect real logic

Open `src/main.tsx` and pass a bridge to `<App />`:

```tsx
<App
  bridge={{
    onSubmissionOpen: (submissionId) => {
      // Load submission from src/modules/submissions or Supabase service.
      console.log('open submission', submissionId);
    },
    onExportPackages: async (submissionIds) => {
      // Call exportWorkflow/exportService here.
      console.log('export', submissionIds);
    },
  }}
/>
```

The previous V-19 source files are preserved in their original paths (`src/modules`, `src/services`, `src/lib`, `src/types`, etc.) so they can be connected without restoring the old UI.

The previous `App.tsx` and `main.tsx` are saved as text-only references:

- `legacy-current-App.tsx.txt`
- `legacy-current-main.tsx.txt`
