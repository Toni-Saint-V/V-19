# P0 agent action routing evidence

Fresh local-demo browser proof for the returned-file action:

- one real CTA click opens the applicant's exact `Файлы` section;
- the matching file slot is focused and visibly marked `Нужна замена`;
- no generic submission Drawer is present;
- a blocked `Отправить исправления` click shows the next exact blocker and moves focus to it;
- desktop and mobile screenshots are captured by the Playwright test.

Fixture data is local synthetic data. The local-demo harness has no file storage,
so this proof covers routing and the exact correction target without performing an
upload. No Supabase or production mutation is performed.
