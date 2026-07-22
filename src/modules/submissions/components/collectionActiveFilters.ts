import type { CollectionActiveFilter } from "./CollectionPrimitives";

export function compactActiveFilters(
  filters: Array<CollectionActiveFilter | false | null | undefined>,
): CollectionActiveFilter[] {
  return filters.filter((filter): filter is CollectionActiveFilter => Boolean(filter));
}
