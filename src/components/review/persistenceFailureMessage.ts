export function persistenceFailureMessage(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message.toLocaleLowerCase() : "";
  if (
    message.includes("conflict") ||
    message.includes("revision") ||
    message.includes("stale")
  ) {
    return "Данные уже изменены другим администратором. Обновите подачу и проверьте её заново.";
  }
  if (
    message.includes("permission") ||
    message.includes("session") ||
    message.includes("auth")
  ) {
    return "Сессия или права доступа изменились. Войдите снова; подача не была изменена.";
  }
  return fallback;
}
