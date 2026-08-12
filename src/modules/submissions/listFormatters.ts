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

function transliterateRussianSurname(value: string) {
  const pairs: Array<[RegExp, string]> = [
    [/shch/gi, "щ"],
    [/yo/gi, "ё"],
    [/zh/gi, "ж"],
    [/kh/gi, "х"],
    [/ts/gi, "ц"],
    [/ch/gi, "ч"],
    [/sh/gi, "ш"],
    [/yu/gi, "ю"],
    [/ya/gi, "я"],
    [/ye/gi, "е"],
  ];
  const letters: Record<string, string> = {
    a: "а", b: "б", c: "к", d: "д", e: "е", f: "ф", g: "г", h: "х",
    i: "и", j: "й", k: "к", l: "л", m: "м", n: "н", o: "о", p: "п",
    q: "к", r: "р", s: "с", t: "т", u: "у", v: "в", w: "в", x: "кс",
    y: "ы", z: "з",
  };

  const transliterated = pairs.reduce(
    (result, [pattern, replacement]) => result.replace(pattern, replacement),
    value,
  ).replace(/[a-z]/gi, (letter) => letters[letter.toLowerCase()] ?? letter);

  return `${transliterated.charAt(0).toLocaleUpperCase("ru-RU")}${transliterated
    .slice(1)
    .toLocaleLowerCase("ru-RU")}`;
}

function mainApplicantSurname(applicantName?: string) {
  const tokens = applicantName?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (!tokens.length) return undefined;

  const surnamePattern = /(?:ов|ова|ев|ева|ин|ина|ын|ына|ский|ская|цкий|цкая|ov|ova|ev|eva|in|ina|yn|yna|sky|skiy|skaya|tsky|tskiy|tskaya)$/i;
  const candidate = tokens.find((token) => surnamePattern.test(token)) ?? tokens[0];
  if (/^(основной|новый)$/i.test(candidate)) return undefined;

  return /[a-z]/i.test(candidate)
    ? transliterateRussianSurname(candidate)
    : `${candidate.charAt(0).toLocaleUpperCase("ru-RU")}${candidate
        .slice(1)
        .toLocaleLowerCase("ru-RU")}`;
}

export function familyListTitleFromMainApplicantName(applicantName?: string) {
  const surname = mainApplicantSurname(applicantName);
  if (!surname) return undefined;

  if (/я$/i.test(surname) && /(?:ская|цкая)$/i.test(surname)) {
    return `${surname.slice(0, -2)}ие`;
  }

  if (/(?:ский|цкий)$/i.test(surname)) {
    return `${surname.slice(0, -2)}ие`;
  }

  if (/(?:ова|ева|ина|ына)$/i.test(surname)) {
    return `${surname.slice(0, -1)}ы`;
  }

  if (/(?:ов|ев|ин|ын)$/i.test(surname)) {
    return `${surname}ы`;
  }

  return undefined;
}

export function familyDisplayTitleFromMainApplicantName(applicantName?: string) {
  const surname = mainApplicantSurname(applicantName);
  if (!surname) return undefined;

  if (/(?:ская|цкая)$/i.test(surname)) {
    return `Семья ${surname.slice(0, -2)}их`;
  }

  if (/(?:ский|цкий)$/i.test(surname)) {
    return `Семья ${surname.slice(0, -2)}их`;
  }

  if (/(?:ова|ева|ина|ына)$/i.test(surname)) {
    return `Семья ${surname.slice(0, -1)}ых`;
  }

  if (/(?:ов|ев|ин|ын)$/i.test(surname)) {
    return `Семья ${surname}ых`;
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
      subtitle: addFileActionLabel(input.fileType),
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
  return applicantName?.trim() || "Фамилия Имя";
}

function replacementActionLabel(fileType: SubmissionFileType) {
  if (fileType === "selfie") return "Заменить селфи 1";
  if (fileType === "selfie_2") return "Заменить селфи 2";
  if (fileType === "passport_scan") return "Заменить скан паспорта";
  return "Заменить файл";
}

function addFileActionLabel(fileType: SubmissionFileType) {
  if (fileType === "selfie") return "Добавить селфи 1";
  if (fileType === "selfie_2") return "Добавить селфи 2";
  if (fileType === "passport_scan") return "Добавить скан паспорта";
  return "Добавить файл";
}
