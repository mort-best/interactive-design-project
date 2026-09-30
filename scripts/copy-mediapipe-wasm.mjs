// MediaPipe의 WASM 파일을 node_modules에서 public/mediapipe/wasm 으로 복사합니다.
// 외부 CDN 대신 이 사이트에서 직접 불러오기 위함이며, 설치된 패키지 버전과 항상 일치합니다.
// npm run dev / npm run build 전에 자동으로 실행됩니다.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules", "@mediapipe", "tasks-vision", "wasm");
const dest = join(root, "public", "mediapipe", "wasm");

// SIMD 지원/미지원 브라우저용 두 가지만 필요 (ES 모듈 변형은 사용하지 않음)
const files = [
  "vision_wasm_internal.js",
  "vision_wasm_internal.wasm",
  "vision_wasm_nosimd_internal.js",
  "vision_wasm_nosimd_internal.wasm",
];

mkdirSync(dest, { recursive: true });
for (const f of files) copyFileSync(join(src, f), join(dest, f));
console.log(`copied ${files.length} MediaPipe wasm files -> public/mediapipe/wasm`);
