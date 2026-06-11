# VisaFlow AI Business Logic Smoke Checklist

Date: 2026-06-11

## Required gates

- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm run verify:safety`

## Browser smoke

1. Start `npm run dev`.
2. Login as Agent.
3. Create a Tourist submission.
4. Verify it creates exactly one applicant and appears in Agent applications.
5. Leave passport/media incomplete and open preflight.
6. Confirm submit is blocked with specific applicant, field, media, and filename reasons.
7. Fill required applicant and trip fields.
8. Add passport number and upload photo, selfie, and video slots.
9. Verify generated filenames are visible.
10. Submit to Operations.
11. Verify Agent sees the submission in review status.
12. Switch to Operations.
13. Verify the submission appears in Queue with agent, type, country, city, and status.
14. Start review and confirm history records the change.
15. Return a field or media correction with a required reason.
16. Switch to Agent.
17. Verify the returned issue is visible and exact.
18. Fix the data/media and mark the correction fixed.
19. Resubmit and verify the submission returns to Operations queue.
20. Switch to Operations.
21. Accept all required media explicitly.
22. Accept the clean submission.
23. Mark ready for Excel.
24. Open Export and verify preview includes only eligible applicants.
25. Download CSV.
26. Download XLSX.
27. Confirm the seeded sample export still has 4 applicant rows.
28. Confirm Orlov family rows stay adjacent and share group id/color.
29. Mark exported.
30. Open Appointment.
31. Manually set sent, scheduled, attention, and completed statuses.
32. Verify dashboard/sidebar/list counters update from the same data.
33. At 360px width, confirm document overflow is 0.
34. Confirm tables scroll internally.
35. Confirm browser console has 0 errors.

## Family smoke addendum

1. Create a Family submission without initial applicants.
2. Verify submit is blocked until at least one applicant exists.
3. Add two family members gradually.
4. Fill required fields and upload three media slots per member.
5. Confirm family roles/grouping manually.
6. Submit to Operations, start review, and accept all media.
7. Accept the submission and mark ready for Excel.
8. Verify export rows for the family are adjacent and share `familyGroupId`.
9. Mark exported and manually update appointment status.
10. Verify sidebar counts move from export to appointment.
