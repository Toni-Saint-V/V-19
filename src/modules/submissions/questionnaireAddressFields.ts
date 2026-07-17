export type StructuredQuestionnaireHomeAddress = {
  homeBuilding: string;
  homeHouse: string;
  homeStreet: string;
  homeUnit: string;
};

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
