import { describe, expect, test } from "vitest";
import {
  normalizedRussianAddress,
  suggestedRussianAddress,
} from "../../src/modules/submissions/russianAddress";

describe("Russian questionnaire address suggestions", () => {
  test.each([
    [
      "прНовочеркаский56 2 34",
      "проспект Новочеркаский дом 56, корпус 2, квартира 34",
    ],
    ["ул ленина д 5 кв 12", "улица Ленина дом 5, квартира 12"],
    ["просп. Мира 10", "проспект Мира дом 10"],
    ["ул. К. Маркса, д. 5", "улица К. Маркса дом 5"],
    ["пер. Д. Бедного, д. 5", "переулок Д. Бедного дом 5"],
    ["пер садовый 7 под 2 оф 9", "переулок Садовый дом 7, подъезд 2, офис 9"],
    ["наб реки фонтанки 10 корп 2", "набережная Реки фонтанки дом 10, корпус 2"],
    ["шоссе Энтузиастов 10", "шоссе Энтузиастов дом 10"],
    ["проезд Заводской 7", "проезд Заводской дом 7"],
    ["площадь Победы 1", "площадь Победы дом 1"],
    ["бульвар Рокоссовского 3", "бульвар Рокоссовского дом 3"],
    ["ул ленина д 5 пом 4", "улица Ленина дом 5, помещение 4"],
  ])("normalizes %s", (source, expected) => {
    expect(normalizedRussianAddress(source)).toBe(expected);
    expect(suggestedRussianAddress(source)).toBe(expected);
  });

  test("does not suggest before a number or for an already normalized address", () => {
    expect(suggestedRussianAddress("ул Новочеркасская")).toBeUndefined();
    expect(
      suggestedRussianAddress(
        "проспект Новочеркаский дом 56, корпус 2, квартира 34",
      ),
    ).toBeUndefined();
  });

  test("preserves unsupported address suffixes instead of dropping their values", () => {
    const source = "ул Ленина 5 корп 1 кв 12 этаж 3";
    const expected = "улица Ленина дом 5, корпус 1, квартира 12, этаж 3";

    expect(normalizedRussianAddress(source)).toBe(expected);
    expect(suggestedRussianAddress(source)).toBe(expected);
  });
});
