// 손 검출 전용 워커. 3D 애니메이션이 돌아가는 메인 스레드와 분리되어,
// 검출이 느린 기기에서도 화면이 끊기지 않습니다.
// 영상 프레임은 메인 스레드에서 ImageBitmap으로 넘겨받아 이 워커 안에서만 처리합니다.
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";

type InMsg =
  | { type: "init"; wasmBase: string; modelUrl: string; forceCpu: boolean }
  | { type: "frame"; bitmap: ImageBitmap; time: number };

let landmarker: HandLandmarker | null = null;
// 워커 전역 객체 (tsconfig가 DOM 기준이라 필요한 기능만 좁혀서 사용)
const port = self as unknown as { postMessage(msg: unknown): void };

async function init(wasmBase: string, modelUrl: string, forceCpu: boolean): Promise<string> {
  // 클래식 워커라 importScripts로 WASM 로더를 불러옴
  const fileset = await FilesetResolver.forVisionTasks(wasmBase);
  const options = (delegate: "GPU" | "CPU") => ({
    baseOptions: { modelAssetPath: modelUrl, delegate },
    runningMode: "VIDEO" as const,
    numHands: 1,
    minHandDetectionConfidence: 0.6,
    minHandPresenceConfidence: 0.6,
    minTrackingConfidence: 0.5,
  });
  try {
    if (forceCpu) throw new Error("cpu requested");
    landmarker = await HandLandmarker.createFromOptions(fileset, options("GPU"));
    return "GPU";
  } catch {
    landmarker = await HandLandmarker.createFromOptions(fileset, options("CPU"));
    return "CPU";
  }
}

self.onmessage = async (e: MessageEvent<InMsg>) => {
  const msg = e.data;
  if (msg.type === "init") {
    try {
      const delegate = await init(msg.wasmBase, msg.modelUrl, msg.forceCpu);
      port.postMessage({ type: "ready", delegate });
    } catch (err) {
      port.postMessage({ type: "error", message: String((err as Error)?.message ?? err) });
    }
    return;
  }
  if (msg.type === "frame") {
    const t0 = performance.now();
    let landmarks = null;
    try {
      if (landmarker) landmarks = landmarker.detectForVideo(msg.bitmap, msg.time).landmarks[0] ?? null;
    } catch (err) {
      console.warn("[hand worker] detect failed", err);
    } finally {
      msg.bitmap.close();
    }
    port.postMessage({ type: "result", landmarks, time: msg.time, cost: performance.now() - t0 });
  }
};
