import { type SyntheticEvent, useState } from "react";
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
  onRetry?: () => void;
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

function LoadingPreviewState() {
  return (
    <div className="v19-review-preview-state is-loading">
      <span aria-hidden="true" className="v19-review-preview-skeleton" />
      <span className="v19-review-preview-loading-copy">
        <ShieldCheck aria-hidden="true" />
        <strong>Загружаем оригинал</strong>
      </span>
    </div>
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
  onRetry,
}: ReviewMediaPreviewProps) {
  const previewUrl = preview.status === "ready" ? preview.url : undefined;
  const [loadedMediaUrl, setLoadedMediaUrl] = useState<string | null>(null);
  const pdfFile = isPdfFile(file);
  const externalViewer = needsExternalViewer(file);
  const embeddedMedia = Boolean(previewUrl && !externalViewer && !pdfFile);
  const mediaReady = Boolean(previewUrl && loadedMediaUrl === previewUrl);
  const mediaPending = preview.status === "loading" || (embeddedMedia && !mediaReady);

  const handleImageLoad = async (event: SyntheticEvent<HTMLImageElement>) => {
    const image = event.currentTarget;
    const loadedUrl = previewUrl;
    if (!loadedUrl) return;

    if (typeof image.decode === "function") {
      try {
        await image.decode();
      } catch {
        // A completed load can still be rendered when optional decoding rejects.
      }
    }

    if (image.getAttribute("src") !== loadedUrl) return;
    setLoadedMediaUrl(loadedUrl);
  };

  return (
    <figure className={`v19-review-preview is-${variant}`}>
      {variant === "single" ? null : (
        <figcaption>
          <strong>{label}</strong>
          <span>{fileName(file)}</span>
        </figcaption>
      )}

      <span aria-atomic="true" className="sr-only" role="status">
        {mediaPending ? `Загружаем оригинал: ${label}` : ""}
      </span>

      <div aria-busy={mediaPending} className="v19-review-preview-canvas">
        {preview.status === "loading" ? (
          <LoadingPreviewState />
        ) : previewUrl ? (
          pdfFile ? (
            <object
              aria-label={alt}
              className="is-ready"
              data={previewUrl}
              type="application/pdf"
            >
              <a href={previewUrl} rel="noreferrer" target="_blank">
                Открыть оригинал
              </a>
            </object>
          ) : externalViewer ? (
            <div className="v19-review-preview-state">
              <ShieldCheck aria-hidden="true" />
              <strong>Оригинал готов</strong>
              <a href={previewUrl} rel="noreferrer" target="_blank">
                Открыть
              </a>
            </div>
          ) : (
            <>
              <img
                alt={alt}
                className={mediaReady ? "is-ready" : "is-loading"}
                data-testid={testId}
                decoding="async"
                draggable={false}
                key={previewUrl}
                onError={onError}
                onLoad={(event) => void handleImageLoad(event)}
                src={previewUrl}
                style={transform ? { transform } : undefined}
              />
              {mediaReady ? null : <LoadingPreviewState />}
            </>
          )
        ) : (
          <div
            className="v19-review-preview-state is-unavailable"
            role={file ? "alert" : "status"}
          >
            <AlertCircle aria-hidden="true" />
            <strong>
              {file ? "Защищённый оригинал недоступен" : "Файл не загружен"}
            </strong>
            {file && onRetry ? (
              <button onClick={onRetry} type="button">
                Повторить загрузку
              </button>
            ) : null}
          </div>
        )}
      </div>
    </figure>
  );
}
