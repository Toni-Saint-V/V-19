import { useEffect, useMemo, useState } from "react";
import { Command } from "cmdk";
import {
  Bot,
  Clipboard,
  Download,
  FileStack,
  ListChecks,
  Plus,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { submissionPublicId } from "../submissionIdentity";
import {
  buildWorkspaceIntelligence,
  workspaceIntelligenceClipboardText,
} from "../workspaceIntelligence";
import type { Submission } from "../types";
import { agentInteractionProps } from "../agentInteractionContract";

type CommandPaletteProps = {
  onCreateSubmission?: () => void;
  onNavigateAdminExport?: () => void;
  onNavigateAdminReview?: () => void;
  onNavigateAgentActions?: () => void;
  onNavigateAgentSubmissions?: () => void;
  onNavigateSettings?: () => void;
  onNavigateUsers?: () => void;
  onOpenChange: (open: boolean) => void;
  onOpenSubmission?: (submission: Submission) => void;
  open: boolean;
  role: "agent" | "admin";
  submissions: Submission[];
};

export function CommandPalette({
  onCreateSubmission,
  onNavigateAdminExport,
  onNavigateAdminReview,
  onNavigateAgentActions,
  onNavigateAgentSubmissions,
  onNavigateSettings,
  onNavigateUsers,
  onOpenChange,
  onOpenSubmission,
  open,
  role,
  submissions,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [copyStatus, setCopyStatus] = useState<"copied" | "failed" | null>(null);
  const intelligence = useMemo(
    () => buildWorkspaceIntelligence(submissions, role),
    [role, submissions],
  );
  const topSubmission = submissions.find(
    (submission) => submission.id === intelligence.topSubmissionId,
  );

  useEffect(() => {
    if (!open) {
      setQuery("");
      setCopyStatus(null);
    }
  }, [open]);

  function runCommand(action?: () => void) {
    if (!action) return;
    onOpenChange(false);
    window.requestAnimationFrame(action);
  }

  function copyAiPlan() {
    void copyToClipboard(workspaceIntelligenceClipboardText(intelligence)).then(
      (copied) => {
        setCopyStatus(copied ? "copied" : "failed");
      },
    );
  }

  const contextLabel = role === "admin" ? "администратора" : "агента";

  return (
    <Command.Dialog
      className="v19-command-palette"
      contentClassName="v19-command-palette-content"
      label={`Командная палитра ${contextLabel}`}
      loop
      onOpenChange={onOpenChange}
      open={open}
      overlayClassName="v19-command-palette-overlay"
    >
      <button
        aria-label="Закрыть командную палитру"
        className="v19-command-palette-close"
        type="button"
        onClick={() => onOpenChange(false)}
      >
        <X aria-hidden="true" focusable="false" size={20} strokeWidth={1.8} />
      </button>
      <div className="v19-command-palette-search">
        <Search aria-hidden="true" focusable="false" size={17} strokeWidth={1.8} />
        <Command.Input
          {...(role === "agent" ? agentInteractionProps("palette.search") : {})}
          aria-label="Найти команду, действие или подачу"
          autoFocus
          placeholder="Команда, подача или «что срочно»…"
          value={query}
          onValueChange={setQuery}
        />
        <kbd>Esc</kbd>
      </div>
      <Command.List className="v19-command-palette-list" label="Команды">
        <Command.Empty className="v19-command-palette-empty">
          <Search aria-hidden="true" />
          <strong>Ничего не найдено</strong>
          <span>Попробуйте ID подачи, имя заявителя или действие.</span>
        </Command.Empty>

        <Command.Group className="v19-command-ai-group" heading="AI-фокус">
          {topSubmission && onOpenSubmission ? (
            <Command.Item
              {...(role === "agent"
                ? agentInteractionProps("palette.select-command")
                : {})}
              className="v19-command-ai-item"
              keywords={[
                "что срочно",
                "главный риск",
                "приоритет",
                "ai",
                "copilot",
                "блокеры",
                intelligence.headline,
                intelligence.summary,
              ]}
              onSelect={() => runCommand(() => onOpenSubmission(topSubmission))}
              value={`ai-priority-${topSubmission.id}`}
            >
              <span className={`v19-command-ai-icon is-${intelligence.tone}`}>
                <Sparkles aria-hidden="true" focusable="false" size={17} />
              </span>
              <span className="v19-command-ai-copy">
                <strong>{intelligence.headline}</strong>
                <small>{intelligence.summary}</small>
              </span>
              <em>{intelligence.score}/100</em>
            </Command.Item>
          ) : (
            <Command.Item
              {...(role === "agent"
                ? agentInteractionProps("palette.select-command")
                : {})}
              className="v19-command-ai-item"
              keywords={["очередь чистая", "ai", "статус"]}
              value="ai-queue-clear"
              onSelect={() => onOpenChange(false)}
            >
              <span className="v19-command-ai-icon is-clear">
                <ShieldCheck aria-hidden="true" focusable="false" size={17} />
              </span>
              <span className="v19-command-ai-copy">
                <strong>{intelligence.headline}</strong>
                <small>{intelligence.summary}</small>
              </span>
              <em>{intelligence.score}/100</em>
            </Command.Item>
          )}
          <Command.Item
            {...(role === "agent" ? agentInteractionProps("palette.copy-plan") : {})}
            keywords={["скопировать план", "ai сводка", "план работы", "brief"]}
            onSelect={copyAiPlan}
            value="ai-copy-workspace-plan"
          >
            <Clipboard aria-hidden="true" focusable="false" size={16} />
            <span>Скопировать AI-план очереди</span>
            <em>Brief</em>
          </Command.Item>
        </Command.Group>

        <Command.Group heading="Переходы">
          {role === "agent" ? (
            <>
              {onNavigateAgentActions ? (
                <Command.Item
                  {...agentInteractionProps("palette.select-command")}
                  keywords={["мои действия", "actions", "очередь"]}
                  onSelect={() => runCommand(onNavigateAgentActions)}
                  value="go-agent-actions"
                >
                  <ListChecks aria-hidden="true" focusable="false" size={16} />
                  <span>Мои действия</span>
                  <em>Очередь</em>
                </Command.Item>
              ) : null}
              {onNavigateAgentSubmissions ? (
                <Command.Item
                  {...agentInteractionProps("palette.select-command")}
                  keywords={["мои подачи", "submissions", "заявители"]}
                  onSelect={() => runCommand(onNavigateAgentSubmissions)}
                  value="go-agent-submissions"
                >
                  <FileStack aria-hidden="true" focusable="false" size={16} />
                  <span>Мои подачи</span>
                  <em>Профили</em>
                </Command.Item>
              ) : null}
            </>
          ) : (
            <>
              {onNavigateAdminReview ? (
                <Command.Item
                  keywords={["проверка", "review", "очередь", "ревью"]}
                  onSelect={() => runCommand(onNavigateAdminReview)}
                  value="go-admin-review"
                >
                  <ShieldCheck aria-hidden="true" focusable="false" size={16} />
                  <span>Очередь на проверку</span>
                  <em>Review</em>
                </Command.Item>
              ) : null}
              {onNavigateAdminExport ? (
                <Command.Item
                  keywords={["выгрузка", "export", "готовые пакеты"]}
                  onSelect={() => runCommand(onNavigateAdminExport)}
                  value="go-admin-export"
                >
                  <Download aria-hidden="true" focusable="false" size={16} />
                  <span>Центр выгрузки</span>
                  <em>Export</em>
                </Command.Item>
              ) : null}
              {onNavigateUsers ? (
                <Command.Item
                  keywords={["пользователи", "доступ", "заявки", "роли"]}
                  onSelect={() => runCommand(onNavigateUsers)}
                  value="go-admin-users"
                >
                  <UsersRound aria-hidden="true" focusable="false" size={16} />
                  <span>Пользователи и доступ</span>
                  <em>Access</em>
                </Command.Item>
              ) : null}
            </>
          )}
          {onNavigateSettings ? (
            <Command.Item
              {...(role === "agent"
                ? agentInteractionProps("palette.select-command")
                : {})}
              keywords={["настройки", "settings", "интерфейс", "доступность"]}
              onSelect={() => runCommand(onNavigateSettings)}
              value="go-settings"
            >
              <SlidersHorizontal aria-hidden="true" focusable="false" size={16} />
              <span>Настройки</span>
              <em>⌘K</em>
            </Command.Item>
          ) : null}
        </Command.Group>

        {role === "agent" && onCreateSubmission ? (
          <Command.Group heading="Действия">
            <Command.Item
              {...agentInteractionProps("palette.select-command")}
              keywords={["создать пакет", "новая подача", "create"]}
              onSelect={() => runCommand(onCreateSubmission)}
              value="create-submission"
            >
              <Plus aria-hidden="true" focusable="false" size={16} />
              <span>Новая подача</span>
              <em>Создать</em>
            </Command.Item>
          </Command.Group>
        ) : null}

        {submissions.length > 0 ? (
          <Command.Group heading={`Подачи · ${submissions.length}`}>
            {submissions.map((submission) => {
              const applicantNames = submission.applicants
                .map((applicant) => applicant.fullName)
                .filter(Boolean);
              const primaryApplicant = applicantNames[0] ?? submission.title;
              const meta =
                applicantNames.length > 1
                  ? `${primaryApplicant} +${applicantNames.length - 1}`
                  : primaryApplicant;

              return (
                <Command.Item
                  {...(role === "agent"
                    ? agentInteractionProps("palette.select-command")
                    : {})}
                  key={submission.id}
                  keywords={[
                    submission.id,
                    submission.title,
                    submission.listTitle ?? "",
                    submission.city,
                    ...applicantNames,
                  ]}
                  onSelect={() =>
                    runCommand(
                      onOpenSubmission ? () => onOpenSubmission(submission) : undefined,
                    )
                  }
                  value={`submission-${submission.id}`}
                >
                  <UserRound aria-hidden="true" focusable="false" size={16} />
                  <span>{submission.title}</span>
                  <em>
                    {submissionPublicId(submission)} · {meta}
                  </em>
                </Command.Item>
              );
            })}
          </Command.Group>
        ) : null}
      </Command.List>
      {copyStatus ? (
        <p
          className="v19-command-palette-copy-status"
          role={copyStatus === "failed" ? "alert" : "status"}
        >
          {copyStatus === "copied"
            ? "AI-план скопирован"
            : "Не удалось скопировать AI-план. Разрешите доступ к буферу и попробуйте ещё раз."}
        </p>
      ) : null}
      <footer className="v19-command-palette-footer">
        <span>
          <kbd>↑</kbd>
          <kbd>↓</kbd> навигация
        </span>
        <span>
          <kbd>↵</kbd> открыть
        </span>
        {query ? (
          <span>
            <Bot aria-hidden="true" /> AI учитывает запрос
          </span>
        ) : null}
      </footer>
    </Command.Dialog>
  );
}

async function copyToClipboard(text: string): Promise<boolean> {
  let textarea: HTMLTextAreaElement | null = null;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }

    textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.append(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    return copied;
  } catch {
    return false;
  } finally {
    textarea?.remove();
  }
}
