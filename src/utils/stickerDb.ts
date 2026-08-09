import { StickerGroup } from "../types";

class StickerDB {
  private dbName = "StickerAppDB";
  private storeGroups = "stickerGroups";
  private storeImages = "stickerImages";
  private db: IDBDatabase | null = null;

  async init(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.storeGroups)) {
          db.createObjectStore(this.storeGroups, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(this.storeImages)) {
          db.createObjectStore(this.storeImages);
        }
      };
      request.onsuccess = () => {
        this.db = request.result;
        resolve(request.result);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async saveGroup(group: StickerGroup): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.storeGroups, "readwrite");
      const store = transaction.objectStore(this.storeGroups);
      // Strip dynamic Object URLs before saving to DB to avoid saving expired blob URLs
      const cleanedGroup: StickerGroup = {
        ...group,
        stickers: group.stickers.map((s) => ({
          ...s,
          url: s.url.startsWith("blob:") ? "" : s.url, // we will reconstruct blob URLs on load
        })),
      };
      const request = store.put(cleanedGroup);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getGroups(): Promise<StickerGroup[]> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.storeGroups, "readonly");
      const store = transaction.objectStore(this.storeGroups);
      const request = store.getAll();
      request.onsuccess = async () => {
        const groups = (request.result || []) as StickerGroup[];
        // Reconstruct Object URLs for local stickers
        const hydratedGroups = await Promise.all(
          groups.map(async (group) => {
            const hydratedStickers = await Promise.all(
              group.stickers.map(async (s) => {
                if (!s.url) {
                  // It's a local sticker, let's load from storeImages
                  try {
                    const blob = await this.getStickerImage(s.id);
                    if (blob) {
                      return { ...s, url: URL.createObjectURL(blob) };
                    }
                  } catch (err) {
                    console.error("Failed to load sticker image from DB:", s.id, err);
                  }
                }
                return s;
              })
            );
            return { ...group, stickers: hydratedStickers };
          })
        );
        resolve(hydratedGroups);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async deleteGroup(id: string): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.storeGroups, "readwrite");
      const store = transaction.objectStore(this.storeGroups);
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async saveStickerImage(id: string, data: Blob): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.storeImages, "readwrite");
      const store = transaction.objectStore(this.storeImages);
      const request = store.put(data, id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getStickerImage(id: string): Promise<Blob | null> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.storeImages, "readonly");
      const store = transaction.objectStore(this.storeImages);
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async deleteStickerImage(id: string): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.storeImages, "readwrite");
      const store = transaction.objectStore(this.storeImages);
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async clearAll(): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeGroups, this.storeImages], "readwrite");
      transaction.objectStore(this.storeGroups).clear();
      transaction.objectStore(this.storeImages).clear();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }
}

export const stickerDb = new StickerDB();

// Compress image to max 240x240px while preserving original aspect ratio
export function compressImage(fileOrBlob: Blob): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(fileOrBlob);
    img.src = objectUrl;
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(fileOrBlob);
        return;
      }
      const maxDim = 240;
      let width = img.width;
      let height = img.height;
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }
      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            resolve(fileOrBlob);
          }
        },
        "image/png",
        0.85
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(fileOrBlob);
    };
  });
}

// Convert Blob to Base64
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64data = reader.result as string;
      // Extract pure base64 part
      const commaIdx = base64data.indexOf(",");
      if (commaIdx !== -1) {
        resolve(base64data.substring(commaIdx + 1));
      } else {
        resolve(base64data);
      }
    };
    reader.onerror = () => reject(new Error("Failed to convert blob to base64"));
    reader.readAsDataURL(blob);
  });
}

// AI auto naming according to sticker image content
export async function aiNameSticker(
  blob: Blob,
  apiKey: string,
  model: string,
  apiEndpoint?: string
): Promise<string> {
  if (!apiKey) {
    throw new Error("No API Key configured. Please configure it in Settings.");
  }
  const base64 = await blobToBase64(blob);

  // If using custom endpoint
  if (apiEndpoint && apiEndpoint.trim()) {
    let endpointUrl = apiEndpoint.trim();
    if (!endpointUrl.endsWith("/chat/completions")) {
      endpointUrl = endpointUrl.replace(/\/+$/, "") + "/chat/completions";
    }

    try {
      const res = await fetch(endpointUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model || "deepseek-chat",
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "请用极其简短的中文词语（如'大笑'、'开心'、'委屈'、'震惊'，不超过6个字，不要标点）来给这张表情包命名。",
                },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:image/png;base64,${base64}`,
                  },
                },
              ],
            },
          ],
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content?.trim();
        if (text) return text.replace(/[“”。！、？?.\s]/g, "").substring(0, 8);
      }
    } catch (err) {
      console.warn("Custom endpoint sticker naming failed:", err);
    }
  }

  // Fallback to direct Gemini API multimodal call
  const cleanModel = model || "gemini-1.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:generateContent?key=${apiKey}`;

  const payload = {
    contents: [
      {
        parts: [
          {
            text: "请分析这张表情包图片的内容和情绪，起一个非常简短传神的中文名字（例如：'哭泣'、'流泪熊猫'、'给你一拳'、'加油'、'赞'、'委屈'）。只返回名字本身，不要任何标点符号、不要任何解释、不要双引号，字数严格控制在6个字以内。",
          },
          {
            inlineData: {
              mimeType: "image/png",
              data: base64,
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 20,
    },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini naming failed: ${errText}`);
  }

  const result = await response.json();
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (text) {
    return text.replace(/[“”。！、？?.\s]/g, "").substring(0, 8);
  }
  throw new Error("Empty response from AI naming model");
}
