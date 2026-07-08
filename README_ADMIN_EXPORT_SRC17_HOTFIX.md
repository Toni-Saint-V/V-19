# V-19 src17 admin existing request export hotfix

Overlay patch for the current UI. It does not replace screens or visual layout.

Changed files:
- `src/components/AdminWorkspace.tsx`
- `src/components/AdminExportScreen.tsx`
- `src/modules/submissions/exportMediaZip.ts`

Main flow:
1. Admin opens an existing request from Review.
2. Admin accepts it.
3. The same request is focused in Export.
4. Excel can be prepared/downloaded.
5. ZIP with Excel can be downloaded, with local-demo fallback when Supabase storage is inactive.
