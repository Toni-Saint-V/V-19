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
  generationKey?: string;
  label: string;
  preview: ReviewMediaPreviewState;
  testId: string;
  transform?: string;
  variant: "active" | "reference" | "single";
  onError: () => void;
  onReady?: () => void;
  onRetry?: () => void;
};

function fileName(file?: SubmissionFile) {
  return file?.originalFileName ?? file?.generatedFileName ?? "Файл не загружен";
}

function isPdfFile(file?: SubmissionFile) {
  const name = fileName(file).toLocaleLowerCase();
  return file?.mimeType === "application/pdf" || name.endsWith(".pdf");
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
  generationKey,
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
  const renderGenerationKey =
    generationKey ??
    [file?.id ?? "missing", file?.storagePath ?? "no-path", previewUrl ?? "no-url"].join(
      ":",
    );
  const latestGenerationRef = useRef(renderGenerationKey);
  const onErrorRef = useRef(onError);
  const onReadyRef = useRef(onReady);
  latestGenerationRef.current = renderGenerationKey;
  onErrorRef.current = onError;
  onReadyRef.current = onReady;
  const [loadedMediaGeneration, setLoadedMediaGeneration] = useState<string | null>(
    null,
  );
  const pdfObjectRef = useRef<HTMLObjectElement | null>(null);
  const pdfFile = isPdfFile(file);
  const embeddedMedia = Boolean(previewUrl);
  const mediaReady = Boolean(
    previewUrl && loadedMediaGeneration === renderGenerationKey,
  );
  const mediaPending =
    preview.status === "idle" ||
    preview.status === "loading" ||
    (embeddedMedia && !mediaReady);
  const unavailable = unavailableCopy(file, preview);

  useEffect(() => {
    const object = pdfObjectRef.current;
    if (!object || !pdfFile) return;
    const handleObjectError = () => {
      if (
        !object.isConnected ||
        latestGenerationRef.current !== renderGenerationKey
      ) {
        return;
      }
      setLoadedMediaGeneration(null);
      onErrorRef.current();
    };
    object.addEventListener("error", handleObjectError);
    return () => object.removeEventListener("error", handleObjectError);
  }, [pdfFile, renderGenerationKey]);

  const handleImageLoad = async (event: SyntheticEvent<HTMLImageElement>) => {
    const image = event.currentTarget;
    const loadedUrl = previewUrl;
    const loadedGeneration = renderGenerationKey;
    if (!loadedUrl) return;

    if (typeof image.decode === "function") {
      try {
        await image.decode();
      } catch {
        if (
          image.isConnected &&
          latestGenerationRef.current === loadedGeneration
        ) {
          setLoadedMediaGeneration(null);
          onErrorRef.current();
        }
        return;
      }
    }

    if (
      !image.isConnected ||
      latestGenerationRef.current !== loadedGeneration ||
      image.getAttribute("src") !== loadedUrl
    ) {
      return;
    }
    setLoadedMediaGeneration(loadedGeneration);
    onReadyRef.current?.();
  };

  const handlePdfLoad = () => {
    const object = pdfObjectRef.current;
    if (
      !previewUrl ||
      !object?.isConnected ||
      latestGenerationRef.current !== renderGenerationKey
    ) {
      return;
    }
    setLoadedMediaGeneration(renderGenerationKey);
    onReadyRef.current?.();
  };

  const handleMediaError = (event: SyntheticEvent<HTMLImageElement>) => {
    if (
      !event.currentTarget.isConnected ||
      latestGenerationRef.current !== renderGenerationKey
    ) {
      return;
    }
    setLoadedMediaGeneration(null);
    onErrorRef.current();
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
        {preview.status === "idle" || preview.status === "loading" ? (
          <LoadingPreviewState />
        ) : previewUrl ? (
          pdfFile ? (
            <>
              <object
                aria-label={alt}
                className={mediaReady ? "is-ready" : "is-loading"}
                data={previewUrl}
                key={renderGenerationKey}
                onLoad={handlePdfLoad}
                ref={pdfObjectRef}
                type="application/pdf"
              >
                <a href={previewUrl} rel="noreferrer" target="_blank">
                  Открыть оригинал
                </a>
              </object>
              {mediaReady ? null : <LoadingPreviewState />}
            </>
          ) : (
            <>
              <img
                alt={alt}
                className={mediaReady ? "is-ready" : "is-loading"}
                data-testid={testId}
                decoding="async"
                draggable={false}
                key={renderGenerationKey}
                onError={handleMediaError}
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
