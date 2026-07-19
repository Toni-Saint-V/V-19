import { normalizedRussianAddress } from "./russianAddress";

export type StructuredQuestionnaireHomeAddress = {
  homeBuilding: string;
  homeHouse: string;
  homeStreet: string;
  homeUnit: string;
};

export function structuredQuestionnaireHomeAddressFromText(
  value: string,
): StructuredQuestionnaireHomeAddress | undefined {
  const normalized = normalizedRussianAddress(value);
  const houseMatch = normalized.match(/^(.+?)\s+дом\s+([^,]+)(?:,\s*(.+))?$/iu);
  if (!houseMatch?.[1] || !houseMatch[2]) return undefined;

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
