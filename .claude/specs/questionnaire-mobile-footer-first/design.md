# Design: Questionnaire mobile footer-first

## Architecture

- `FigmaQuestionnaireScreen` остаётся единственным владельцем active applicant,
  active section, navigation pending state и Save/Exit orchestration.
- Внутренний navigation helper выполняет `navigateQuestionnaire`, focus первого
  поля и scroll work panel; его используют previous/next arrows и
  `continueSectionFlow`.
- Footer использует уже вычисленные `sections`, `touristSelectOptions`,
  `activeApplicant` и существующие interaction IDs.

## Mobile composition

- `.v19-questionnaire-scroll` остаётся единственным vertical scroller.
- Header, progress и applicant bar скрыты до `767px`.
- Sticky section list остаётся первым видимым navigation surface.
- Existing work toolbar сразу под sections владеет blocker, remark и family-copy.
- Footer — последний flex child fullscreen shell: `44px / 1fr / 1fr / 44px`,
  safe-area padding, без `position: fixed`.
- Portal списка заявителей получает scoped layer выше fullscreen shell, чтобы
  options оставались видимыми и кликабельными над footer.
- End-of-scroll CTA остаётся внутри work panel и не перекрывается footer.

## Compatibility

- Desktop CSS вне mobile media query не меняется.
- Section arrows не переходят между applicants; cross-applicant flow остаётся
  только у contextual CTA.
- Read-only footer использует существующий Back/Exit contract вместо save.
- Save failure banner и explicit retry/exit actions остаются текущими.
- Новый код не изменяет autosave revisions, family-copy preview или issue
  matching.
