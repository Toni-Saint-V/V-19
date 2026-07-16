const addressPartLabels = [
  "дом",
  "корпус",
  "строение",
  "квартира",
  "подъезд",
  "офис",
] as const;

type AddressPartLabel = (typeof addressPartLabels)[number];

const addressPartLabelSet = new Set<string>(addressPartLabels);

function expandAddressAbbreviations(value: string) {
  return value
    .trim()
    .replace(
      /^(?!(?:просп(?:ект)?\.?|улица|переулок|набережная)(?=\s|,|$))(просп|пр(?:-?т)?|ул|пер|наб)\.?(?=[\p{L}])/iu,
      "$1 ",
    )
    .replace(/([\p{L}])(?=\d)/gu, "$1 ")
    .replace(/(^|[\s,])ул\.?(?=\s|,|$)\s*/giu, "$1улица ")
    .replace(
      /(^|[\s,])(?:просп(?:ект)?|пр(?:-?т)?)\.?(?=\s|,|$)\s*/giu,
      "$1проспект ",
    )
    .replace(/(^|[\s,])пер\.?(?=\s|,|$)\s*/giu, "$1переулок ")
    .replace(/(^|[\s,])наб\.?(?=\s|,|$)\s*/giu, "$1набережная ")
    .replace(/(^|[\s,])д\.?(?=\s*\d|,|$)\s*/giu, "$1дом ")
    .replace(/(^|[\s,])корп\.?(?=\s|\d|,|$)\s*/giu, "$1корпус ")
    .replace(/(^|[\s,])к\.?(?=\s*\d|,|$)\s*/giu, "$1корпус ")
    .replace(/(^|[\s,])стр\.?(?=\s|\d|,|$)\s*/giu, "$1строение ")
    .replace(/(^|[\s,])кв\.?(?=\s|\d|,|$)\s*/giu, "$1квартира ")
    .replace(/(^|[\s,])под\.?(?=\s|\d|,|$)\s*/giu, "$1подъезд ")
    .replace(/(^|[\s,])оф\.?(?=\s|\d|,|$)\s*/giu, "$1офис ")
    .replace(/[\s,]+/g, " ")
    .trim();
}

function nextInferredLabel(
  parts: Partial<Record<AddressPartLabel, string[]>>,
): AddressPartLabel | undefined {
  if (!parts.дом?.length) return "дом";
  if (!parts.корпус?.length) return "корпус";
  if (!parts.квартира?.length) return "квартира";
  return undefined;
}

function capitalized(value: string) {
  return value ? `${value[0]?.toLocaleUpperCase("ru-RU")}${value.slice(1)}` : value;
}

export function normalizedRussianAddress(value: string) {
  const expanded = expandAddressAbbreviations(value);
  const streetMatch = expanded.match(
    /^(улица|проспект|переулок|набережная)\s+(.+)$/iu,
  );
  if (!streetMatch || !/\d/u.test(expanded)) return expanded;

  const streetType = streetMatch[1]?.toLocaleLowerCase("ru-RU");
  const tokens = (streetMatch[2] ?? "").split(/\s+/u).filter(Boolean);
  const firstAddressPartIndex = tokens.findIndex(
    (token) =>
      addressPartLabelSet.has(token.toLocaleLowerCase("ru-RU")) ||
      /\d/u.test(token),
  );
  if (!streetType || firstAddressPartIndex <= 0) return expanded;

  const streetName = tokens.slice(0, firstAddressPartIndex).join(" ");
  const parts: Partial<Record<AddressPartLabel, string[]>> = {};
  const unsupportedSuffix: string[] = [];
  let currentLabel: AddressPartLabel | undefined;

  for (const token of tokens.slice(firstAddressPartIndex)) {
    if (unsupportedSuffix.length) {
      unsupportedSuffix.push(token);
      continue;
    }

    const normalizedToken = token.toLocaleLowerCase("ru-RU");
    if (addressPartLabelSet.has(normalizedToken)) {
      currentLabel = normalizedToken as AddressPartLabel;
      parts[currentLabel] ??= [];
      continue;
    }

    if (/\d/u.test(token) && (!currentLabel || parts[currentLabel]?.length)) {
      const nextLabel = nextInferredLabel(parts);
      if (!nextLabel) {
        unsupportedSuffix.push(token);
        currentLabel = undefined;
        continue;
      }
      currentLabel = nextLabel;
    }

    if (!currentLabel) {
      unsupportedSuffix.push(token);
      continue;
    }

    if (!/\d/u.test(token) && parts[currentLabel]?.length) {
      unsupportedSuffix.push(token);
      currentLabel = undefined;
      continue;
    }

    parts[currentLabel] ??= [];
    parts[currentLabel]?.push(token);
  }

  const formattedParts = addressPartLabels
    .filter((label) => parts[label]?.length)
    .map((label) => `${label} ${parts[label]?.join(" ")}`);
  if (!formattedParts.length) return expanded;

  const normalized = `${streetType} ${capitalized(streetName)} ${formattedParts[0]}${formattedParts
    .slice(1)
    .map((part) => `, ${part}`)
    .join("")}`;

  return unsupportedSuffix.length
    ? `${normalized}, ${unsupportedSuffix.join(" ")}`
    : normalized;
}

export function suggestedRussianAddress(value: string) {
  if (!/\d/u.test(value)) return undefined;
  const normalized = normalizedRussianAddress(value);
  const source = value.trim().replace(/\s{2,}/gu, " ");
  return normalized && normalized !== source ? normalized : undefined;
}
