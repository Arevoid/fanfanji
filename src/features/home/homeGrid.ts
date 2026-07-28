import type { HomeScreenItem } from "../../types";

export type HomeItemSize = HomeScreenItem["size"];

export const getHomeItemDimensions = (size: HomeItemSize) => {
  switch (size) {
    case "2x2": return { width: 2, height: 2 };
    case "1x4": return { width: 4, height: 1 };
    case "2x3": return { width: 3, height: 2 };
    case "2x4": return { width: 4, height: 2 };
    default: return { width: 1, height: 1 };
  }
};

export const canPlaceHomeItems = (
  existingItems: readonly Pick<HomeScreenItem, "size">[],
  newSize: HomeItemSize,
  columns = 4,
  maxRows = 4,
) => {
  const grid = Array.from({ length: maxRows }, () => new Array(columns).fill(false));
  const place = (size: HomeItemSize) => {
    const { width, height } = getHomeItemDimensions(size);
    for (let row = 0; row + height <= maxRows; row += 1) {
      for (let column = 0; column + width <= columns; column += 1) {
        let free = true;
        for (let y = row; y < row + height && free; y += 1) {
          for (let x = column; x < column + width; x += 1) {
            if (grid[y][x]) { free = false; break; }
          }
        }
        if (!free) continue;
        for (let y = row; y < row + height; y += 1) {
          for (let x = column; x < column + width; x += 1) grid[y][x] = true;
        }
        return true;
      }
    }
    return false;
  };
  return existingItems.every((item) => place(item.size)) && place(newSize);
};
