import { Command } from "cmdk";
import {
  FileStack,
  ListChecks,
  Plus,
  Search,
  SlidersHorizontal,
  UserRound,
} from "lucide-react";
import { submissionPublicId } from "../submissionIdentity";
import type { Submission } from "../types";

type CommandPaletteProps = {
  onCreateSubmission: () => void;
  onNavigateAgentActions: () => void;
  onNavigateAgentSubmissions: () => void;
  onNavigateSettings: () => void;
  onOpenChange: (open: boolean) => void;
  onOpenSubmission: (submission: Submission) => void;
  open: boolean;
  role: "agent" | "admin";
  submissions: Submission[];
};

export function CommandPalette({
  onCreateSubmission,
  onNavigateAgentActions,
  onNavigateAgentSubmissions,
  onNavigateSettings,
  onOpenChange,
  onOpenSubmission,
  open,
  role,
  submissions,
}: CommandPaletteProps) {
  function runCommand(action: () => void) {
    onOpenChange(false);
    window.requestAnimationFrame(action);
  }

  return (
    <Command.Dialog
      className="v19-command-palette"
      contentClassName="v19-command-palette-content"
      label="Командная палитра"
      loop
      onOpenChange={onOpenChange}
      open={open}
      overlayClassName="v19-command-palette-overlay"
    >
      <div className="v19-command-palette-search">
        <Search aria-hidden="true" focusable="false" size={17} strokeWidth={1.8} />
        <Command.Input
          aria-label="Найти команду или подачу"
          autoFocus
          placeholder="Команда или подача..."
        />
      </div>
      <Command.List className="v19-command-palette-list" label="Команды">
        <Command.Empty className="v19-command-palette-empty">
          Ничего не найдено
        </Command.Empty>

        <Command.Group heading="Переходы">
          {role === "agent" ? (
            <>
              <Command.Item
                keywords={["мои действия", "actions", "очередь"]}
                onSelect={() => runCommand(onNavigateAgentActions)}
                value="go-agent-actions"
              >
                <ListChecks aria-hidden="true" focusable="false" size={16} />
                <span>Мои действия</span>
                <em>Очередь</em>
              </Command.Item>
              <Command.Item
                keywords={["мои подачи", "submissions", "заявители"]}
                onSelect={() => runCommand(onNavigateAgentSubmissions)}
                value="go-agent-submissions"
              >
                <FileStack aria-hidden="true" focusable="false" size={16} />
                <span>Мои подачи</span>
                <em>Профили</em>
              </Command.Item>
            </>
          ) : null}
          <Command.Item
            keywords={["настройки", "settings", "доступ"]}
            onSelect={() => runCommand(onNavigateSettings)}
            value="go-settings"
          >
            <SlidersHorizontal aria-hidden="true" focusable="false" size={16} />
            <span>Настройки</span>
            <em>Доступ</em>
          </Command.Item>
        </Command.Group>

        {role === "agent" ? (
          <Command.Group heading="Действия">
            <Command.Item
              keywords={["создать пакет", "новая подача", "create"]}
              onSelect={() => runCommand(onCreateSubmission)}
              value="create-submission"
            >
              <Plus aria-hidden="true" focusable="false" size={16} />
              <span>Создать пакет</span>
              <em>Новая подача</em>
            </Command.Item>
          </Command.Group>
        ) : null}

        {submissions.length > 0 ? (
          <Command.Group heading="Подачи">
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
                  key={submission.id}
                  keywords={[
                    submission.id,
                    submission.title,
                    submission.listTitle ?? "",
                    submission.city,
                    ...applicantNames,
                  ]}
                  onSelect={() => runCommand(() => onOpenSubmission(submission))}
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
    </Command.Dialog>
  );
}
