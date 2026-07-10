import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  FileText,
  LoaderCircle,
  Send,
  UploadCloud,
  Users,
} from "lucide-react";
import {
  adminReturnPackageGroupKey,
  listAdminReturnPackageGroups,
  listReturnPackageArtifacts,
  publishAgentReturnPackage,
  startAgentReturnPackage,
  uploadAgentReturnPackageArtifact,
  type AdminReturnPackageGroup,
  type AgentReturnPackageArtifact,
} from "../modules/submissions/returnPackagePersistence";

type StartedPackage = {
  id: string;
  status: "draft" | "published";
};

function groupKey(group: AdminReturnPackageGroup) {
  return adminReturnPackageGroupKey(group);
}

function artifactsBySlot(artifacts: AgentReturnPackageArtifact[]) {
  return new Map(
    artifacts.map((artifact) => [
      `${artifact.artifactKind}:${artifact.applicantId ?? "common"}`,
      artifact,
    ]),
  );
}

export function AdminReturnPackagesScreen() {
  const [groups, setGroups] = useState<AdminReturnPackageGroup[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [groupsError, setGroupsError] = useState("");
  const [activeGroupKey, setActiveGroupKey] = useState("");
  const [startedPackages, setStartedPackages] = useState<
    Record<string, StartedPackage>
  >({});
  const [artifactsByGroup, setArtifactsByGroup] = useState<
    Record<string, AgentReturnPackageArtifact[]>
  >({});
  const [busySlot, setBusySlot] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setGroupsLoading(true);
    setGroupsError("");
    void listAdminReturnPackageGroups()
      .then((next) => {
        if (!cancelled) setGroups(next);
      })
      .catch((caught) => {
        if (!cancelled) {
          setGroupsError(
            caught instanceof Error
              ? caught.message
              : "Не удалось загрузить выгруженные пакеты.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setGroupsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const availableKeys = new Set(groups.map(groupKey));
    setActiveGroupKey((current) =>
      groups.some((group) => groupKey(group) === current)
        ? current
        : groups[0]
          ? groupKey(groups[0])
          : "",
    );
    setStartedPackages((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([key]) => availableKeys.has(key)),
      ),
    );
    setArtifactsByGroup((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([key]) => availableKeys.has(key)),
      ),
    );
    setNotice("");
    setError("");
  }, [groups]);

  const activeGroup = groups.find((group) => groupKey(group) === activeGroupKey);
  const startedPackage = activeGroupKey
    ? startedPackages[activeGroupKey] ?? null
    : null;
  const artifacts = useMemo(
    () => (activeGroupKey ? artifactsByGroup[activeGroupKey] ?? [] : []),
    [activeGroupKey, artifactsByGroup],
  );
  const artifactSlots = useMemo(() => artifactsBySlot(artifacts), [artifacts]);
  const hasList = artifactSlots.has("agent_list_pdf:common");
  const hasEveryForm =
    activeGroup?.applicants.every((applicant) =>
      artifactSlots.has(`visa_application_pdf:${applicant.applicantId}`),
    ) ?? false;
  const canPublish = Boolean(startedPackage) && hasList && hasEveryForm;

  const ensurePackage = async (
    targetGroupKey: string,
    targetGroup: AdminReturnPackageGroup,
  ): Promise<StartedPackage> => {
    const existing = startedPackages[targetGroupKey];
    if (existing) return existing;

    const started = await startAgentReturnPackage({
      agentId: targetGroup.agentId,
      exportPackageKey: targetGroup.exportPackageKey,
    });
    if (started.applicantCount !== targetGroup.applicants.length) {
      throw new Error(
        "Состав выгрузки изменился. Обновите страницу до загрузки PDF.",
      );
    }
    const next = { id: started.id, status: started.status } as StartedPackage;
    const nextArtifacts = await listReturnPackageArtifacts(next.id);
    setStartedPackages((current) => ({ ...current, [targetGroupKey]: next }));
    setArtifactsByGroup((current) => ({
      ...current,
      [targetGroupKey]: nextArtifacts,
    }));
    return next;
  };

  const upload = async (
    slot: string,
    file: File,
    input: {
      applicantId?: string;
      artifactKind: "agent_list_pdf" | "visa_application_pdf";
    },
  ) => {
    const targetGroup = activeGroup;
    const targetGroupKey = activeGroupKey;
    if (!targetGroup || !targetGroupKey) {
      setError("Выберите группу для возврата.");
      return;
    }
    setBusySlot(slot);
    setNotice("");
    setError("");
    try {
      const currentPackage = await ensurePackage(targetGroupKey, targetGroup);
      if (currentPackage.status === "published") {
        throw new Error("Пакет уже опубликован и не может быть изменён.");
      }
      const uploaded = await uploadAgentReturnPackageArtifact({
        ...input,
        file,
        packageId: currentPackage.id,
      });
      setArtifactsByGroup((current) => ({
        ...current,
        [targetGroupKey]: [
          ...(current[targetGroupKey] ?? []).filter(
            (artifact) =>
              !(
                artifact.artifactKind === uploaded.artifactKind &&
                artifact.applicantId === uploaded.applicantId
              ),
          ),
          uploaded,
        ],
      }));
      setNotice("PDF сохранён в Supabase.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось сохранить PDF.");
    } finally {
      setBusySlot("");
    }
  };

  const publish = async () => {
    const targetGroup = activeGroup;
    const targetGroupKey = activeGroupKey;
    if (!targetGroup || !targetGroupKey) {
      setError("Выберите группу для возврата.");
      return;
    }
    setNotice("");
    setError("");
    setBusySlot("publish");
    try {
      const currentPackage = await ensurePackage(targetGroupKey, targetGroup);
      const result = await publishAgentReturnPackage(currentPackage.id);
      setStartedPackages((current) => ({
        ...current,
        [targetGroupKey]: { id: result.id, status: result.status },
      }));
      setNotice(
        result.duplicate
          ? "Этот пакет уже был передан агенту."
          : `Пакет опубликован: ${result.artifactCount} PDF доступны агенту.`,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось передать пакет агенту.");
    } finally {
      setBusySlot("");
    }
  };

  const openDraft = async () => {
    const targetGroup = activeGroup;
    const targetGroupKey = activeGroupKey;
    if (!targetGroup || !targetGroupKey) {
      setError("Выберите группу для возврата.");
      return;
    }

    setBusySlot("open");
    setNotice("");
    setError("");
    try {
      const currentPackage = await ensurePackage(targetGroupKey, targetGroup);
      setNotice(
        currentPackage.status === "published"
          ? "Этот пакет уже передан агенту."
          : "Черновик пакета загружен из Supabase.",
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Не удалось открыть возвратный пакет.",
      );
    } finally {
      setBusySlot("");
    }
  };

  if (groupsLoading) {
    return (
      <section className="flex min-h-[420px] flex-col items-center justify-center rounded-2xl border border-[#242529] bg-[#161617] p-8 text-center text-[13px] text-white/54">
        <LoaderCircle className="mb-3 h-6 w-6 animate-spin text-[#b8baff]" />
        Загрузка выгруженных пакетов из Supabase…
      </section>
    );
  }

  if (groupsError) {
    return (
      <section className="flex min-h-[420px] flex-col items-center justify-center rounded-2xl border border-[#513036] bg-[#281c20] p-8 text-center">
        <h2 className="m-0 text-[18px] font-semibold text-white">Не удалось загрузить возвратные пакеты</h2>
        <p className="m-0 mt-2 max-w-md text-[13px] leading-5 text-[#ffbdc3]">{groupsError}</p>
      </section>
    );
  }

  if (!groups.length) {
    return (
      <section className="flex min-h-[420px] flex-col items-center justify-center rounded-2xl border border-dashed border-[#242529] bg-[#161617] p-8 text-center">
        <Send className="mb-4 h-10 w-10 text-white/20" />
        <h2 className="m-0 text-[18px] font-semibold text-white">Нет выгруженных пакетов</h2>
        <p className="m-0 mt-2 max-w-md text-[13px] leading-5 text-white/52">
          После городской выгрузки здесь появятся группы для возврата готовых анкет агентам.
        </p>
      </section>
    );
  }

  return (
    <section className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]" data-testid="admin-return-packages-screen">
      <aside className="rounded-2xl border border-[#242529] bg-[#161617] p-3">
        <p className="m-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40">
          Город и агент
        </p>
        <div className="grid gap-1.5">
          {groups.map((group) => {
            const key = groupKey(group);
            const selected = key === activeGroupKey;
            return (
              <button
                className={`rounded-xl border p-3 text-left transition-colors ${
                  selected
                    ? "border-[#4d5ad0] bg-[#202758] text-white"
                    : "border-transparent bg-[#1e1e21] text-white/70 hover:border-[#2e2f34] hover:bg-[#27272b]"
                }`}
                key={key}
                type="button"
                disabled={Boolean(busySlot)}
                onClick={() => {
                  setActiveGroupKey(key);
                  setNotice("");
                  setError("");
                }}
              >
                <strong className="block text-[13px] font-semibold">{group.city}</strong>
                <span className="mt-1 block text-[12px] text-white/58">
                  {group.agentName}
                </span>
                <span className="mt-1 block text-[11px] text-white/42">
                  {group.applicants.length} туристов · {group.submissionCount} подач
                </span>
              </button>
            );
          })}
        </div>
      </aside>

      {activeGroup ? (
        <div className="grid gap-5">
          <header className="flex flex-col gap-3 rounded-2xl border border-[#242529] bg-[#161617] p-5 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40">
                Возвратный пакет
              </p>
              <h2 className="m-0 mt-1 text-[22px] font-semibold tracking-tight text-white">
                {activeGroup.city} · {activeGroup.agentName}
              </h2>
              <p className="m-0 mt-2 text-[13px] text-white/54">
                Один PDF-список на {activeGroup.applicants.length} туристов и одна готовая форма на каждого.
              </p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-xl border border-[#2e2f34] bg-[#1e1e21] px-3 py-2 text-[12px] text-white/64">
              <Users className="h-4 w-4 text-[#b8baff]" />
              Семьи не дробятся
            </div>
          </header>

          <section className="rounded-2xl border border-[#242529] bg-[#161617] p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="m-0 text-[15px] font-semibold text-white">PDF-список агента</h3>
                <p className="m-0 mt-1 text-[12px] text-white/50">
                  Один список на всех туристов этой группы.
                </p>
              </div>
              <label className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-[10px] border border-[#4450c5] bg-[#3a45b4] px-3 text-[12px] font-semibold text-white transition-colors hover:bg-[#4855d4]">
                {busySlot === "list" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                {hasList ? "Заменить список" : "Загрузить список"}
                <input
                  accept="application/pdf,.pdf"
                  className="sr-only"
                  disabled={Boolean(busySlot) || startedPackage?.status === "published"}
                  type="file"
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    event.currentTarget.value = "";
                    if (file) void upload("list", file, { artifactKind: "agent_list_pdf" });
                  }}
                />
              </label>
            </div>
            {hasList ? (
              <p className="mt-3 mb-0 inline-flex items-center gap-2 text-[12px] text-[#8fe7c1]">
                <CheckCircle2 className="h-4 w-4" /> Список сохранён
              </p>
            ) : null}
          </section>

          <section className="overflow-hidden rounded-2xl border border-[#242529] bg-[#161617]">
            <div className="border-b border-[#242529] px-5 py-4">
              <h3 className="m-0 text-[15px] font-semibold text-white">Готовые анкеты по туристам</h3>
            </div>
            <div className="divide-y divide-[#242529]">
              {activeGroup.applicants.map((applicant) => {
                const slot = `visa_application_pdf:${applicant.applicantId}`;
                const uploaded = artifactSlots.has(slot);
                return (
                  <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between" key={applicant.applicantId}>
                    <div className="min-w-0">
                      <strong className="block truncate text-[13px] font-semibold text-white">
                        {applicant.applicantName}
                      </strong>
                      <span className="mt-1 block text-[12px] text-white/48">
                        {applicant.submissionType === "family" ? "Семья" : "Одиночная подача"} · {applicant.submissionTitle}
                      </span>
                    </div>
                    <label className="inline-flex h-10 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-[10px] border border-[#2e2f34] bg-[#1e1e21] px-3 text-[12px] font-semibold text-white/80 transition-colors hover:bg-[#27272b]">
                      {busySlot === slot ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                      {uploaded ? "Заменить PDF" : "Загрузить PDF"}
                      <input
                        accept="application/pdf,.pdf"
                        className="sr-only"
                        disabled={Boolean(busySlot) || startedPackage?.status === "published"}
                        type="file"
                        onChange={(event) => {
                          const file = event.currentTarget.files?.[0];
                          event.currentTarget.value = "";
                          if (file) {
                            void upload(slot, file, {
                              applicantId: applicant.applicantId,
                              artifactKind: "visa_application_pdf",
                            });
                          }
                        }}
                      />
                    </label>
                  </div>
                );
              })}
            </div>
          </section>

          {error ? <p className="m-0 rounded-xl border border-[#513036] bg-[#281c20] px-4 py-3 text-[13px] text-[#ffbdc3]">{error}</p> : null}
          {notice ? <p className="m-0 rounded-xl border border-[#244238] bg-[#14251f] px-4 py-3 text-[13px] text-[#8fe7c1]">{notice}</p> : null}

          <footer className="flex flex-col gap-3 rounded-2xl border border-[#242529] bg-[#161617] p-4 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-[12px] text-white/50">
              {hasList ? "Список загружен" : "Нужен PDF-список"} · {artifacts.filter((artifact) => artifact.artifactKind === "visa_application_pdf").length}/{activeGroup.applicants.length} анкет
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {!startedPackage ? (
                <button
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-[10px] border border-[#2e2f34] bg-[#1e1e21] px-4 text-[13px] font-semibold text-white/80 transition-colors hover:bg-[#27272b] disabled:cursor-not-allowed disabled:text-white/32"
                  disabled={Boolean(busySlot)}
                  type="button"
                  onClick={() => void openDraft()}
                >
                  {busySlot === "open" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                  Открыть черновик
                </button>
              ) : null}
              <button
                className="inline-flex h-10 items-center justify-center gap-2 rounded-[10px] border border-[#4450c5] bg-[#3a45b4] px-4 text-[13px] font-semibold text-white transition-colors hover:bg-[#4855d4] disabled:cursor-not-allowed disabled:border-[#2e2f34] disabled:bg-[#1e1e21] disabled:text-white/32"
                disabled={!canPublish || Boolean(busySlot) || startedPackage?.status === "published"}
                type="button"
                onClick={() => void publish()}
              >
                {busySlot === "publish" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Передать агенту
              </button>
            </div>
          </footer>
        </div>
      ) : null}
    </section>
  );
}
