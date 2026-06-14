import type {
  TextIntakeReviewFinding,
  TextIntakeReviewResult,
} from "./textIntakeReviewer";

export interface TextIntakeReviewDisplay {
  review: TextIntakeReviewResult;
  topFindings: TextIntakeReviewFinding[];
  blockingFindings: TextIntakeReviewFinding[];
  operatorSummary: string[];
  agentFollowUpDrafts: string[];
}

function findingTarget(finding: TextIntakeReviewFinding): string {
  const applicant = finding.applicantName ?? "Заявка";
  return finding.fieldLabel ? `${applicant} · ${finding.fieldLabel}` : applicant;
}

function relatedApplicantSuffix(finding: TextIntakeReviewFinding): string {
  const names = (finding.relatedApplicantNames ?? [])
    .map((name) => name.trim())
    .filter(Boolean);
  return names.length ? ` для: ${names.join(", ")}.` : ".";
}

function findingSeverityRank(finding: TextIntakeReviewFinding): number {
  if (finding.severity === "blocking") return 0;
  if (finding.severity === "warning") return 1;
  return 2;
}

function findingScopeRank(finding: TextIntakeReviewFinding): number {
  if (finding.scope === "field") return 0;
  if (finding.scope === "applicant") return 1;
  return 2;
}

export function sortTextReviewFindings(
  findings: TextIntakeReviewFinding[],
): TextIntakeReviewFinding[] {
  return [...findings].sort((left, right) => {
    const severityDelta = findingSeverityRank(left) - findingSeverityRank(right);
    if (severityDelta) return severityDelta;

    const scopeDelta = findingScopeRank(left) - findingScopeRank(right);
    if (scopeDelta) return scopeDelta;

    return [
      left.applicantName ?? "",
      left.fieldLabel ?? "",
      left.code,
      left.id,
    ].join("|").localeCompare(
      [
        right.applicantName ?? "",
        right.fieldLabel ?? "",
        right.code,
        right.id,
      ].join("|"),
    );
  });
}

function localizedTextReviewProblem(finding: TextIntakeReviewFinding): string {
  const field = finding.fieldLabel ?? "Поле";

  switch (finding.code) {
    case "missing_required_text":
      return `${field} не заполнено.`;
    case "placeholder_text":
      return `${field} содержит временное значение.`;
    case "missing_conditional_text":
      return `${field} требуется для выбранного варианта.`;
    case "submission_applicant_country_mismatch":
      return "Страна заявителя не совпадает со страной заявки.";
    case "submission_applicant_city_mismatch":
      return "Город заявителя не совпадает с городом заявки.";
    case "name_too_short":
      return "ФИО заявителя выглядит неполным.";
    case "invalid_email":
      return "Email указан в некорректном формате.";
    case "weak_phone":
      return "В номере телефона слишком мало цифр.";
    case "weak_passport_number":
      return "Номер паспорта слишком короткий для надежной проверки.";
    case "passport_number_unexpected_format":
      return "Формат номера паспорта выглядит нестандартным для указанного гражданства.";
    case "invalid_birth_date":
      return "Дата рождения указана в некорректном формате.";
    case "birth_date_in_future":
      return "Дата рождения указана в будущем.";
    case "invalid_date_format":
      return `${field} указано в некорректном формате даты.`;
    case "passport_issued_after_expiry":
      return "Дата выдачи паспорта позже даты окончания.";
    case "passport_expired_before_travel":
      return "Паспорт заканчивается до даты поездки.";
    case "passport_validity_too_short_after_departure":
      return "Паспорт заканчивается слишком скоро после даты выезда.";
    case "passport_validity_period_unexpected":
      return "Срок действия паспорта выглядит необычно длинным.";
    case "trip_dates_not_machine_readable":
      return "Даты поездки не читаются машинно.";
    case "travel_date_outside_trip_dates":
      return "Дата поездки заявки вне диапазона дат заявителя.";
    case "date_order_inconsistent":
      return "Порядок дат поездки противоречив.";
    case "duration_dates_mismatch":
      return "Длительность пребывания не совпадает с датами поездки.";
    case "non_numeric_duration":
      return "Длительность пребывания указана не числом.";
    case "latin_text_expected":
      return `${field} содержит символы не в латинице.`;
    case "home_address_incomplete":
      return "Домашний адрес выглядит неполным.";
    case "host_country_unexpected":
      return "Страна принимающей стороны не совпадает с ожидаемым маршрутом.";
    case "spanish_host_postal_invalid":
      return "Почтовый индекс принимающей стороны в Испании выглядит некорректным.";
    case "spanish_host_phone_unexpected":
      return "Телефон принимающей стороны в Испании выглядит нестандартным.";
    case "appointment_after_travel_date":
      return "Желаемая дата записи позже предполагаемой даты поездки.";
    case "minor_occupation_age_mismatch":
      return "Статус MINOR не совпадает с возрастом заявителя на дату поездки.";
    case "employer_contact_matches_applicant":
      return "Телефон работодателя совпадает с телефоном заявителя.";
    case "employer_address_matches_home":
      return "Адрес работодателя совпадает с домашним адресом.";
    case "residence_submission_city_mismatch":
      return "Город проживания отличается от выбранного города подачи.";
    case "duplicate_passport":
      return "Два или больше заявителей используют один номер паспорта.";
    case "shared_contact_requires_review":
      return "Несколько заявителей используют одинаковый контакт.";
    case "family_trip_mismatch":
      return "У заявителей в семейной заявке разные диапазоны поездки.";
    case "family_role_unconfirmed":
      return "Предложенная семейная роль не подтверждена.";
  }

  const exhaustive: never = finding.code;
  return exhaustive;
}

function localizedTextReviewAction(finding: TextIntakeReviewFinding): string {
  const field = finding.fieldLabel ?? "поле";
  const applicant = finding.applicantName ?? "заявителя";

  switch (finding.code) {
    case "missing_required_text":
      return `Заполните ${field} для ${applicant}.`;
    case "placeholder_text":
      return `Замените временное значение в ${field} на реальные данные для ${applicant}.`;
    case "missing_conditional_text":
      return `Заполните ${field}, потому что оно требуется для выбранного варианта.`;
    case "submission_applicant_country_mismatch":
      return "Подтвердите правильную страну подачи перед передачей.";
    case "submission_applicant_city_mismatch":
      return "Подтвердите правильный город подачи перед передачей.";
    case "name_too_short":
      return "Подтвердите полное ФИО заявителя как в паспорте.";
    case "invalid_email":
      return "Введите корректный email или подтвердите правильный канал связи.";
    case "weak_phone":
      return "Введите полный номер телефона с кодом страны или города.";
    case "weak_passport_number":
      return `Проверьте полный номер паспорта для ${applicant}.`;
    case "passport_number_unexpected_format":
      return `Сверьте номер паспорта с загранпаспортом для ${applicant}.`;
    case "invalid_birth_date":
      return "Исправьте дату рождения в формате YYYY-MM-DD.";
    case "birth_date_in_future":
      return "Исправьте дату рождения перед передачей.";
    case "invalid_date_format":
      return `Используйте требуемый формат даты для ${field}.`;
    case "passport_issued_after_expiry":
      return "Исправьте даты выдачи и окончания паспорта.";
    case "passport_expired_before_travel":
      return "Подтвердите срок действия паспорта или обновите даты поездки/паспорта.";
    case "passport_validity_too_short_after_departure":
      return `Подтвердите запас срока действия паспорта для ${applicant}.`;
    case "passport_validity_period_unexpected":
      return `Проверьте даты выдачи и окончания паспорта для ${applicant}.`;
    case "trip_dates_not_machine_readable":
      return "Введите даты поездки в ISO-формате, например 2026-08-20 - 2026-08-30.";
    case "travel_date_outside_trip_dates":
      return "Согласуйте дату поездки заявки и даты поездки заявителя перед проверкой.";
    case "date_order_inconsistent":
      return `Исправьте порядок дат поездки для ${applicant}.`;
    case "duration_dates_mismatch":
      return `Сверьте длительность пребывания с датами поездки для ${applicant}.`;
    case "non_numeric_duration":
      return `Введите длительность пребывания числом для ${applicant}.`;
    case "latin_text_expected":
      return `Проверьте транслитерацию поля ${field} для ${applicant}.`;
    case "home_address_incomplete":
      return `Подтвердите улицу, дом/корпус и квартиру для ${applicant}.`;
    case "host_country_unexpected":
      return `Подтвердите страну принимающей стороны для ${applicant}.`;
    case "spanish_host_postal_invalid":
      return `Проверьте почтовый индекс принимающей стороны для ${applicant}.`;
    case "spanish_host_phone_unexpected":
      return `Проверьте телефон принимающей стороны для ${applicant}.`;
    case "appointment_after_travel_date":
      return `Сверьте желаемые даты записи с датами поездки для ${applicant}.`;
    case "minor_occupation_age_mismatch":
      return `Подтвердите статус занятости для ${applicant}.`;
    case "employer_contact_matches_applicant":
      return `Проверьте телефон работодателя для ${applicant}.`;
    case "employer_address_matches_home":
      return `Проверьте адрес работодателя для ${applicant}.`;
    case "residence_submission_city_mismatch":
      return `Подтвердите город проживания/регистрации и выбранный центр подачи для ${applicant}.`;
    case "duplicate_passport":
      return `Проверьте номера паспортов${relatedApplicantSuffix(finding)}`;
    case "shared_contact_requires_review":
      return `Подтвердите общий контакт${relatedApplicantSuffix(finding)}`;
    case "family_trip_mismatch":
      return `Подтвердите семейные даты поездки${relatedApplicantSuffix(finding)}`;
    case "family_role_unconfirmed":
      return `Подтвердите или отклоните предложенную роль для ${applicant}.`;
  }

  const exhaustive: never = finding.code;
  return exhaustive;
}

function localizedTextReviewReason(finding: TextIntakeReviewFinding): string {
  switch (finding.code) {
    case "missing_required_text":
      return "Без обязательного поля оператор не получит полный текст анкеты.";
    case "placeholder_text":
      return "Временное значение выглядит заполненным, но не подтверждает реальные данные.";
    case "missing_conditional_text":
      return "Выбранный вариант требует дополнительного текстового уточнения.";
    case "submission_applicant_country_mismatch":
      return "Разная страна в заявке и анкете может отправить пакет по неверному маршруту.";
    case "submission_applicant_city_mismatch":
      return "Разный город может привести к ошибке записи или консульского маршрута.";
    case "name_too_short":
      return "Неполное ФИО трудно сверить с паспортом при ручной проверке.";
    case "invalid_email":
      return "Некорректный email нельзя надежно использовать для связи или сверки.";
    case "weak_phone":
      return "Короткий телефон обычно означает неполный контакт.";
    case "weak_passport_number":
      return "Короткий номер паспорта похож на частичную копию или опечатку.";
    case "passport_number_unexpected_format":
      return "Нестандартный формат паспорта нужно сверить с документом вручную.";
    case "invalid_birth_date":
      return "Дата должна быть машинно читаемой для дальнейших проверок.";
    case "birth_date_in_future":
      return "Будущая дата рождения почти всегда означает ошибку ввода.";
    case "invalid_date_format":
      return "Дата не может быть надежно сравнена или выгружена в текущем формате.";
    case "passport_issued_after_expiry":
      return "Диапазон дат паспорта внутренне противоречив.";
    case "passport_expired_before_travel":
      return "Истекший до поездки паспорт может заблокировать передачу или вызвать возврат.";
    case "passport_validity_too_short_after_departure":
      return "Запас срока действия паспорта после выезда требует ручного подтверждения.";
    case "passport_validity_period_unexpected":
      return "Необычно длинный срок действия паспорта часто связан с ошибкой даты.";
    case "trip_dates_not_machine_readable":
      return "Даты поездки нельзя сравнить без машинно читаемого значения.";
    case "travel_date_outside_trip_dates":
      return "Дата заявки и диапазон поездки заявителя противоречат друг другу.";
    case "date_order_inconsistent":
      return "Порядок дат влияет на длительность и корректность маршрута.";
    case "duration_dates_mismatch":
      return "Длительность должна совпадать с датами въезда и выезда.";
    case "non_numeric_duration":
      return "Длительность нужна как число для сверки и выгрузки.";
    case "latin_text_expected":
      return "Паспортные поля обычно сверяются по латинскому написанию из документа.";
    case "home_address_incomplete":
      return "Адрес должен быть достаточно подробным для сверки с документами.";
    case "host_country_unexpected":
      return "Страна принимающей стороны должна совпадать с ожидаемым маршрутом.";
    case "spanish_host_postal_invalid":
      return "Испанский почтовый индекс должен быть проверяемым перед передачей.";
    case "spanish_host_phone_unexpected":
      return "Телефон принимающей стороны нужно сверить с ожидаемым форматом.";
    case "appointment_after_travel_date":
      return "Запись после даты поездки может сделать маршрут невозможным.";
    case "minor_occupation_age_mismatch":
      return "Возраст и статус занятости должны быть согласованы.";
    case "employer_contact_matches_applicant":
      return "Совпадение контактов работодателя и заявителя может быть ошибкой копирования.";
    case "employer_address_matches_home":
      return "Совпадение адресов работодателя и дома требует подтверждения.";
    case "residence_submission_city_mismatch":
      return "Город проживания влияет на выбранный центр подачи.";
    case "duplicate_passport":
      return "Одинаковые номера паспортов обычно означают скопированные данные.";
    case "shared_contact_requires_review":
      return "Общие контакты могут быть валидны, но должны быть намеренно подтверждены.";
    case "family_trip_mismatch":
      return "Разные даты в семейной заявке требуют ручного подтверждения маршрута.";
    case "family_role_unconfirmed":
      return "Предложенная ИИ семейная роль является подсказкой и требует подтверждения.";
  }

  const exhaustive: never = finding.code;
  return exhaustive;
}

function localizedTextReviewFinding(
  finding: TextIntakeReviewFinding,
): TextIntakeReviewFinding {
  return {
    ...finding,
    problem: localizedTextReviewProblem(finding),
    reason: localizedTextReviewReason(finding),
    requiredAction: localizedTextReviewAction(finding),
  };
}

function buildOperatorSummary(review: TextIntakeReviewResult): string[] {
  if (!review.findings.length) {
    return [
      "Явных текстовых блокеров в анкете не найдено.",
      "Продолжайте проверку медиа и deterministic preflight перед ручным принятием.",
    ];
  }

  const blockingCount = review.findings.filter(
    (finding) => finding.severity === "blocking",
  ).length;
  const warningCount = review.findings.filter(
    (finding) => finding.severity === "warning",
  ).length;
  const infoCount = review.findings.filter(
    (finding) => finding.severity === "info",
  ).length;
  const firstFinding = sortTextReviewFindings(review.findings)[0];
  const countSummary = [
    `блокеров ${blockingCount}`,
    `предупреждений ${warningCount}`,
    infoCount ? `информационных ${infoCount}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  return [
    `Текст анкеты: ${countSummary}.`,
    `Первым проверьте: ${findingTarget(firstFinding)} — ${firstFinding.problem}`,
    blockingCount
      ? "Верните точечные замечания до ручного принятия оператором."
      : "Подтвердите предупреждения вручную; это не решение по исходу визы.",
  ];
}

function buildAgentFollowUpDrafts(review: TextIntakeReviewResult): string[] {
  if (!review.correctionCandidates.length) {
    return [];
  }

  return sortTextReviewFindings(review.findings)
    .slice(0, 5)
    .map(
      (finding) =>
        `${findingTarget(finding)}: проблема — ${finding.problem} Действие — ${finding.requiredAction}`,
    );
}

export function buildTextIntakeReviewDisplay(
  review: TextIntakeReviewResult,
): TextIntakeReviewDisplay {
  const findings = sortTextReviewFindings(review.findings).map(
    localizedTextReviewFinding,
  );
  const correctionCandidatesById = new Map(
    review.correctionCandidates.map((candidate) => [candidate.id, candidate]),
  );
  const correctionCandidates = findings.flatMap((finding) => {
    const candidate = correctionCandidatesById.get(`text-review:${finding.id}`);
    return candidate
      ? [
          {
            ...candidate,
            text: `${finding.problem} ${finding.requiredAction}`,
          },
        ]
      : [];
  });
  const displayReview: TextIntakeReviewResult = {
    ...review,
    findings,
    correctionCandidates,
  };

  return {
    review: displayReview,
    topFindings: findings.slice(0, 4),
    blockingFindings: findings.filter(
      (finding) => finding.severity === "blocking",
    ),
    operatorSummary: buildOperatorSummary(displayReview),
    agentFollowUpDrafts: buildAgentFollowUpDrafts(displayReview),
  };
}
