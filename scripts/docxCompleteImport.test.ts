import assert from "node:assert/strict";
import JSZip from "jszip";
import { extractSupplementalDocxText } from "../src/utils/pngParser";

const zip = new JSZip();
zip.file("word/document.xml", `<?xml version="1.0"?><w:document xmlns:w="x"><w:body><w:p><w:r><w:t>姓名：完整角色</w:t></w:r></w:p><w:p><w:r><w:t>正文不可删</w:t></w:r></w:p></w:body></w:document>`);
zip.file("word/header1.xml", `<?xml version="1.0"?><w:hdr xmlns:w="x"><w:p><w:r><w:t>页眉设定</w:t></w:r></w:p></w:hdr>`);
zip.file("word/footer1.xml", `<?xml version="1.0"?><w:ftr xmlns:w="x"><w:p><w:r><w:t>页脚设定</w:t></w:r></w:p></w:ftr>`);
zip.file("word/comments.xml", `<?xml version="1.0"?><w:comments xmlns:w="x"><w:comment><w:p><w:r><w:t>批注设定</w:t></w:r></w:p></w:comment></w:comments>`);
const buffer = await zip.generateAsync({ type: "arraybuffer" });
const extracted = await extractSupplementalDocxText(buffer);
assert.match(extracted.main, /姓名：完整角色/);
assert.match(extracted.main, /正文不可删/);
assert.match(extracted.supplemental, /页眉设定/);
assert.match(extracted.supplemental, /页脚设定/);
assert.match(extracted.supplemental, /批注设定/);
console.log("PASS DOCX complete text extraction includes body, headers, footers, and comments");
