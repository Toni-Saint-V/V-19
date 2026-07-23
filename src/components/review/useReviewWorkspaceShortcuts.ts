// src/components/review/useReviewWorkspaceShortcuts.ts
import { useEffect } from "react";

import type { PassportReviewMediaType } from "../../modules/submissions/passportReviewContract";

type ReviewWorkspaceShortcutInput = {
  disabled?: boolean;
  mediaTypes: readonly PassportReviewMediaType[];
  onMedia: (mediaType: PassportReviewMediaType) => void;
  onToggleQuestionnaire?: () => void;
};

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.matches("input, textarea, select, [role='textbox']")
  );
}

export function useReviewWorkspaceShortcuts({
  disabled = false,
  mediaTypes,
  onMedia,
  onToggleQuestionnaire,
}: ReviewWorkspaceShortcutInput) {
  useEffect(() => {
    if (disabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isEditableTarget(event.target)) return;

      const normalizedKey = event.key.toLocaleLowerCase("ru-RU");
      if (
        onToggleQuestionnaire &&
        (event.code === "KeyQ" || normalizedKey === "q" || normalizedKey === "й")
      ) {
        event.preventDefault();
        onToggleQuestionnaire();
        return;
      }

      const digitFromCode = /^Digit([1-9])$/.exec(event.code)?.[1];
      const mediaIndex = Number(digitFromCode ?? event.key) - 1;
      const mediaType = Number.isInteger(mediaIndex) ? mediaTypes[mediaIndex] : undefined;
      if (!mediaType) return;

      event.preventDefault();
      onMedia(mediaType);
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [disabled, mediaTypes, onMedia, onToggleQuestionnaire]);
}
