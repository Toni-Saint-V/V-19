import { AlertCircle, ShieldCheck } from "lucide-react";

import type { SubmissionFile } from "../modules/submissions/types";

export type ReviewMediaPreviewState = {
  status: "loading" | "ready" | "unavailable";
  url?: string;
};

type ReviewMediaPreviewProps = {
  alt: string;
  file?: SubmissionFile;
  label: string;
  preview: ReviewMediaPreviewState;
  testId: string;
  transform?: string;
  variant: "active" | "reference" | "single";
  onError: () => void;
};

function fileName(file?: SubmissionFile) {
  return file?.originalFileName ?? file?.generatedFileName ?? "Файл не загружен";
}

function isPdfFile(file?: SubmissionFile) {
  const name = fileName(file).toLocaleLowerCase();
  return file?.mimeType === "application/pdf" || name.endsWith(".pdf");
}

function needsExternalViewer(file?: SubmissionFile) {
  const name = fileName(file).toLocaleLowerCase();
  return (
    file?.mimeType === "image/heic" ||
    file?.mimeType === "image/heif" ||
    name.endsWith(".heic") ||
    name.endsWith(".heif")
  );
}

export function ReviewMediaPreview({
  alt,
  file,
  label,
  preview,
  testId,
  transform,
  variant,
  onError,
}: ReviewMediaPreviewProps) {
  const previewUrl = preview.status === "ready" ? preview.url : undefined;

  return (
    <figure className={`v19-review-preview is-${variant}`}>
      {variant === "single" ? null : (
        <figcaption>
          <strong>{label}</strong>
          <span>{fileName(file)}</span>
        </figcaption>
      )}

      <div className="v19-review-preview-canvas">
        {preview.status === "loading" ? (
          <div className="v19-review-preview-state is-loading" role="status">
            <ShieldCheck aria-hidden="true" />
            <strong>Загружаем оригинал</strong>
          </div>
        ) : previewUrl ? (
          isPdfFile(file) ? (
            <object aria-label={alt} data={previewUrl} type="application/pdf">
              <a href={previewUrl} rel="noreferrer" target="_blank">
                Открыть оригинал
              </a>
            </object>
          ) : needsExternalViewer(file) ? (
            <div className="v19-review-preview-state">
              <ShieldCheck aria-hidden="true" />
              <strong>Оригинал готов</strong>
              <a href={previewUrl} rel="noreferrer" target="_blank">
                Открыть
              </a>
            </div>
          ) : (
            <img
              alt={alt}
              data-testid={testId}
              draggable={false}
              onError={onError}
              src={previewUrl}
              style={transform ? { transform } : undefined}
            />
          )
        ) : (
          <div className="v19-review-preview-state is-unavailable">
            <AlertCircle aria-hidden="true" />
            <strong>
              {file ? "Защищённый оригинал недоступен" : "Файл не загружен"}
            </strong>
          </div>
        )}
      </div>
    </figure>
  );
}
