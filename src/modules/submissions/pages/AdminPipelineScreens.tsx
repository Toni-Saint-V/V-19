import { useMemo, useRef, type ChangeEvent } from "react";
import { motion, useReducedMotion } from "motion/react";
import { CheckCircle2, FileArchive, FolderUp, Send, ShieldCheck, UploadCloud, UserCheck, UserX } from "lucide-react";

import { V19InfoStrip, V19ProductButton } from "../../../shared/ui/v19-product-kit";
import { agentOwnerDisplayName } from "../ownership";
import { formatSubmissionListTitle } from "../listFormatters";
import { applicantCountLabel, tripDates } from "../selectors";
import { openIssueCount } from "../status";
import type { City, DrawerTab, Submission } from "../types";
import type { AccessRequest } from "../../../shared/authRegistration";
import { adminReturnPipelineSteps, adminUploadKindLabel, buildAdminPipelineAgentPlan, buildAdminPipelineCityPlan } from "../adminReturnPipeline";

export type AdminUploadArtifactKind = "appointment_list" | "questionnaire_pdf";

export type AdminUploadArtifact = {
  id: string;
  city?: City | "auto";
  fileName: string;
  kind: AdminUploadArtifactKind;
  sizeBytes: number;
  uploadedAtIso: string;
};

type AdminOpenHandler = (submission: Submission, tab?: DrawerTab) => void;

function formatBytes(size: number) {
  if (!Number.isFinite(size) || size <= 0) return "0 KB";
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function shortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
  }).format(date);
}

export function AdminIntakeScreen({
  artifacts,
  onOpen,
  onUploadAppointmentFiles,
  onUploadQuestionnairePdfs,
  submissions,
}: {
  artifacts: AdminUploadArtifact[];
  onOpen: AdminOpenHandler;
  onUploadAppointmentFiles: (files: File[]) => void;
  onUploadQuestionnairePdfs: (files: File[]) => void;
  submissions: Submission[];
}) {
  const listInputRef = useRef<HTMLInputElement | null>(null);
  const pdfInputRef = useRef<HTMLInputElement | null>(null);
  const prefersReducedMotion = useReducedMotion();
  const cityPlan = useMemo(() => buildAdminPipelineCityPlan(submissions), [submissions]);
  const agentPlan = useMemo(() => buildAdminPipelineAgentPlan(submissions), [submissions]);
  const appointmentFiles = artifacts.filter((artifact) => artifact.kind === "appointment_list");
  const questionnaireFiles = artifacts.filter((artifact) => artifact.kind === "questionnaire_pdf");
  const readySubmissions = submissions.filter((submission) => submission.status === "ready_for_export");
  const reviewSubmissions = submissions.filter((submission) =>
    ["submitted_for_review", "corrections_received"].includes(submission.status),
  );

  function filesFromEvent(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    return files;
  }

  const cardMotion = prefersReducedMotion
    ? { initial: false, animate: undefined }
    : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 } };

  return (
    <div className="vf-admin-pipeline" data-testid="admin-intake-screen">
      <section className="vf-admin-pipeline-hero">
        <div>
          <span className="vf-linear-eyebrow">Admin pipeline</span>
          <h2>Выгрузка отдельно, загрузка отдельно</h2>
          <p>
            Этап 1: выгрузите Excel по городам и ZIP документов для программистов. Этап 2: после подготовки анкет загрузите обратно список записи и PDF анкет, затем сформируйте отправку агентам.
          </p>
        </div>
        <div className="vf-admin-pipeline-hero-actions">
          <input
            ref={listInputRef}
            accept=".xlsx,.xls,.csv,application/pdf"
            multiple
            type="file"
            onChange={(event) => onUploadAppointmentFiles(filesFromEvent(event))}
          />
          <input
            ref={pdfInputRef}
            accept="application/pdf"
            multiple
            type="file"
            onChange={(event) => onUploadQuestionnairePdfs(filesFromEvent(event))}
          />
          <V19ProductButton icon={<UploadCloud aria-hidden="true" size={15} />} variant="cta" onClick={() => listInputRef.current?.click()}>
            Импорт списка записи
          </V19ProductButton>
          <V19ProductButton icon={<FolderUp aria-hidden="true" size={15} />} variant="confirm" onClick={() => pdfInputRef.current?.click()}>
            Импорт PDF анкет
          </V19ProductButton>
        </div>
      </section>

      <V19InfoStrip
        className="vf-admin-pipeline-metrics vf-admin-pipeline-metrics--compact"
        items={[
          { label: "Списки", value: appointmentFiles.length },
          { label: "PDF анкет", value: questionnaireFiles.length },
          { label: "К выгрузке", tone: readySubmissions.length ? "success" : "neutral", value: readySubmissions.length },
          { label: "На проверке", tone: reviewSubmissions.length ? "warning" : "neutral", value: reviewSubmissions.length },
        ]}
        label="Сводка админского пайплайна"
      />

      <section className="vf-admin-pipeline-flow" aria-label="Разделение этапов">
        {adminReturnPipelineSteps.map((step) => (
          <motion.article {...cardMotion} key={step.id}>
            <span>{step.title.split(".")[0]}</span>
            <strong>{step.title.replace(/^\d+\.\s*/, "")}</strong>
            <em>{step.description}</em>
            <small>{step.output}</small>
          </motion.article>
        ))}
      </section>

      <section className="vf-admin-pipeline-split-note" aria-label="Важное правило процесса">
        <strong>Выгрузка и обратная загрузка — разные процессы.</strong>
        <span>
          Excel по городам уходит программистам. Список записи и PDF анкет возвращаются позже и импортируются отдельно, чтобы потом собрать пакет по агентам.
        </span>
      </section>

      <div className="vf-admin-pipeline-grid">
        <section className="vf-admin-pipeline-card">
          <div className="vf-admin-pipeline-card-head">
            <div>
              <span>Города</span>
              <h3>Формирование Excel по городам</h3>
            </div>
            <FileArchive aria-hidden="true" size={18} />
          </div>
          <div className="vf-admin-city-plan">
            {cityPlan.map((plan) => (
              <motion.article {...cardMotion} key={plan.city}>
                <div>
                  <strong>{plan.city}</strong>
                  <span>{plan.submissions} подач · {plan.applicants} заявителей</span>
                </div>
                <em>{plan.ready} готово</em>
              </motion.article>
            ))}
          </div>
        </section>

        <section className="vf-admin-pipeline-card">
          <div className="vf-admin-pipeline-card-head">
            <div>
              <span>Раздача</span>
              <h3>Кому отправлять пакеты</h3>
            </div>
            <Send aria-hidden="true" size={18} />
          </div>
          <div className="vf-admin-agent-plan">
            {agentPlan.map((plan) => {
              const firstSubmission = submissions.find((submission) => submission.agentId === plan.agentId);
              return (
                <motion.article {...cardMotion} key={plan.agentId}>
                  <div>
                    <strong>{agentOwnerDisplayName(plan.agentId)}</strong>
                    <span>{plan.submissions} пакетов · {plan.files} файлов · {plan.pdfReviews} PDF</span>
                  </div>
                  <button disabled={!firstSubmission} type="button" onClick={() => firstSubmission && onOpen(firstSubmission, "files")}>
                    Список + PDF
                  </button>
                </motion.article>
              );
            })}
          </div>
        </section>
      </div>

      <section className="vf-admin-pipeline-card vf-admin-pipeline-wide">
        <div className="vf-admin-pipeline-card-head">
          <div>
            <span>Файлы админа</span>
            <h3>Загруженные списки и PDF</h3>
          </div>
          <CheckCircle2 aria-hidden="true" size={18} />
        </div>
        <div className="vf-admin-artifact-list">
          {artifacts.length ? (
            artifacts.map((artifact) => (
              <article key={artifact.id}>
                <span className="vf-admin-artifact-kind">
                  {adminUploadKindLabel(artifact.kind)}
                </span>
                <div>
                  <strong>{artifact.fileName}</strong>
                  <span>{formatBytes(artifact.sizeBytes)} · {shortDate(artifact.uploadedAtIso)}</span>
                </div>
                <em>{artifact.city ?? "auto"}</em>
              </article>
            ))
          ) : (
            <div className="vf-linear-soft-empty">
              Загрузите Excel/лист записи и PDF анкет. После загрузки они появятся здесь.
            </div>
          )}
        </div>
      </section>

      <section className="vf-admin-pipeline-card vf-admin-pipeline-wide">
        <div className="vf-admin-pipeline-card-head">
          <div>
            <span>Список заявок</span>
            <h3>Принять или вернуть агенту</h3>
          </div>
          <ShieldCheck aria-hidden="true" size={18} />
        </div>
        <div className="vf-admin-submission-decision-list">
          {submissions.slice(0, 10).map((submission) => (
            <article key={submission.id}>
              <button type="button" onClick={() => onOpen(submission)}>
                <strong>{formatSubmissionListTitle(submission)}</strong>
                <span>{submission.id} · {submission.city} · {tripDates(submission)} · {agentOwnerDisplayName(submission.agentId)}</span>
              </button>
              <span>{applicantCountLabel(submission.applicants.length)}</span>
              <em>{openIssueCount(submission)} замеч.</em>
              <V19ProductButton variant="cta" onClick={() => onOpen(submission, "issues")}>
                Отказать / вернуть
              </V19ProductButton>
              <V19ProductButton variant="confirm" onClick={() => onOpen(submission, "files")}>Принять</V19ProductButton>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

export function AdminAccessRequestsScreen({
  busy = false,
  requests,
  onApprove,
  onReject,
}: {
  busy?: boolean;
  requests: AccessRequest[];
  onApprove: (requestId: string) => void;
  onReject: (requestId: string) => void;
}) {
  return (
    <div className="vf-admin-access-screen" data-testid="admin-access-screen">
      <section className="vf-admin-pipeline-hero">
        <div>
          <span className="vf-linear-eyebrow">Access control</span>
          <h2>Заявки агентов на доступ</h2>
          <p>Админ принимает или отклоняет заявки без ухода в настройки.</p>
        </div>
        <strong className="vf-admin-access-counter">{requests.length}</strong>
      </section>

      <div className="vf-admin-access-list">
        {requests.length ? (
          requests.map((request) => (
            <article key={request.id}>
              <div className="vf-admin-access-avatar" aria-hidden="true">
                {request.fullName?.slice(0, 1).toUpperCase() || "А"}
              </div>
              <div className="vf-admin-access-copy">
                <strong>{request.fullName || request.email}</strong>
                <span>{request.email}</span>
                <em>
                  {request.companyName || "Компания не указана"} · {request.city || "город не указан"}
                </em>
              </div>
              <div className="vf-admin-access-actions">
                <V19ProductButton disabled={busy} icon={<UserX aria-hidden="true" size={15} />} variant="cta" onClick={() => onReject(request.id)}>
                  Отказать
                </V19ProductButton>
                <V19ProductButton disabled={busy} icon={<UserCheck aria-hidden="true" size={15} />} variant="confirm" onClick={() => onApprove(request.id)}>
                  Принять
                </V19ProductButton>
              </div>
            </article>
          ))
        ) : (
          <div className="vf-linear-empty" role="status">
            <div className="vf-linear-empty-icon" aria-hidden="true">
              <UserCheck size={22} />
            </div>
            <h3>Новых заявок нет</h3>
            <p>Когда агент запросит доступ, карточка появится в этой очереди.</p>
          </div>
        )}
      </div>
    </div>
  );
}
