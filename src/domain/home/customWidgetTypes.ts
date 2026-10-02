export const CUSTOM_WIDGET_SCHEMA_VERSION = 1 as const;

export type CustomWidgetSize = "1x1" | "2x2" | "1x4" | "2x3" | "2x4";
export type CustomWidgetSource = "manual" | "ai" | "import";

export type CustomWidgetBlock =
  | {
      type: "text";
      text: string;
      emphasis?: "normal" | "title" | "muted";
    }
  | {
      type: "calendar";
      showLunar?: boolean;
      showWeek?: boolean;
    }
  | {
      type: "list";
      title?: string;
      items: string[];
    }
  | {
      type: "quote";
      text: string;
      author?: string;
    };

export interface CustomWidgetDefinition {
  schemaVersion: typeof CUSTOM_WIDGET_SCHEMA_VERSION;
  id: string;
  name: string;
  creator: string;
  size: CustomWidgetSize;
  theme: "paper" | "glass" | "midnight" | "sunrise";
  accentColor: string;
  blocks: CustomWidgetBlock[];
  source: CustomWidgetSource;
  createdAt: number;
  updatedAt: number;
}

export interface CustomWidgetExportManifest {
  format: "fanfanji-widget";
  version: 1;
  widgetId: string;
  widgetName: string;
  creator: string;
  exportedAt: number;
}
