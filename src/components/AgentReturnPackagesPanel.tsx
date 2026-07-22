import { useEffect, useRef, useState } from "react";
import { Download, FileText, Inbox, LoaderCircle, RefreshCw } from "lucide-react";
import {
  createAgentReturnPackageDownloadUrl,
  listPublishedAgentReturnPackages,
  type AgentReturnPackageArtifact,
  type AgentReturnPackageWithArtifacts,
} from "../modules/submissions/returnPackagePersistence";
import { agentInteractionProps } from "../modules/submissions/agentInteractionContract";

function artifactLabel(artifact: AgentReturnPackageArtifact) {
  if (artifact.artifactKind === "agent_list_pdf") return "PDF-список";
  return artifact.applicantName
    ? "Готовая анкета · " + artifact.applicantName
    : "Готовая анкета";
}

function triggerBrowserDownload(url: string, fileName: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
}

export function AgentReturnPackagesPanel({ enabled }: { enabled: boolean }) {
  const [packages, setPackages] = useState<AgentReturnPackageWithArtifacts[]>([]);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [loadState, setLoadState] = useState<
    "disabled" | "empty" | "error" | "loading" | "ready"
  >(enabled ? "loading" : "disabled");
  const [loadError, setLoadError] = useState("");
  const [busyArtifactId, setBusyArtifactId] = useState("");
  const [downloadError, setDownloadError] = useState("");
  const [downloadSuccess, setDownloadSuccess] = useState("");
  const downloadPromiseRef = useRef<Promise<void> | null>(null);
  const lifecycleGenerationRef = useRef(0);

  useEffect(() => {
    const generation = lifecycleGenerationRef.current + 1;
    lifecycleGenerationRef.current = generation;
    if (!enabled) {
      setPackages([]);
      setBusyArtifactId("");
      setDownloadError("");
      setDownloadSuccess("");
      setLoadError("");
      setLoadState("disabled");
      downloadPromiseRef.current = null;
      return () => {
        if (lifecycleGenerationRef.current === generation) {
          lifecycleGenerationRef.current += 1;
        }
      };
    }

    setLoadState("loading");
    setLoadError("");
    setDownloadError("");
    setDownloadSuccess("");
    void listPublishedAgentReturnPackages()
      .then((next) => {
        if (lifecycleGenerationRef.current !== generation) return;
        setPackages(next);
        setLoadState(next.length ? "ready" : "empty");
      })
      .catch((caught) => {
        if (lifecycleGenerationRef.current !== generation) return;
        setPackages([]);
        setLoadError(
          caught instanceof Error
            ? caught.message
            : "Не удалось загрузить возвращённые документы.",
        );
        setLoadState("error");
      });

    return () => {
      if (lifecycleGenerationRef.current === generation) {
        lifecycleGenerationRef.current += 1;
      }
    };
  }, [enabled, loadAttempt]);

  const download = (artifact: AgentReturnPackageArtifact) => {
    if (downloadPromiseRef.current) return downloadPromiseRef.current;
    const generation = lifecycleGenerationRef.current;
    const request = (async () => {
      setBusyArtifactId(artifact.id);
      setDownloadError("");
      setDownloadSuccess("");
      try {
        const url = await createAgentReturnPackageDownloadUrl(artifact);
        if (lifecycleGenerationRef.current !== generation) return;
        triggerBrowserDownload(url, artifact.fileName);
        setDownloadSuccess(`Скачивание файла «${artifact.fileName}» началось.`);
      } catch (caught) {
        if (lifecycleGenerationRef.current === generation) {
          setDownloadError(
            caught instanceof Error ? caught.message : "Не удалось скачать PDF.",
          );
        }
      } finally {
        if (lifecycleGenerationRef.current === generation) {
          setBusyArtifactId("");
        }
      }
    })();
    downloadPromiseRef.current = request;
    void request.finally(() => {
      if (downloadPromiseRef.current === request) {
        downloadPromiseRef.current = null;
      }
    });
    return request;
  };

  if (!enabled || loadState === "disabled") return null;

  return (
    <section
      className="mb-5 overflow-hidden rounded-2xl border border-[#242529] bg-[#161617]"
      data-testid="agent-return-packages-panel"
    >
      <header className="flex items-center gap-3 border-b border-[#242529] px-5 py-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#2f376f] bg-[#18205a] text-[#dfe4ff]">
          <Inbox className="h-4 w-4" />
        </span>
        <div>
          <h2 className="m-0 text-[16px] font-semibold text-white">Полученные документы</h2>
          <p className="m-0 mt-0.5 text-[12px] text-white/48">Списки и готовые анкеты, переданные администратором.</p>
        </div>
      </header>

      {loadState === "loading" ? (
        <div
          aria-live="polite"
          className="flex items-center gap-2 px-5 py-5 text-[12px] text-white/55"
          role="status"
        >
          <LoaderCircle className="h-4 w-4 animate-spin" />
          Загружаем полученные документы…
        </div>
      ) : null}

      {loadState === "empty" ? (
        <div className="px-5 py-5 text-[12px] text-white/55" data-testid="agent-return-packages-empty">
          Пока нет документов, переданных администратором.
        </div>
      ) : null}

      {loadState === "error" ? (
        <div className="border-t border-[#513036] bg-[#281c20] px-5 py-4">
          <p className="m-0 text-[12px] text-[#ffbdc3]" role="alert">
            {loadError}
          </p>
          <button
            {...agentInteractionProps("returned-documents.retry-load")}
            className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-[#654047] bg-[#342126] px-3 text-[11px] font-semibold text-white"
            data-testid="agent-return-packages-retry"
            onClick={() => setLoadAttempt((current) => current + 1)}
            type="button"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Повторить
          </button>
        </div>
      ) : null}

      {loadState === "ready" ? (
        <div className="divide-y divide-[#242529]">
          {packages.map((item) => (
            <article className="px-5 py-4" key={item.id}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <strong className="text-[14px] font-semibold text-white">{item.city}</strong>
                <span className="rounded-full border border-[#244238] bg-[#14251f] px-2 py-0.5 text-[11px] font-medium text-[#8fe7c1]">
                  {item.artifacts.filter((artifact) => artifact.artifactKind === "visa_application_pdf").length} анкет
                </span>
              </div>
              <div className="grid gap-2">
                {item.artifacts.map((artifact) => (
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-[#242529] bg-[#1e1e21] px-3 py-2.5" key={artifact.id}>
                    <span className="min-w-0 truncate text-[12px] text-white/70">
                      <FileText className="mr-2 inline h-3.5 w-3.5 text-[#b8baff]" />
                      {artifactLabel(artifact)}
                    </span>
                    <button
                      {...agentInteractionProps("returned-documents.download")}
                      aria-label={`Скачать ${artifactLabel(artifact)}`}
                      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[8px] border border-[#2e2f34] bg-[#27272b] px-2.5 text-[11px] font-semibold text-white/80 transition-colors hover:bg-[#303035]"
                      disabled={Boolean(busyArtifactId)}
                      type="button"
                      onClick={() => void download(artifact)}
                    >
                      {busyArtifactId === artifact.id ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                      Скачать
                    </button>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {downloadError ? (
        <p
          className="m-0 border-t border-[#513036] bg-[#281c20] px-5 py-3 text-[12px] text-[#ffbdc3]"
          role="alert"
        >
          {downloadError}
        </p>
      ) : null}

      {downloadSuccess ? (
        <p
          className="m-0 border-t border-[#244238] bg-[#14251f] px-5 py-3 text-[12px] text-[#8fe7c1]"
          role="status"
        >
          {downloadSuccess}
        </p>
      ) : null}
    </section>
  );
}
