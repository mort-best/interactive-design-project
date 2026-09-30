import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import type { TrackerStatus } from "./handTracker";

// 작은 카메라 조작 UI: 카메라 시작/종료, 프리뷰 보기/숨기기, 상태 문구, 작은 프리뷰.
// index.html은 건드리지 않고 여기서 DOM을 만듭니다.

const CSS = `
.hand-ui {
  position: fixed; left: 16px; bottom: 16px; z-index: 10;
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  font: 12px/1.4 -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;
  color: #2b2b2b; user-select: none;
}
.hand-ui button {
  font: inherit; color: inherit; cursor: pointer;
  padding: 6px 12px; border-radius: 999px;
  border: 1px solid rgba(43, 43, 43, 0.18);
  background: rgba(242, 237, 225, 0.85);
  backdrop-filter: blur(4px);
}
.hand-ui button:hover { background: #f2ede1; }
.hand-ui button:disabled { opacity: 0.5; cursor: default; }
.hand-ui button[hidden] { display: none; }
.hand-ui .status { opacity: 0.7; }
.hand-ui .dot {
  display: inline-block; width: 7px; height: 7px; border-radius: 50%;
  margin-right: 6px; vertical-align: 1px; background: #b8b1a5;
}
.hand-ui .dot.on { background: #ee7a24; }
.hand-preview {
  position: fixed; right: 16px; bottom: 16px; z-index: 10;
  width: 200px; aspect-ratio: 4 / 3; border-radius: 10px; overflow: hidden;
  border: 1px solid rgba(43, 43, 43, 0.18); background: #2b2b2b;
  display: none;
}
.hand-preview.show { display: block; }
.hand-preview video, .hand-preview canvas {
  position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover;
  transform: scaleX(-1); /* 거울처럼 */
}
`;

const HAND_LINKS = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
];

export class HandUI {
  private readonly startBtn: HTMLButtonElement;
  private readonly stopBtn: HTMLButtonElement;
  private readonly previewBtn: HTMLButtonElement;
  private readonly statusEl: HTMLSpanElement;
  private readonly dot: HTMLSpanElement;
  private readonly preview: HTMLDivElement;
  private readonly overlay: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  previewVisible = false;
  private status: TrackerStatus = "idle";
  private handSeen = false;

  constructor(private readonly video: HTMLVideoElement, onStart: () => void, onStop: () => void) {
    const style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);

    const bar = document.createElement("div");
    bar.className = "hand-ui";
    this.startBtn = this.button("카메라 시작", onStart);
    this.stopBtn = this.button("카메라 종료", onStop);
    this.previewBtn = this.button("프리뷰 보기", () => this.setPreview(!this.previewVisible));
    const status = document.createElement("span");
    status.className = "status";
    this.dot = document.createElement("span");
    this.dot.className = "dot";
    this.statusEl = document.createElement("span");
    status.append(this.dot, this.statusEl);
    bar.append(this.startBtn, this.stopBtn, this.previewBtn, status);

    this.preview = document.createElement("div");
    this.preview.className = "hand-preview";
    this.overlay = document.createElement("canvas");
    this.overlay.width = 320;
    this.overlay.height = 240;
    this.ctx = this.overlay.getContext("2d")!;
    this.preview.append(video, this.overlay);

    document.body.append(bar, this.preview);
    this.render();
  }

  private button(label: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.addEventListener("click", onClick);
    return b;
  }

  setPreview(show: boolean): void {
    this.previewVisible = show && this.status === "running";
    this.preview.classList.toggle("show", this.previewVisible);
    if (!this.previewVisible) this.ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);
    this.render();
  }

  setStatus(s: TrackerStatus): void {
    this.status = s;
    if (s !== "running") {
      this.handSeen = false;
      this.setPreview(false);
    }
    this.render();
  }

  setHandSeen(seen: boolean): void {
    if (seen === this.handSeen) return;
    this.handSeen = seen;
    this.render();
  }

  // 프리뷰가 켜져 있을 때만 손 인식 결과를 그립니다.
  drawLandmarks(landmarks: NormalizedLandmark[] | null): void {
    if (!this.previewVisible) return;
    const { ctx, overlay, video } = this;
    // 오버레이 비율을 실제 카메라 비율과 맞춰, 영상과 같은 방식으로 잘리게 함
    if (video.videoWidth && overlay.width !== video.videoWidth / 2) {
      overlay.width = video.videoWidth / 2;
      overlay.height = video.videoHeight / 2;
    }
    const w = overlay.width;
    const h = overlay.height;
    ctx.clearRect(0, 0, w, h);
    if (!landmarks) return;
    ctx.strokeStyle = "rgba(242, 237, 225, 0.9)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (const [a, b] of HAND_LINKS) {
      ctx.moveTo(landmarks[a].x * w, landmarks[a].y * h);
      ctx.lineTo(landmarks[b].x * w, landmarks[b].y * h);
    }
    ctx.stroke();
    for (const [i, color] of [[0, "#f6c643"], [4, "#ee7a24"], [8, "#ee7a24"], [12, "#ee7a24"], [16, "#ee7a24"], [20, "#ee7a24"]] as const) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(landmarks[i].x * w, landmarks[i].y * h, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private render(): void {
    const s = this.status;
    const running = s === "running";
    const busy = s === "starting";
    this.startBtn.hidden = running || busy;
    this.stopBtn.hidden = !(running || busy);
    this.previewBtn.hidden = !running;
    this.previewBtn.textContent = this.previewVisible ? "프리뷰 숨기기" : "프리뷰 보기";
    this.dot.classList.toggle("on", running && this.handSeen);
    this.dot.hidden = !running;

    const text: Record<TrackerStatus, string> = {
      idle: "",
      starting: "카메라 준비 중…",
      running: this.handSeen ? "손 인식 중" : "카메라 앞에 손을 보여주세요 · 마우스도 사용 가능",
      denied: "카메라 권한이 거부되어 마우스로 체험 중이에요",
      "no-camera": "카메라를 찾을 수 없거나 다른 앱이 사용 중이에요",
      unsupported: "이 브라우저에서는 카메라를 쓸 수 없어요",
      error: "손 추적을 불러오지 못했어요 · 마우스로 체험해 주세요",
    };
    this.statusEl.textContent = text[s];
  }
}
