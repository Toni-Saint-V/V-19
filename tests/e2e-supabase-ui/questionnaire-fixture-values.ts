const preferredOptions: Record<string, string> = {
  "Город подачи": "Москва",
  "Тип визы": "Шенгенская",
  "Категория обслуживания": "Normal",
  "Страна рождения": "Russian Federation",
  "Текущее гражданство": "Russian Federation",
  "Пол": "Мужской",
  "Семейное положение": "Холост/не замужем",
  "Тип документа": "Ordinary Passport",
  "Страна выдачи": "Russian Federation",
  "Страна проживания": "Russian Federation",
  "Проживание не в стране гражданства": "Нет",
  "Профессия": "IT PROFESSIONAL",
  "Цель поездки": "TOURISM",
  "Основная страна назначения": "Spain",
  "Страна первого въезда": "Spain",
  "Количество въездов": "Однократная",
  "Отпечатки ранее сдавались": "Нет",
  "Тип принимающей стороны": "Гостиница/временное жилье",
  "Страна": "Spain",
  "Кто оплачивает поездку": "Сам заявитель",
  "Средства заявителя": "Наличные",
};

export function questionnaireFixturePreferredOption(label: string) {
  return preferredOptions[label];
}

export function questionnaireFixtureTextValue(
  label: string,
  runId: string,
  index: number,
  sectionLabel = "",
) {
  const normalizedLabel = label.toLocaleLowerCase("ru-RU");

  if (label === "Желаемая дата 1") return "01.12.2026";
  if (label === "Дата рождения") return "01.01.1990";
  if (label === "Дата выдачи") return "01.01.2020";
  if (label === "Действителен до") return "01.01.2030";
  if (label === "Дата въезда") return "15.01.2027";
  if (label === "Дата выезда") return "22.01.2027";
  if (label === "Фамилия") return `Sandbox-${index + 1}`;
  if (label === "Имя") return "E2E";
  if (label.includes("Номер паспорта")) {
    return String(800_000_000 + index).slice(0, 9);
  }
  if (label === "Место рождения") return "Санкт-Петербург";
  if (label === "Место выдачи") return "MOSCOW";
  if (label === "Город проживания") return "MOSCOW";
  if (label === "Город") return "MADRID";
  if (label === "Домашний адрес") return "TEST STREET 1";
  if (label === "Адрес") return "CALLE TEST 10, MADRID";
  if (label === "Почтовый индекс") {
    return sectionLabel.includes("Отель") ? "28013" : "101000";
  }
  if (label === "Работодатель / учебное заведение") return "V19 E2E COMPANY";
  if (label === "ФИО приглашающего лица или название отеля") {
    return "V19 E2E HOTEL";
  }
  if (normalizedLabel.includes("email") || label.includes("Почта")) {
    return `sandbox-${runId.replace(/[^a-z0-9]/gi, "-")}@example.com`;
  }
  if (label.includes("Телефон")) return "9000000000";
  if (normalizedLabel.includes("дата") || normalizedLabel.includes("действител")) {
    return "01.01.2026";
  }
  if (normalizedLabel.includes("индекс") || normalizedLabel.includes("код")) {
    return "101000";
  }
  return `Sandbox ${runId} ${index + 1}`;
}
