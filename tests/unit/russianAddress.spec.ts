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
    ["пер садовый 7 под 2 оф 9", "переулок Садовый дом 7, подъезд 2, офис 9"],
    ["наб реки фонтанки 10 корп 2", "набережная Реки фонтанки дом 10, корпус 2"],
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
});
