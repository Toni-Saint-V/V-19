import { safeDiagnosticsForPersistenceError } from "../../services/persistenceObservability";

export class QuestionnaireValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuestionnaireValidationError";
  }
}

export function questionnaireSaveFailureMessage(error: unknown) {
  const rawMessage = error instanceof Error ? error.message.trim() : "";
  const normalized = rawMessage.toLocaleLowerCase("ru-RU");

  if (error instanceof QuestionnaireValidationError) {
    return rawMessage;
  }

  const diagnostics = safeDiagnosticsForPersistenceError(error);
  if (diagnostics?.supabaseCode === "40001" || diagnostics?.httpStatus === 409) {
    return "Подача была изменена в другом окне. Введённые данные остаются в анкете; обновите подачу и повторите сохранение.";
  }

  if (
    diagnostics?.kind === "rls" ||
    diagnostics?.supabaseCode === "42501" ||
    diagnostics?.httpStatus === 403
  ) {
    return "Нет доступа к этой подаче. Введённые данные остаются в анкете; обновите список подач или обратитесь к администратору.";
  }

  if (diagnostics?.retryable) {
    return "Нет соединения с сервером. Проверьте интернет и повторите сохранение — введённые данные остаются в анкете.";
  }

  if (
    /failed to fetch|load failed|network|networkerror|offline|соединени|сеть/.test(
      normalized,
    )
  ) {
    return "Нет соединения с сервером. Проверьте интернет и повторите сохранение — введённые данные остаются в анкете.";
  }

  if (/jwt|token|session|unauth|401|сесси/.test(normalized)) {
    return "Сессия завершилась. Введённые данные остаются в анкете; повторите сохранение после восстановления доступа.";
  }

  if (
    /forbidden|permission|row.level|not authorized|403|недоступна текущему агенту|нет доступа/.test(
      normalized,
    )
  ) {
    return "Нет доступа к этой подаче. Введённые данные остаются в анкете; обновите список подач или обратитесь к администратору.";
  }

  if (/conflict|409|already updated|изменилась|обновлена другим/.test(normalized)) {
    return "Подача была изменена в другом окне. Введённые данные остаются в анкете; обновите подачу и повторите сохранение.";
  }

  return "Сервис не подтвердил сохранение. Введённые данные остаются в анкете — повторите попытку или продолжите редактирование.";
}
