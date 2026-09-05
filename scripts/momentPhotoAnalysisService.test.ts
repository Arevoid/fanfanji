import assert from "node:assert/strict";
import { analyzeMomentPhoto } from "../src/features/moments/services/momentPhotoAnalysisService";

assert.equal(await analyzeMomentPhoto({ image: "", apiKey: "key" }), undefined);
assert.equal(await analyzeMomentPhoto({ image: "data:image/png;base64,AA==", apiKey: "" }), undefined);
assert.equal(await analyzeMomentPhoto({
  image: "https://example.invalid/photo.png",
  apiKey: "key",
  fetchImage: async () => new Response(null, { status: 503 }),
}), undefined);
console.log("PASS Moment photo analysis is best-effort and never blocks empty or failed inputs");
