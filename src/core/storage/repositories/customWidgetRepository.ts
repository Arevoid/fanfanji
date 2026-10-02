import { readArray, writeArray } from "./repositoryUtils";
import { customWidgetDb } from "../customWidgetDb";
import { normalizeCustomWidget } from "../../../domain/home/customWidgetSchema";
import type { CustomWidgetDefinition } from "../../../domain/home/customWidgetTypes";

const FALLBACK_KEY = "phone_custom_widgets";
export const CUSTOM_WIDGETS_CHANGED_EVENT = "fanfanji:custom-widgets-changed";

function notifyChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(CUSTOM_WIDGETS_CHANGED_EVENT));
}

export async function loadCustomWidgets(): Promise<CustomWidgetDefinition[]> {
  const fallback = readArray<CustomWidgetDefinition>(FALLBACK_KEY, []).value
    .map((item) => normalizeCustomWidget(item, { source: item.source }))
    .filter((item): item is CustomWidgetDefinition => Boolean(item));
  try {
    const durable = await customWidgetDb.loadAll();
    const durableWidgets = durable.map((item) => normalizeCustomWidget(item, { source: item.source }) || item);
    const byId = new Map(durableWidgets.map((item) => [item.id, item]));
    fallback.forEach((item) => { if (!byId.has(item.id)) byId.set(item.id, item); });
    if (byId.size > durableWidgets.length) await customWidgetDb.replaceAll([...byId.values()]).catch(() => undefined);
    return [...byId.values()];
  } catch (error) {
    console.warn("[custom-widgets] IndexedDB unavailable; using localStorage fallback.", error);
  }
  return fallback;
}

export async function saveCustomWidget(input: CustomWidgetDefinition): Promise<CustomWidgetDefinition> {
  const widget = normalizeCustomWidget(input, { id: input.id, source: input.source });
  if (!widget) throw new Error("小组件数据校验失败");
  try {
    await customWidgetDb.put(widget);
  } catch (error) {
    const current = readArray<CustomWidgetDefinition>(FALLBACK_KEY, []).value.filter((item) => item.id !== widget.id);
    const result = writeArray(FALLBACK_KEY, [...current, widget]);
    if (!result.success) throw error;
  }
  notifyChanged();
  return widget;
}

export async function deleteCustomWidget(id: string): Promise<void> {
  try {
    await customWidgetDb.remove(id);
  } catch (error) {
    const current = readArray<CustomWidgetDefinition>(FALLBACK_KEY, []).value;
    const result = writeArray(FALLBACK_KEY, current.filter((item) => item.id !== id));
    if (!result.success) throw error;
  }
  notifyChanged();
}

export async function clearCustomWidgets(): Promise<void> {
  await customWidgetDb.clearAll().catch(() => undefined);
  writeArray(FALLBACK_KEY, []);
  notifyChanged();
}
