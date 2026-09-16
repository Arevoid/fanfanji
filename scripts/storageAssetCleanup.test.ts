import assert from "node:assert/strict";
import { indexedDB } from "fake-indexeddb";
import * as LZString from "lz-string";
import { characterPhoneDb } from "../src/core/storage/characterPhoneDb";
import { readingAssetDb } from "../src/core/storage/readingAssetDb";
import { imageAssetDb } from "../src/utils/imageAssetDb";
import { cleanupOrphanedStorageResources } from "../src/core/storage/storageDiagnostics";

const values = new Map<string, string>();
const storage: Storage = {
  get length() { return values.size; },
  clear() { values.clear(); },
  getItem(key) { return values.get(key) ?? null; },
  key(index) { return [...values.keys()][index] ?? null; },
  removeItem(key) { values.delete(key); },
  setItem(key, value) { values.set(key, value); },
};
const lz = ((LZString as typeof LZString & { default?: typeof LZString }).default ?? LZString) as typeof import("lz-string");
Object.assign(globalThis, { indexedDB, window: { localStorage: storage } });

const phoneGalleryImage = new Blob(["gallery"], { type: "image/png" });
const characterReferenceImage = new Blob(["character-reference"], { type: "image/png" });
await imageAssetDb.saveImage("phone-gallery-image", phoneGalleryImage);
const legacyPhoneGalleryImage = new Blob(["legacy-gallery"], { type: "image/png" });
await imageAssetDb.saveImage("legacy-phone-gallery-image", legacyPhoneGalleryImage);
await imageAssetDb.saveImage("character-reference-image", characterReferenceImage);
await imageAssetDb.saveImage("true-orphan-image", new Blob(["orphan"], { type: "image/png" }));
await characterPhoneDb.replaceAll([{
  id: "phone-record",
  ownerIdentityId: "identity-a",
  characterId: "character-a",
  galleryItems: [{ id: "gallery-item", imageAssetId: "phone-gallery-image" }],
} as never]);
storage.setItem("phone_character_phone_v2_legacy", `lz16:${lz.compressToUTF16(JSON.stringify({
  galleryItems: [{ imageAssetId: "legacy-phone-gallery-image" }],
}))}`);
await readingAssetDb.saveMetadataValue("character-archive-v4", [{
  id: "character-a",
  imageReferenceAssetId: "character-reference-image",
}]);

const result = await cleanupOrphanedStorageResources({ stickers: false });
assert.deepEqual(result, [{ database: "FanfanImageAssets", store: "images", removed: 1, failed: 0 }]);
assert.equal((await imageAssetDb.getImage("phone-gallery-image"))?.size, phoneGalleryImage.size, "role-phone gallery references must protect shared image assets");
assert.equal((await imageAssetDb.getImage("legacy-phone-gallery-image"))?.size, legacyPhoneGalleryImage.size, "compressed legacy role-phone records must protect gallery assets");
assert.equal((await imageAssetDb.getImage("character-reference-image"))?.size, characterReferenceImage.size, "character archive references in IndexedDB must protect image assets");
assert.equal(await imageAssetDb.getImage("true-orphan-image"), null, "only a proven orphan can be removed");

console.log("PASS image orphan cleanup preserves role-phone galleries and archived character references");
