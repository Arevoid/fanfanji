import type { HomeScreenItem, HomeScreenPosition } from "../../types";

export type HomeItemSize = HomeScreenItem["size"];
export const HOME_GRID_COLUMNS = 4;
export const HOME_GRID_ROWS = 4;
export const MAX_HOME_GRID_ROWS = 12;
export const MAX_HOME_PAGES = 20;

const normalizeRowCount = (rowCount: number) =>
  Math.max(HOME_GRID_ROWS, Math.min(MAX_HOME_GRID_ROWS, Math.floor(rowCount) || HOME_GRID_ROWS));

export const getResponsiveHomeGridRowCount = (input: {
  containerHeight: number;
  paddingTop: number;
  paddingBottom: number;
  rowHeight: number;
  rowGap: number;
}) => {
  const usableHeight = Math.max(0, input.containerHeight - input.paddingTop - input.paddingBottom);
  if (!Number.isFinite(usableHeight) || !Number.isFinite(input.rowHeight) || input.rowHeight <= 0) {
    return HOME_GRID_ROWS;
  }
  const rowGap = Math.max(0, Number.isFinite(input.rowGap) ? input.rowGap : 0);
  return normalizeRowCount(Math.floor((usableHeight + rowGap) / (input.rowHeight + rowGap)));
};

export const getItemSpan = (size: HomeItemSize) => {
  switch (size) {
    case "2x2": return { width: 2, height: 2 };
    case "1x4": return { width: 4, height: 1 };
    case "2x3": return { width: 3, height: 2 };
    case "2x4": return { width: 4, height: 2 };
    default: return { width: 1, height: 1 };
  }
};

export const getHomeItemDimensions = getItemSpan;

const isInteger = (value: number) => Number.isFinite(value) && Number.isInteger(value);

export const isValidHomePosition = (
  position: HomeScreenPosition | undefined,
  size: HomeItemSize,
  rowCount = MAX_HOME_GRID_ROWS,
): position is HomeScreenPosition => {
  if (!position
    || !isInteger(position.page)
    || !isInteger(position.row)
    || !isInteger(position.column)
    || position.page < 0
    || position.page >= MAX_HOME_PAGES
    || position.row < 0
    || position.column < 0) return false;
  const { width, height } = getItemSpan(size);
  return position.column + width <= HOME_GRID_COLUMNS
    && position.row + height <= normalizeRowCount(rowCount);
};

export type HomeOccupancy = Array<Array<string | null>>;

const emptyOccupancy = (rowCount: number): HomeOccupancy =>
  Array.from({ length: normalizeRowCount(rowCount) }, () =>
    Array<string | null>(HOME_GRID_COLUMNS).fill(null));

const fillOccupancy = (
  occupancy: HomeOccupancy,
  itemId: string,
  position: HomeScreenPosition,
  size: HomeItemSize,
) => {
  const { width, height } = getItemSpan(size);
  for (let row = position.row; row < position.row + height; row += 1) {
    for (let column = position.column; column < position.column + width; column += 1) {
      occupancy[row][column] = itemId;
    }
  }
};

export const buildOccupancy = (
  items: readonly HomeScreenItem[],
  page: number,
  ignoreItemId?: string,
  rowCount = MAX_HOME_GRID_ROWS,
): HomeOccupancy => {
  const occupancy = emptyOccupancy(rowCount);
  for (const item of items) {
    if (item.id === ignoreItemId
      || !item.position
      || item.position.page !== page
      || !isValidHomePosition(item.position, item.size, rowCount)) continue;
    const { width, height } = getItemSpan(item.size);
    let free = true;
    for (let row = item.position.row; row < item.position.row + height && free; row += 1) {
      for (let column = item.position.column; column < item.position.column + width; column += 1) {
        if (occupancy[row][column]) {
          free = false;
          break;
        }
      }
    }
    if (free) fillOccupancy(occupancy, item.id, item.position, item.size);
  }
  return occupancy;
};

export const getOverlappingItemIds = (
  items: readonly HomeScreenItem[],
  item: Pick<HomeScreenItem, "id" | "size">,
  position: HomeScreenPosition,
  rowCount = MAX_HOME_GRID_ROWS,
): string[] => {
  if (!isValidHomePosition(position, item.size, rowCount)) return [];
  const occupancy = buildOccupancy(items, position.page, item.id, rowCount);
  const { width, height } = getItemSpan(item.size);
  const ids = new Set<string>();
  for (let row = position.row; row < position.row + height; row += 1) {
    for (let column = position.column; column < position.column + width; column += 1) {
      const occupiedBy = occupancy[row][column];
      if (occupiedBy) ids.add(occupiedBy);
    }
  }
  return [...ids];
};

export const canPlaceAt = (
  items: readonly HomeScreenItem[],
  item: Pick<HomeScreenItem, "id" | "size">,
  position: HomeScreenPosition,
  rowCount = MAX_HOME_GRID_ROWS,
): boolean =>
  isValidHomePosition(position, item.size, rowCount)
  && getOverlappingItemIds(items, item, position, rowCount).length === 0;

export const findFirstAvailablePosition = (
  items: readonly HomeScreenItem[],
  size: HomeItemSize,
  startPage = 0,
  rowCount = MAX_HOME_GRID_ROWS,
): HomeScreenPosition | undefined => {
  const firstPage = Math.max(0, Math.min(MAX_HOME_PAGES - 1, Math.floor(startPage) || 0));
  const probe = { id: "__home-position-probe__", size };
  const { width, height } = getItemSpan(size);
  const normalizedRows = normalizeRowCount(rowCount);
  for (let page = firstPage; page < MAX_HOME_PAGES; page += 1) {
    for (let row = 0; row + height <= normalizedRows; row += 1) {
      for (let column = 0; column + width <= HOME_GRID_COLUMNS; column += 1) {
        const position = { page, row, column };
        if (canPlaceAt(items, probe, position, normalizedRows)) return position;
      }
    }
  }
  return undefined;
};

export const placeItemAt = (
  items: readonly HomeScreenItem[],
  itemId: string,
  position: HomeScreenPosition,
  rowCount = MAX_HOME_GRID_ROWS,
): HomeScreenItem[] => {
  const item = items.find((candidate) => candidate.id === itemId);
  if (!item || !canPlaceAt(items, item, position, rowCount)) return [...items];
  return items.map((candidate) => candidate.id === itemId
    ? { ...candidate, page: position.page, position: { ...position } }
    : candidate);
};

const findNearestAvailablePosition = (
  items: readonly HomeScreenItem[],
  item: Pick<HomeScreenItem, "id" | "size">,
  origin: HomeScreenPosition,
  preferredPosition: HomeScreenPosition | undefined,
  rowCount: number,
): HomeScreenPosition | undefined => {
  if (preferredPosition && canPlaceAt(items, item, preferredPosition, rowCount)) {
    return preferredPosition;
  }
  const { width, height } = getItemSpan(item.size);
  const normalizedRows = normalizeRowCount(rowCount);
  const candidates: HomeScreenPosition[] = [];
  for (let page = 0; page < MAX_HOME_PAGES; page += 1) {
    for (let row = 0; row + height <= normalizedRows; row += 1) {
      for (let column = 0; column + width <= HOME_GRID_COLUMNS; column += 1) {
        candidates.push({ page, row, column });
      }
    }
  }
  candidates.sort((left, right) => {
    const leftPageDistance = Math.abs(left.page - origin.page);
    const rightPageDistance = Math.abs(right.page - origin.page);
    if (leftPageDistance !== rightPageDistance) return leftPageDistance - rightPageDistance;
    const leftCellDistance = Math.abs(left.row - origin.row) + Math.abs(left.column - origin.column);
    const rightCellDistance = Math.abs(right.row - origin.row) + Math.abs(right.column - origin.column);
    if (leftCellDistance !== rightCellDistance) return leftCellDistance - rightCellDistance;
    return left.page - right.page || left.row - right.row || left.column - right.column;
  });
  return candidates.find((position) => canPlaceAt(items, item, position, normalizedRows));
};

/**
 * Places the dragged item at the requested target and moves only the items
 * directly covered by that target. Existing unrelated items never compact.
 */
export const placeItemWithDisplacement = (
  items: readonly HomeScreenItem[],
  itemId: string,
  target: HomeScreenPosition,
  rowCount = MAX_HOME_GRID_ROWS,
): HomeScreenItem[] => {
  const item = items.find((candidate) => candidate.id === itemId);
  if (!item || !item.position || !isValidHomePosition(target, item.size, rowCount)) return [...items];
  const overlappingIds = getOverlappingItemIds(items, item, target, rowCount);
  if (overlappingIds.length === 0) return placeItemAt(items, itemId, target, rowCount);

  const overlappingItems = overlappingIds
    .map((id) => items.find((candidate) => candidate.id === id))
    .filter((candidate): candidate is HomeScreenItem => Boolean(candidate?.position));
  if (overlappingItems.length !== overlappingIds.length) return [...items];

  const movingIds = new Set([itemId, ...overlappingIds]);
  const placed = items.filter((candidate) => !movingIds.has(candidate.id));
  placed.push({ ...item, page: target.page, position: { ...target } });

  const nextPositions = new Map<string, HomeScreenPosition>([[itemId, { ...target }]]);
  for (const displaced of overlappingItems) {
    const nextPosition = findNearestAvailablePosition(
      placed,
      displaced,
      displaced.position!,
      item.position,
      rowCount,
    );
    if (!nextPosition) return [...items];
    nextPositions.set(displaced.id, nextPosition);
    placed.push({ ...displaced, page: nextPosition.page, position: { ...nextPosition } });
  }

  return items.map((candidate) => {
    const position = nextPositions.get(candidate.id);
    return position
      ? { ...candidate, page: position.page, position: { ...position } }
      : candidate;
  });
};

export const swapOneByOneItems = (
  items: readonly HomeScreenItem[],
  firstId: string,
  secondId: string,
): HomeScreenItem[] => {
  const first = items.find((item) => item.id === firstId);
  const second = items.find((item) => item.id === secondId);
  if (!first || !second || first.id === second.id
    || !first.position || !second.position
    || first.size !== "1x1" || second.size !== "1x1") return [...items];
  const firstPosition = { ...first.position };
  const secondPosition = { ...second.position };
  return items.map((item) => {
    if (item.id === firstId) return { ...item, page: secondPosition.page, position: secondPosition };
    if (item.id === secondId) return { ...item, page: firstPosition.page, position: firstPosition };
    return item;
  });
};

const findLegacySparsePosition = (
  placed: readonly HomeScreenItem[],
  size: HomeItemSize,
  page: number,
  cursor: { row: number; column: number },
  rowCount: number,
): HomeScreenPosition | undefined => {
  const probe = { id: "__legacy-probe__", size };
  const { width, height } = getItemSpan(size);
  let row = cursor.row;
  let column = cursor.column;
  while (row + height <= rowCount) {
    if (column + width > HOME_GRID_COLUMNS) {
      row += 1;
      column = 0;
      continue;
    }
    const position = { page, row, column };
    if (canPlaceAt(placed, probe, position, rowCount)) return position;
    column += 1;
    if (column >= HOME_GRID_COLUMNS) {
      row += 1;
      column = 0;
    }
  }
  return undefined;
};

const advanceLegacyCursor = (
  position: HomeScreenPosition,
  size: HomeItemSize,
): { row: number; column: number } => {
  const { width } = getItemSpan(size);
  const nextColumn = position.column + width;
  return nextColumn >= HOME_GRID_COLUMNS
    ? { row: position.row + 1, column: 0 }
    : { row: position.row, column: nextColumn };
};

/**
 * Converts legacy array-order/CSS-auto-flow layouts once. Valid explicit
 * positions remain untouched; invalid, colliding, or missing positions are
 * repaired deterministically without ever saving pixel coordinates.
 */
export const migrateLegacyHomeScreenLayout = (
  sourceItems: readonly HomeScreenItem[],
  rowCount = MAX_HOME_GRID_ROWS,
): HomeScreenItem[] => {
  const normalizedRows = normalizeRowCount(rowCount);
  const uniqueItems: HomeScreenItem[] = [];
  const seenIds = new Set<string>();
  for (const item of sourceItems) {
    if (!item || typeof item.id !== "string" || !item.id || seenIds.has(item.id)) continue;
    seenIds.add(item.id);
    uniqueItems.push({ ...item });
  }

  const placed: HomeScreenItem[] = [];
  const reservedIds = new Set<string>();
  for (const item of uniqueItems) {
    if (!isValidHomePosition(item.position, item.size, normalizedRows)) continue;
    const normalized = { ...item, page: item.position.page, position: { ...item.position } };
    if (!canPlaceAt(placed, normalized, normalized.position, normalizedRows)) continue;
    placed.push(normalized);
    reservedIds.add(item.id);
  }

  const cursors = new Map<number, { row: number; column: number }>();
  for (const item of uniqueItems) {
    if (reservedIds.has(item.id)) continue;
    const rawPage = Number.isFinite(item.position?.page)
      ? Number(item.position?.page)
      : Number(item.page);
    const startPage = Math.max(0, Math.min(MAX_HOME_PAGES - 1, Math.floor(rawPage) || 0));
    const cursor = cursors.get(startPage) || { row: 0, column: 0 };
    let position = item.position
      ? undefined
      : findLegacySparsePosition(placed, item.size, startPage, cursor, normalizedRows);
    if (!position) position = findFirstAvailablePosition(placed, item.size, startPage, normalizedRows);
    if (!position) continue;
    const normalized = { ...item, page: position.page, position: { ...position } };
    placed.push(normalized);
    if (!item.position && position.page === startPage) {
      cursors.set(startPage, advanceLegacyCursor(position, item.size));
    }
  }

  const byId = new Map(placed.map((item) => [item.id, item]));
  return uniqueItems.flatMap((item) => {
    const normalized = byId.get(item.id);
    return normalized ? [normalized] : [];
  });
};

export const normalizeHomeScreenLayout = migrateLegacyHomeScreenLayout;

export const getHighestOccupiedPage = (items: readonly HomeScreenItem[]): number =>
  items.reduce((highest, item) => {
    const page = item.position?.page ?? item.page;
    return Number.isInteger(page) && page >= 0 && page < MAX_HOME_PAGES
      ? Math.max(highest, page)
      : highest;
  }, 0);

export const getVisibleHomePageCount = (
  items: readonly HomeScreenItem[],
  editing: boolean,
): number => {
  const highest = getHighestOccupiedPage(items);
  return Math.min(
    MAX_HOME_PAGES,
    highest + 1 + (editing && highest < MAX_HOME_PAGES - 1 ? 1 : 0),
  );
};

export const getHomeGridPositionFromPoint = (input: {
  page: number;
  pointerX: number;
  pointerY: number;
  grabOffsetX: number;
  grabOffsetY: number;
  containerLeft: number;
  containerTop: number;
  containerWidth: number;
  paddingLeft: number;
  paddingRight: number;
  paddingTop: number;
  columnGap: number;
  rowGap: number;
  rowHeight: number;
  rowCount?: number;
  size: HomeItemSize;
}): HomeScreenPosition => {
  const trackWidth = (
    input.containerWidth
    - input.paddingLeft
    - input.paddingRight
    - input.columnGap * (HOME_GRID_COLUMNS - 1)
  ) / HOME_GRID_COLUMNS;
  const { width, height } = getItemSpan(input.size);
  const left = input.pointerX - input.grabOffsetX - input.containerLeft - input.paddingLeft;
  const top = input.pointerY - input.grabOffsetY - input.containerTop - input.paddingTop;
  const rawColumn = Math.round(left / (trackWidth + input.columnGap));
  const rawRow = Math.round(top / (input.rowHeight + input.rowGap));
  const rowCount = normalizeRowCount(input.rowCount ?? MAX_HOME_GRID_ROWS);
  return {
    page: Math.max(0, Math.min(MAX_HOME_PAGES - 1, Math.floor(input.page) || 0)),
    row: Math.max(0, Math.min(rowCount - height, rawRow)),
    column: Math.max(0, Math.min(HOME_GRID_COLUMNS - width, rawColumn)),
  };
};

/** Compatibility helper retained for existing widget capacity tests. */
export const canPlaceHomeItems = (
  existingItems: readonly Pick<HomeScreenItem, "size">[],
  newSize: HomeItemSize,
  columns = HOME_GRID_COLUMNS,
  maxRows = HOME_GRID_ROWS,
) => {
  if (columns !== HOME_GRID_COLUMNS || maxRows < HOME_GRID_ROWS || maxRows > MAX_HOME_GRID_ROWS) return false;
  const placed: HomeScreenItem[] = [];
  for (const [index, item] of existingItems.entries()) {
    const position = findFirstAvailablePosition(placed, item.size, 0, maxRows);
    if (!position || position.page !== 0) return false;
    placed.push({
      id: `compat-${index}`,
      type: "widget",
      size: item.size,
      page: 0,
      position,
    });
  }
  const position = findFirstAvailablePosition(placed, newSize, 0, maxRows);
  return Boolean(position && position.page === 0);
};
