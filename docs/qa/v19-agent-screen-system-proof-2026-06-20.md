# V-19 Agent Screen System Proof - 2026-06-20

## Scope

Verified the V-19 agent screen contract for:

- `Входящие`
- `Мои действия`
- `Мои подачи`

Reference screenshots:

- `docs/qa/v19-agent-inbox-reference-2026-06-20.png`
- `docs/qa/v19-agent-actions-reference-2026-06-20.png`
- `docs/qa/v19-agent-submissions-reference-2026-06-20.png`

After screenshots:

- `docs/qa/v19-agent-inbox-after-2026-06-20.png`
- `docs/qa/v19-agent-actions-after-2026-06-20.png`
- `docs/qa/v19-agent-submissions-after-2026-06-20.png`

Machine-readable proof:

- `docs/qa/v19-agent-screen-system-proof-2026-06-20.json`

## Verification

Commands:

- `npm run typecheck`
- `npm run lint`
- `npm run build`

Browser proof:

- URL: `http://127.0.0.1:5173/`
- viewport: `1440x900`
- local agent email: `agent@visaflow.local`
- console errors: `0`
- page errors: `0`

Scroll contract:

| Screen | Document Y Scroll | Document X Scroll | Rows |
| --- | --- | --- | ---: |
| `Входящие` | no | no | 4 |
| `Мои действия` | no | no | 7 |
| `Мои подачи` | no | no | 1 |

## Notes

- The document and shell are fixed to the viewport for agent screens.
- The central list container uses internal overflow and only scrolls when content exceeds its available height.
- Drawer internals, admin screens, export screens, and business logic were not changed.
