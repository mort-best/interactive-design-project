import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import { HAND } from "../config";

// 웹캠 + MediaPipe Hand Landmarker.
// 영상은 이 브라우저 안에서만 처리하며, 어디에도 전송하거나 저장하지 않습니다.
// 검출은 Web Worker에서 실행해 3D 애니메이션(메인 스레드)이 끊기지 않게 합니다.
// MediaPipe 코드·WASM·모델은 '카메라 시작'을 누를 때 이 사이트에서만 불러옵니다.

export type TrackerStatus =
  | "idle" // 카메라 꺼짐
  | "starting" // 권한 요청 / 모델 준비 중
  | "running" // 추적 중
  | "denied" // 사용자가 카메라 권한을 거부함
  | "no-camera" // 카메라 장치가 없음 / 다른 앱이 사용 중
  | "unsupported" // 이 브라우저에서 카메라를 쓸 수 없음
  | "error"; // 모델을 불러오지 못함 등

export interface HandFrame {
  // 21개 랜드마크 (0~1 정규화, 카메라 원본 기준 — 좌우 반전 전)
  landmarks: NormalizedLandmark[] | null;
  // 이 프레임을 카메라에서 가져온 시각 (performance.now, ms)
  time: number;
}

type WorkerMsg =
  | { type: "ready"; delegate: string }
  | { type: "error"; message: string }
  | { type: "result"; landmarks: NormalizedLandmark[] | null; time: number; cost: number };

// 사이트 기준 상대 경로 (GitHub Pages 하위 경로나 /preview/pr-N/ 에서도 동작)
const assetUrl = (path: string) => new URL(path, document.baseURI).href;

// 워커로 보낼 프레임 크기 (모델 입력은 이보다 작아서 정확도 손실 없이 전송량만 줄임)
const FRAME_WIDTH = 320;

export class HandTracker {
  readonly video: HTMLVideoElement;
  status: TrackerStatus = "idle";
  errorDetail = "";
  // 실제로 쓰고 있는 추론 장치 ("GPU" | "CPU")
  delegate = "";
  // 검출 1회에 걸린 시간의 이동 평균(ms)과 현재 검출 간격(ms)
  detectCostMs = 0;
  detectIntervalMs = 1000 / HAND.maxDetectHz;

  onStatus: (s: TrackerStatus) => void = () => {};
  onFrame: (f: HandFrame) => void = () => {};

  private worker: Worker | null = null;
  private workerReady: Promise<void> | null = null;
  private stream: MediaStream | null = null;
  private session = 0; // start/stop이 겹칠 때 오래된 요청을 버리기 위한 번호
  private inFlight = false;
  private lastSend = 0;
  private lastVideoTime = -1;

  constructor() {
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.autoplay = true;
    v.setAttribute("aria-hidden", "true");
    this.video = v;
  }

  private setStatus(s: TrackerStatus, detail = ""): void {
    this.status = s;
    this.errorDetail = detail;
    this.onStatus(s);
  }

  // 워커는 한 번만 만들고 카메라를 다시 켤 때 재사용
  private ensureWorker(): Promise<void> {
    if (this.workerReady) return this.workerReady;
    const worker = new Worker(new URL("./handWorker.ts", import.meta.url));
    this.worker = worker;
    this.workerReady = new Promise<void>((resolve, reject) => {
      worker.onmessage = (e: MessageEvent<WorkerMsg>) => {
        const m = e.data;
        if (m.type === "ready") {
          this.delegate = m.delegate;
          resolve();
        } else if (m.type === "error") {
          reject(new Error(m.message));
        } else if (m.type === "result") {
          this.inFlight = false;
          this.detectCostMs = this.detectCostMs === 0 ? m.cost : this.detectCostMs * 0.9 + m.cost * 0.1;
          this.adaptRate();
          if (this.status === "running") this.onFrame({ landmarks: m.landmarks, time: m.time });
        }
      };
      worker.onerror = (e) => reject(new Error(e.message || "worker failed"));
    });
    worker.postMessage({
      type: "init",
      wasmBase: assetUrl("mediapipe/wasm"),
      modelUrl: assetUrl("models/hand_landmarker.task"),
      // 확인용: 주소에 ?delegate=cpu 를 붙이면 GPU 대신 CPU로 검출
      forceCpu: new URLSearchParams(location.search).get("delegate") === "cpu",
    });
    this.workerReady.catch(() => {
      worker.terminate();
      this.worker = null;
      this.workerReady = null;
    });
    return this.workerReady;
  }

  async start(): Promise<void> {
    if (this.status === "starting" || this.status === "running") return;
    const session = ++this.session;

    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || typeof Worker === "undefined") {
      this.setStatus("unsupported");
      return;
    }
    this.setStatus("starting");

    // 모델 준비는 권한 요청과 동시에 시작
    const ready = this.ensureWorker();
    ready.catch(() => {}); // 실패는 아래에서 처리

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: "user",
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 30, max: 30 },
        },
      });
    } catch (err) {
      if (session !== this.session) return;
      const name = (err as DOMException)?.name;
      if (name === "NotAllowedError" || name === "SecurityError") this.setStatus("denied");
      else if (name === "NotFoundError" || name === "NotReadableError" || name === "OverconstrainedError")
        this.setStatus("no-camera", name);
      else this.setStatus("error", String((err as Error)?.message ?? err));
      return;
    }

    // 기다리는 동안 '카메라 종료'를 눌렀다면 바로 정리
    if (session !== this.session) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    this.stream = stream;
    this.video.srcObject = stream;

    try {
      await this.video.play();
      await ready;
    } catch (err) {
      if (session !== this.session) return;
      this.stopTracks();
      this.setStatus("error", String((err as Error)?.message ?? err));
      return;
    }
    if (session !== this.session) return;

    this.inFlight = false;
    this.lastSend = 0;
    this.lastVideoTime = -1;
    this.detectIntervalMs = 1000 / HAND.maxDetectHz;
    this.setStatus("running");
  }

  stop(): void {
    this.session++;
    this.stopTracks();
    if (this.status !== "idle") this.setStatus("idle");
    this.onFrame({ landmarks: null, time: performance.now() });
  }

  private stopTracks(): void {
    // 카메라 표시등이 꺼지도록 모든 영상 트랙을 정지
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video.pause();
    this.video.srcObject = null;
  }

  get liveTrackCount(): number {
    return this.stream?.getTracks().filter((t) => t.readyState === "live").length ?? 0;
  }

  // 매 렌더 프레임 호출. 새 카메라 프레임이 있고, 이전 검출이 끝났고, 검출 간격이 지났을 때만
  // 프레임을 워커로 보냅니다. 메인 스레드에서는 프레임 복사만 하고 바로 돌아옵니다.
  maybeDetect(now: number): void {
    if (this.status !== "running" || !this.worker) return;
    // 응답이 1초 넘게 안 오면(드물게 프레임이 유실된 경우) 다시 보낼 수 있게 풀어 줌
    if (this.inFlight && now - this.lastSend < 1000) return;
    if (document.hidden) return;
    const v = this.video;
    if (v.readyState < 2 || v.videoWidth === 0) return;
    if (now - this.lastSend < this.detectIntervalMs) return;
    if (v.currentTime === this.lastVideoTime) return;

    this.inFlight = true;
    this.lastSend = now;
    this.lastVideoTime = v.currentTime;
    const time = now;
    const session = this.session;
    const h = Math.round((FRAME_WIDTH * v.videoHeight) / v.videoWidth);
    createImageBitmap(v, { resizeWidth: FRAME_WIDTH, resizeHeight: h, resizeQuality: "low" })
      .then((bitmap) => {
        if (session !== this.session || !this.worker) {
          bitmap.close();
          this.inFlight = false;
          return;
        }
        this.worker.postMessage({ type: "frame", bitmap, time }, [bitmap]);
      })
      .catch(() => {
        this.inFlight = false;
      });
  }

  // 검출이 무거운 기기에서는 검출 횟수를 줄여 CPU/GPU를 3D 애니메이션에 양보합니다.
  private adaptRate(): void {
    const c = this.detectCostMs;
    // 검출은 워커에서 돌아 화면을 막지 않으므로, 꽤 무거운 경우에만 빈도를 낮춥니다.
    const hz = c > 60 ? HAND.minDetectHz : c > 35 ? (HAND.minDetectHz + HAND.maxDetectHz) / 2 : HAND.maxDetectHz;
    this.detectIntervalMs = 1000 / hz;
  }
}
