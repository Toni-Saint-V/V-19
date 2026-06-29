# Create Submission Source And Deviation Log

## Source Runtime

- ZIP source: `/Users/user/Premium Dark-First UI Concept.zip`
- Runtime: `http://127.0.0.1:5181/`
- Screenshot: `reference-zip-runtime-1440x960.png`
- Console: no warnings/errors during capture

## Source Mismatch

The ZIP runtime screen available for this flow is `Сборка документов`, with a large upload area and processing queue. It does not contain the required `Новая подача` title, `Испания · Семья · 2 заявителя · Черновик` meta, or the mandatory `Заявитель / Семья` panel.

Implementation therefore uses the ZIP dark visual language and motion tone, while following the user's explicit current reference contract for the Create Submission state and layout.

## Runtime Proof

- Desktop applicant mode: `runtime-desktop-applicant-1440x960.png`
- Desktop family mode: `runtime-desktop-family-1440x960.png`
- Mobile family mode: `runtime-mobile-390x860.png`
- Tablet applicant mode: `runtime-tablet-768x920.png`
- Playwright proof: `playwright-create-submission-proof.json`

## Known Deviations

- Mobile family mode compacts the upload copy after selecting `Семья` so the family answers remain visible above the sticky footer. The upload section, CTA, and status remain present.
- The upload interaction proof uses Playwright actionability on the upload CTA without selecting a file. This avoids fake upload/OCR success.
