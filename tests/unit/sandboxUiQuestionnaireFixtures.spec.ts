import { describe, expect, it } from "vitest";

import {
  questionnaireFixturePreferredOption,
  questionnaireFixtureTextValue,
} from "../e2e-supabase-ui/questionnaire-fixture-values";

describe("sandbox UI questionnaire fixtures", () => {
  it("keeps the synthetic applicant and trip chronology valid", () => {
    expect(questionnaireFixtureTextValue("Дата рождения", "run", 0)).toBe(
      "01.01.1990",
    );
    expect(questionnaireFixtureTextValue("Дата выдачи", "run", 0)).toBe(
      "01.01.2020",
    );
    expect(questionnaireFixtureTextValue("Действителен до", "run", 0)).toBe(
      "01.01.2030",
    );
    expect(questionnaireFixtureTextValue("Дата въезда", "run", 0)).toBe(
      "15.01.2027",
    );
    expect(questionnaireFixtureTextValue("Дата выезда", "run", 0)).toBe(
      "22.01.2027",
    );
    expect(questionnaireFixtureTextValue("Место рождения", "run", 0)).toBe(
      "Санкт-Петербург",
    );
    expect(
      questionnaireFixtureTextValue("Почтовый индекс", "run", 0, "Отель / приглашение"),
    ).toBe("28013");
    expect(questionnaireFixtureTextValue("Телефон", "run", 0)).toBe(
      "9000000000",
    );
  });

  it("chooses non-conditional happy-path options", () => {
    expect(questionnaireFixturePreferredOption("Проживание не в стране гражданства")).toBe(
      "Нет",
    );
    expect(questionnaireFixturePreferredOption("Отпечатки ранее сдавались")).toBe("Нет");
    expect(questionnaireFixturePreferredOption("Кто оплачивает поездку")).toBe(
      "Сам заявитель",
    );
    expect(questionnaireFixturePreferredOption("Тип принимающей стороны")).toBe(
      "Гостиница/временное жилье",
    );
  });
});
