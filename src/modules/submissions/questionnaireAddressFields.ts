import { normalizedRussianAddress } from "./russianAddress";

export type StructuredQuestionnaireHomeAddress = {
  homeBuilding: string;
  homeHouse: string;
  homeStreet: string;
  homeUnit: string;
};

export type CanonicalQuestionnaireHomeAddress =
  StructuredQuestionnaireHomeAddress & {
    homeAddress?: string | null;
  };

export function structuredQuestionnaireHomeAddressFromText(
  value: string,
): StructuredQuestionnaireHomeAddress | undefined {
  const normalized = normalizedRussianAddress(value);
  const houseMatch = normalized.match(/^(.+?)\s+дом\s+([^,]+)(?:,\s*(.+))?$/iu);
  if (!houseMatch?.[1] || !houseMatch[2]) {
    return structuredInternationalHomeAddressFromText(value);
  }

  const buildingParts: string[] = [];
  const unitParts: string[] = [];
  for (const part of (houseMatch[3] ?? "").split(/,\s*/u).filter(Boolean)) {
    if (/^(?:корпус|строение)\s+/iu.test(part)) {
      buildingParts.push(part);
      continue;
    }
    unitParts.push(part);
  }

  const homeBuilding =
    buildingParts.length === 1
      ? buildingParts[0]?.replace(/^корпус\s+/iu, "") ?? ""
      : buildingParts.join(", ");
  const homeUnit =
    unitParts.length === 1
      ? unitParts[0]?.replace(/^квартира\s+/iu, "") ?? ""
      : unitParts.join(", ");

  return {
    homeBuilding,
    homeHouse: houseMatch[2].trim(),
    homeStreet: houseMatch[1].trim(),
    homeUnit,
  };
}

function structuredInternationalHomeAddressFromText(
  value: string,
): StructuredQuestionnaireHomeAddress | undefined {
  const parts = value
    .trim()
    .split(/\s*,\s*/u)
    .map((part) => part.trim())
    .filter(Boolean);
  const primary = parts[0] ?? "";
  if (!primary) return undefined;

  const houseFirst = primary.match(/^(\d[\p{L}\d/-]*)\s+(.+)$/u);
  const streetFirst = primary.match(/^(.+?)\s+(\d[\p{L}\d/-]*)$/u);
  const commaHouse =
    !houseFirst && !streetFirst
      ? parts[1]?.match(/^(\d[\p{L}\d/-]*)$/u)
      : undefined;

  const homeStreet = commaHouse
    ? primary
    : houseFirst?.[2]?.trim() || streetFirst?.[1]?.trim() || "";
  const homeHouse =
    commaHouse?.[1] || houseFirst?.[1]?.trim() || streetFirst?.[2]?.trim() || "";
  if (!homeStreet || !homeHouse) return undefined;

  const suffixParts = parts.slice(commaHouse ? 2 : 1);
  const buildingParts: string[] = [];
  const unitParts: string[] = [];
  for (const part of suffixParts) {
    if (/^(?:building|block|bldg|корпус|строение)\b/iu.test(part)) {
      buildingParts.push(part);
      continue;
    }
    unitParts.push(part);
  }

  return {
    homeBuilding: buildingParts.join(", "),
    homeHouse,
    homeStreet,
    homeUnit: unitParts.join(", "),
  };
}

function prefixedAddressPart(value: string, prefix: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^[а-яa-z]+[.\s]/i.test(trimmed)) return trimmed;
  return `${prefix} ${trimmed}`;
}

export function composeQuestionnaireHomeAddress(
  data: StructuredQuestionnaireHomeAddress,
) {
  return [
    data.homeStreet.trim(),
    prefixedAddressPart(data.homeHouse, "д"),
    prefixedAddressPart(data.homeBuilding, "корп"),
    prefixedAddressPart(data.homeUnit, "кв"),
  ]
    .filter(Boolean)
    .join(", ");
}

const questionnaireTransliteration: Record<string, string> = {
  А: "A", Б: "B", В: "V", Г: "G", Д: "D", Е: "E", Ё: "E", Ж: "Zh",
  З: "Z", И: "I", Й: "Y", К: "K", Л: "L", М: "M", Н: "N", О: "O",
  П: "P", Р: "R", С: "S", Т: "T", У: "U", Ф: "F", Х: "Kh", Ц: "Ts",
  Ч: "Ch", Ш: "Sh", Щ: "Shch", Ъ: "", Ы: "Y", Ь: "", Э: "E", Ю: "Yu",
  Я: "Ya", а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e",
  ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n",
  о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh",
  ц: "ts", ч: "ch", ш: "sh", щ: "shch", ъ: "", ы: "y", ь: "", э: "e",
  ю: "yu", я: "ya",
};

export function transliterateQuestionnaireText(value: string) {
  return [...value]
    .map((character) => questionnaireTransliteration[character] ?? character)
    .join("");
}

export function latinQuestionnaireHomeAddressParts(
  data: StructuredQuestionnaireHomeAddress,
): StructuredQuestionnaireHomeAddress {
  return {
    homeBuilding: transliterateQuestionnaireText(data.homeBuilding),
    homeHouse: transliterateQuestionnaireText(data.homeHouse),
    homeStreet: transliterateQuestionnaireText(data.homeStreet),
    homeUnit: transliterateQuestionnaireText(data.homeUnit),
  };
}

function prefixedLatinAddressPart(value: string, prefix: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^[a-z]+[.\s]/iu.test(trimmed)) return trimmed;
  return `${prefix} ${trimmed}`;
}

export function composeLatinQuestionnaireHomeAddress(
  data: StructuredQuestionnaireHomeAddress,
) {
  const latin = latinQuestionnaireHomeAddressParts(data);
  return [
    latin.homeStreet.trim(),
    latin.homeHouse.trim(),
    prefixedLatinAddressPart(latin.homeBuilding, "bldg."),
    prefixedLatinAddressPart(latin.homeUnit, "apt."),
  ]
    .filter(Boolean)
    .join(", ");
}

export function latinQuestionnaireHomeAddressFromText(value: string) {
  const structured = structuredQuestionnaireHomeAddressFromText(value);
  return structured
    ? composeLatinQuestionnaireHomeAddress(structured)
    : transliterateQuestionnaireText(value);
}

export function canonicalQuestionnaireHomeAddress(
  data: CanonicalQuestionnaireHomeAddress,
) {
  return data.homeAddress?.trim() || composeQuestionnaireHomeAddress(data);
}
