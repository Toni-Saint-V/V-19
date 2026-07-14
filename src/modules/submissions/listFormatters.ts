import { blockerCount, openIssueCount, statusLabelFor } from "./status";
import type { Submission, SubmissionFileType, SubmissionStatus } from "./types";

export type ActionRowText = {
  subtitle: string;
  title: string;
};

export type AgentActionRowTextInput =
  | {
      applicantName?: string;
      fileType: SubmissionFileType;
      kind: "add_file";
    }
  | {
      applicantName?: string;
      fileType: SubmissionFileType;
      kind: "replace_file";
    }
  | {
      applicantName?: string;
      fieldSummary?: string;
      kind: "fill_questionnaire";
      sectionTitle?: string;
    }
  | {
      kind: "submit_corrections";
      submission: Submission;
    }
  | {
      kind: "completed";
      status: SubmissionStatus;
      submission: Submission;
    };

export function formatSubmissionListTitle(submission: Submission) {
  return submission.listTitle?.trim() || submission.title;
}

export function familyListTitleFromMainApplicantName(applicantName?: string) {
  const surname = applicantName?.trim().split(/\s+/)[0];
  if (!surname || surname === "Основной" || surname === "Новый") return undefined;

  if (surname.endsWith("ова") || surname.endsWith("ева") || surname.endsWith("ина")) {
    return `${surname.slice(0, -1)}ы`;
  }

  if (surname.endsWith("ов") || surname.endsWith("ев") || surname.endsWith("ин")) {
    return `${surname}ы`;
  }

  return undefined;
}

export function formatSubmissionListStatus(submission: Submission) {
  const label = statusLabelFor(submission.status, "compact");
  if (submission.status !== "returned" && submission.status !== "requires_action") {
    return label;
  }

  const problemCount = openIssueCount(submission) || blockerCount(submission);
  return problemCount > 0 ? `${label} ${problemCount}` : label;
}

export function formatAgentActionRowText(
  input: AgentActionRowTextInput,
): ActionRowText {
  if (input.kind === "replace_file") {
    return {
      subtitle: replacementActionLabel(input.fileType),
      title: applicantTitle(input.applicantName),
    };
  }

  if (input.kind === "add_file") {
    return {
      subtitle: "Добавить файл",
      title: applicantTitle(input.applicantName),
    };
  }

  if (input.kind === "fill_questionnaire") {
    const action = input.sectionTitle
      ? `Заполнить раздел «${input.sectionTitle}»`
      : "Заполнить анкету";
    return {
      subtitle: input.fieldSummary ? `${action} · ${input.fieldSummary}` : action,
      title: applicantTitle(input.applicantName),
    };
  }

  if (input.kind === "submit_corrections") {
    return {
      subtitle: "Отправить исправления",
      title: formatSubmissionListTitle(input.submission),
    };
  }

  return {
    subtitle:
      input.status === "corrections_received"
        ? "Исправления отправлены"
        : input.status === "exported"
          ? "Пакет выгружен"
        : "Подача передана дальше",
    title: formatSubmissionListTitle(input.submission),
  };
}

function applicantTitle(applicantName?: string) {
  return applicantName?.trim() || "Новый заявитель";
}

function replacementActionLabel(fileType: SubmissionFileType) {
  if (fileType === "selfie") return "Заменить селфи 1";
  if (fileType === "selfie_2") return "Заменить селфи 2";
  if (fileType === "passport_scan") return "Заменить скан паспорта";
  return "Заменить файл";
}
