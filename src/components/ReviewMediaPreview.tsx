import { type SyntheticEvent, useEffect, useRef, useState } from "react";
import { AlertCircle, ShieldCheck } from "lucide-react";

import type { SubmissionFile } from "../modules/submissions/types";

export type ReviewMediaPreviewState = {
  reason?: "expired_or_error" | "missing" | "rejected";
  retryable?: boolean;
  status: "idle" | "loading" | "ready" | "unavailable";
  url?: string;
};

type ReviewMediaPreviewProps = {
  alt: string;
  file?: SubmissionFile;
  focus?: "identity";
  label: string;
  preview: ReviewMediaPreviewState;
  testId: string;
  transform?: string;
  variant: "active" | "reference" | "single";
  onError: () => void;
  onReady?: (url: string) => void;
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

function unavailableCopy(
  file: SubmissionFile | undefined,
  preview: ReviewMediaPreviewState,
) {
  if (!file || preview.reason === "missing") {
    return {
      detail: "Агент должен загрузить обязательный файл.",
      title: "Файл не загружен",
    };
  }
  if (preview.reason === "rejected") {
    return {
      detail: "Файл отклонён или требует замены. Новый оригинал загружает агент.",
      title: "Оригинал нельзя принять",
    };
  }
  return {
    detail: "Ссылка истекла или сервис временно недоступен. Повторите загрузку.",
    title: "Защищённый оригинал недоступен",
  };
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
  focus,
  label,
  preview,
  testId,
  transform,
  variant,
  onError,
  onReady,
  onRetry,
}: ReviewMediaPreviewProps) {
  const previewUrl = preview.status === "ready" ? preview.url : undefined;
  const [loadedMediaUrl, setLoadedMediaUrl] = useState<string | null>(null);
  const [externalViewerOpenedUrl, setExternalViewerOpenedUrl] = useState<string | null>(
    null,
  );
  const pdfObjectRef = useRef<HTMLObjectElement | null>(null);
  const pdfFile = isPdfFile(file);
  const externalViewer = needsExternalViewer(file);
  const mediaReady = Boolean(previewUrl && loadedMediaUrl === previewUrl);
  const mediaPending =
    preview.status === "idle" ||
    preview.status === "loading" ||
    Boolean(previewUrl && !mediaReady);
  const unavailable = unavailableCopy(file, preview);
  const mediaTransform = transform;

  useEffect(() => {
    const object = pdfObjectRef.current;
    if (!object || !pdfFile) return;
    object.addEventListener("error", onError);
    return () => object.removeEventListener("error", onError);
  }, [onError, pdfFile, previewUrl]);

  const handleMediaReady = (loadedUrl: string | undefined) => {
    if (!loadedUrl || loadedUrl !== previewUrl) return;
    setLoadedMediaUrl(loadedUrl);
    onReady?.(loadedUrl);
  };

  const handleImageLoad = async (event: SyntheticEvent<HTMLImageElement>) => {
    const image = event.currentTarget;
    const loadedUrl = previewUrl;
    if (!loadedUrl) return;

    if (typeof image.decode === "function") {
      try {
        await image.decode();
      } catch {
        if (image.getAttribute("src") === loadedUrl) onError();
        return;
      }
    }

    if (image.getAttribute("src") !== loadedUrl) return;
    handleMediaReady(loadedUrl);
  };

  return (
    <figure
      className={`v19-review-preview is-${variant}${focus ? ` is-focus-${focus}` : ""}`}
    >
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
        {preview.status === "idle" || preview.status === "loading" ? (
          <LoadingPreviewState />
        ) : previewUrl ? (
          pdfFile ? (
            <object
              aria-label={alt}
              className={mediaReady ? "is-ready" : "is-loading"}
              data={previewUrl}
              onLoad={() => handleMediaReady(previewUrl)}
              ref={pdfObjectRef}
              type="application/pdf"
            >
              <a
                href={previewUrl}
                onClick={() => setExternalViewerOpenedUrl(previewUrl)}
                rel="noreferrer"
                target="_blank"
              >
                Открыть оригинал
              </a>
              {!mediaReady && externalViewerOpenedUrl === previewUrl ? (
                <button onClick={() => handleMediaReady(previewUrl)} type="button">
                  Подтвердить, что оригинал открылся
                </button>
              ) : null}
            </object>
          ) : externalViewer ? (
            <div
              className={`v19-review-preview-state ${
                mediaReady ? "is-ready" : "is-loading"
              }`}
            >
              <ShieldCheck aria-hidden="true" />
              <strong>
                {mediaReady
                  ? "Оригинал проверен"
                  : externalViewerOpenedUrl === previewUrl
                    ? "Подтвердите просмотр оригинала"
                    : "Откройте оригинал"}
              </strong>
              <a
                href={previewUrl}
                onClick={() => setExternalViewerOpenedUrl(previewUrl)}
                rel="noreferrer"
                target="_blank"
              >
                Открыть
              </a>
              {!mediaReady && externalViewerOpenedUrl === previewUrl ? (
                <button onClick={() => handleMediaReady(previewUrl)} type="button">
                  Подтвердить, что оригинал открылся
                </button>
              ) : null}
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
                style={mediaTransform ? { transform: mediaTransform } : undefined}
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
            <strong>{unavailable.title}</strong>
            <span>{unavailable.detail}</span>
            {file && onRetry && preview.retryable !== false ? (
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
