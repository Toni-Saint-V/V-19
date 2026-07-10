import { useEffect, useState } from "react";
import { Download, FileText, Inbox, LoaderCircle } from "lucide-react";
import {
  createAgentReturnPackageDownloadUrl,
  listPublishedAgentReturnPackages,
  type AgentReturnPackageArtifact,
  type AgentReturnPackageWithArtifacts,
} from "../modules/submissions/returnPackagePersistence";

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
  const [loading, setLoading] = useState(enabled);
  const [busyArtifactId, setBusyArtifactId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    if (!enabled) {
      setPackages([]);
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setLoading(true);
    setError("");
    void listPublishedAgentReturnPackages()
      .then((next) => {
        if (!cancelled) setPackages(next);
      })
      .catch((caught) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Не удалось загрузить возвращённые документы.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const download = async (artifact: AgentReturnPackageArtifact) => {
    setBusyArtifactId(artifact.id);
    setError("");
    try {
      triggerBrowserDownload(
        await createAgentReturnPackageDownloadUrl(artifact),
        artifact.fileName,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось скачать PDF.");
    } finally {
      setBusyArtifactId("");
    }
  };

  if (!enabled) return null;

  return (
    <section className="mb-5 overflow-hidden rounded-2xl border border-[#242529] bg-[#161617]" data-testid="agent-return-packages-panel">
      <header className="flex items-center gap-3 border-b border-[#242529] px-5 py-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#2f376f] bg-[#18205a] text-[#dfe4ff]">
          <Inbox className="h-4 w-4" />
        </span>
        <div>
          <h2 className="m-0 text-[16px] font-semibold text-white">Полученные документы</h2>
          <p className="m-0 mt-0.5 text-[12px] text-white/48">Списки и готовые анкеты, переданные администратором.</p>
        </div>
      </header>

      {loading ? (
        <div className="flex items-center gap-2 px-5 py-6 text-[13px] text-white/54">
          <LoaderCircle className="h-4 w-4 animate-spin" /> Загрузка документов...
        </div>
      ) : packages.length ? (
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
                      aria-label={`Скачать ${artifactLabel(artifact)}`}
                      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[8px] border border-[#2e2f34] bg-[#27272b] px-2.5 text-[11px] font-semibold text-white/80 transition-colors hover:bg-[#303035]"
                      disabled={busyArtifactId === artifact.id}
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
      ) : (
        <p className="m-0 px-5 py-6 text-[13px] text-white/48">Администратор пока не передал готовые документы.</p>
      )}

      {error ? <p className="m-0 border-t border-[#513036] bg-[#281c20] px-5 py-3 text-[12px] text-[#ffbdc3]">{error}</p> : null}
    </section>
  );
}
