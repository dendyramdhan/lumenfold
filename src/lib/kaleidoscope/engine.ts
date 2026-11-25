export type ColorMode = "prism" | "jewel" | "ember" | "tide" | "ash";

export type KaleidoSettings = {
  segments: number;
  mode: ColorMode;
  mirror: boolean;
  frozen: boolean;
};

export type Phase = "drifting" | "following" | "frozen";

type Tracer = { x: number; y: number; ready: boolean };

const JEWELS = [348, 152, 204, 42, 274];

export class KaleidoEngine {
  private paint: HTMLCanvasElement;
  private pctx: CanvasRenderingContext2D;
  private vctx: CanvasRenderingContext2D | null = null;

  private settings: KaleidoSettings = {
    segments: 8,
    mode: "prism",
    mirror: true,
    frozen: false,
  };

  private raf = 0;
  private lastT = 0;
  private time = 0;
  private timeBase = 0;
  private phase: Phase = "drifting";
  private dead = false;
  private reduced = false;
  private coarse = false;
  private drawing = false;
  private pointerInside = false;
  private idleHoldUntil = 0;
  private ro: ResizeObserver | null = null;
  private tracers = new Map<string, Tracer>();
  private dpr = 1;
  private cx = 0;
  private cy = 0;

  constructor(
    private view: HTMLCanvasElement,
    private onPhase: (phase: Phase) => void,
  ) {
    this.paint = document.createElement("canvas");
    const ctx = this.paint.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Could not start the kaleidoscope canvas.");
    this.pctx = ctx;
  }

  setSettings(next: KaleidoSettings) {
    const segments = Math.max(3, Math.min(16, Math.round(next.segments)));
    this.settings = { ...next, segments };
    if (next.frozen) this.setPhase("frozen");
    else if (!this.pointerInside && !this.drawing) this.setPhase("drifting");
  }

  start() {
    this.reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.coarse = window.matchMedia("(pointer: coarse)").matches;
    const ctx = this.view.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Could not start the kaleidoscope canvas.");
    this.vctx = ctx;
    this.resize();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.view);
    this.attach();
    this.paintRose(4, 1);
    this.tracers.clear();
    this.present();
    this.lastT = 0;
    this.raf = requestAnimationFrame(this.frame);
  }

  stop() {
    this.dead = true;
    cancelAnimationFrame(this.raf);
    this.ro?.disconnect();
    this.detach();
  }

  clear() {
    this.fillBlack();
    this.tracers.clear();
    this.idleHoldUntil = performance.now() + 1800;
    this.present();
  }

  burst() {
    this.fillBlack();
    this.tracers.clear();
    const kind = Math.floor(Math.random() * 3);
    const k = 2 + Math.floor(Math.random() * 6);
    this.paintCurve(kind, k);
    this.idleHoldUntil = 0;
    this.present();
  }

  exportPng(): boolean {
    this.present();
    try {
      const url = this.view.toDataURL("image/png");
      const a = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      a.href = url;
      a.download = `lumenfold-${stamp}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      return url.startsWith("data:image/png");
    } catch {
      return false;
    }
  }

  private frame = (t: number) => {
    if (this.dead) return;
    this.raf = requestAnimationFrame(this.frame);
    if (document.hidden) return;
    const dt = Math.min(48, this.lastT ? t - this.lastT : 16.7);
    this.lastT = t;
    if (!this.settings.frozen) {
      this.fade(dt);
      const active = this.pointerInside || this.drawing;
      if (!active && !this.reduced && performance.now() >= this.idleHoldUntil) {
        this.idle(dt);
        this.setPhase("drifting");
      }
      if (!this.reduced) this.time += dt * 0.001;
    }
    this.present();
  };

  private setPhase(next: Phase) {
    if (this.settings.frozen && next !== "frozen") next = "frozen";
    if (next === this.phase) return;
    this.phase = next;
    this.onPhase(next);
  }

  private attach() {
    this.view.addEventListener("pointerdown", this.onDown);
    this.view.addEventListener("pointermove", this.onMove);
    this.view.addEventListener("pointerup", this.onUp);
    this.view.addEventListener("pointercancel", this.onUp);
    this.view.addEventListener("pointerenter", this.onEnter);
    this.view.addEventListener("pointerleave", this.onLeave);
  }

  private detach() {
    this.view.removeEventListener("pointerdown", this.onDown);
    this.view.removeEventListener("pointermove", this.onMove);
    this.view.removeEventListener("pointerup", this.onUp);
    this.view.removeEventListener("pointercancel", this.onUp);
    this.view.removeEventListener("pointerenter", this.onEnter);
    this.view.removeEventListener("pointerleave", this.onLeave);
  }

  private onEnter = () => {
    if (this.coarse || this.settings.frozen) return;
    this.pointerInside = true;
    this.tracers.delete("user");
    this.setPhase("following");
  };

  private onLeave = () => {
    if (this.drawing) return;
    this.pointerInside = false;
    this.tracers.delete("user");
    if (!this.settings.frozen) this.setPhase("drifting");
  };

  private onDown = (event: PointerEvent) => {
    if (this.settings.frozen) return;
    this.drawing = true;
    this.pointerInside = true;
    this.view.setPointerCapture?.(event.pointerId);
    this.tracers.delete("user");
    this.stampEvent(event);
    this.setPhase("following");
  };

  private onUp = (event: PointerEvent) => {
    this.drawing = false;
    if (this.view.hasPointerCapture?.(event.pointerId)) {
      this.view.releasePointerCapture(event.pointerId);
    }
    if (this.coarse || !this.hit(event)) {
      this.pointerInside = false;
      this.tracers.delete("user");
      if (!this.settings.frozen) this.setPhase("drifting");
    }
  };

  private onMove = (event: PointerEvent) => {
    if (this.settings.frozen) return;
    if (this.coarse && !this.drawing) return;
    if (!this.pointerInside && !this.drawing) return;
    this.stampEvent(event);
  };

  private hit(event: PointerEvent) {
    const rect = this.view.getBoundingClientRect();
    return (
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom
    );
  }

  private stampEvent(event: PointerEvent) {
    const rect = this.view.getBoundingClientRect();
    const list = event.getCoalescedEvents?.() ?? [event];
    const points = list.length ? list : [event];
    for (const point of points) {
      const x = (point.clientX - rect.left) * this.dpr;
      const y = (point.clientY - rect.top) * this.dpr;
      this.trace("user", x, y, this.speed(point));
    }
  }

  private speed(point: PointerEvent) {
    const m = typeof point.movementX === "number" ? Math.hypot(point.movementX, point.movementY) : 0;
    return Math.max(0, Math.min(1, m / 28));
  }

  private idle(dt: number) {
    this.timeBase += dt * 0.00062;
    const t = this.timeBase;
    const reach = Math.min(this.paint.width, this.paint.height) * 0.46;
    const r1 = 0.14 + 0.46 * Math.abs(Math.cos(3 * t));
    const a1 = t * 1.85;
    const r2 = 0.08 + 0.3 * Math.abs(Math.sin(2.2 * t + 0.7));
    const a2 = -t * 1.25 + 1.1;
    this.trace("idle-a", this.cx + Math.cos(a1) * r1 * reach, this.cy + Math.sin(a1) * r1 * reach, 0.18);
    this.trace("idle-b", this.cx + Math.cos(a2) * r2 * reach, this.cy + Math.sin(a2) * r2 * reach, 0.12);
  }

  private trace(id: string, x: number, y: number, speed: number) {
    const prev = this.tracers.get(id);
    if (!prev?.ready) {
      this.stampRaw(x, y, speed);
      this.tracers.set(id, { x, y, ready: true });
      return;
    }
    const dist = Math.hypot(x - prev.x, y - prev.y);
    const step = Math.max(2, this.brushRadius(speed) * 0.32);
    const n = Math.max(1, Math.min(72, Math.ceil(dist / step)));
    for (let i = 1; i <= n; i++) {
      const u = i / n;
      this.stampRaw(prev.x + (x - prev.x) * u, prev.y + (y - prev.y) * u, speed);
    }
    prev.x = x;
    prev.y = y;
  }

  private stampRaw(x: number, y: number, speed: number) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const dx = x - this.cx;
    const dy = y - this.cy;
    const rawR = Math.hypot(dx, dy);
    const rawA = Math.atan2(dy, dx);
    const p = this.fold(x, y);
    const rad = this.brushRadius(speed);
    const { core, glow } = this.ink(rawA, rawR, speed);
    const g = this.pctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rad);
    g.addColorStop(0, core);
    g.addColorStop(0.38, glow);
    g.addColorStop(1, "rgba(0,0,0,0)");
    this.pctx.globalCompositeOperation = "lighter";
    this.pctx.fillStyle = g;
    this.pctx.beginPath();
    this.pctx.arc(p.x, p.y, rad, 0, Math.PI * 2);
    this.pctx.fill();
  }

  private ink(angle: number, radius: number, speed: number) {
    const reach = Math.min(this.paint.width, this.paint.height) * 0.5 || 1;
    const nd = radius / reach;
    const mode = this.settings.mode;
    let h = 32;
    let s = 70;
    let l = 62;
    if (mode === "prism") {
      h = angle * (180 / Math.PI) + nd * 70 + this.time * 26;
      s = 78;
      l = 64;
    } else if (mode === "jewel") {
      const f = ((angle / (Math.PI * 2) + nd * 0.18) % 1 + 1) % 1;
      h = JEWELS[Math.floor(f * JEWELS.length) % JEWELS.length] ?? 348;
      s = 68;
      l = 60;
    } else if (mode === "ember") {
      h = 8 + 28 * (0.5 + 0.5 * Math.sin(angle * 2 + nd * 4));
      s = 88;
      l = 58;
    } else if (mode === "tide") {
      h = 168 + 38 * Math.sin(angle * 1.3 + this.time * 0.35) + nd * 18;
      s = 64;
      l = 60;
    } else {
      h = 36;
      s = 8;
      l = 84;
    }
    h = ((h % 360) + 360) % 360;
    const a = 0.5 + 0.38 * (1 - speed);
    return {
      core: `hsla(${h.toFixed(1)}, ${s}%, ${Math.min(94, l + 16)}%, ${a.toFixed(3)})`,
      glow: `hsla(${h.toFixed(1)}, ${s}%, ${l}%, ${(a * 0.32).toFixed(3)})`,
    };
  }

  private brushRadius(speed: number) {
    const minDim = Math.min(this.paint.width, this.paint.height);
    return Math.max(8, minDim * (0.016 + 0.028 * (1 - speed)));
  }

  private fold(x: number, y: number) {
    const dx = x - this.cx;
    const dy = y - this.cy;
    const r = Math.hypot(dx, dy);
    const slice = (Math.PI * 2) / this.settings.segments;
    let a = Math.atan2(dy, dx);
    a = ((a % slice) + slice) % slice;
    if (this.settings.mirror && a > slice * 0.5) a = slice - a;
    return {
      x: this.cx + Math.cos(a) * r,
      y: this.cy + Math.sin(a) * r,
    };
  }

  private paintRose(k: number, turns: number) {
    const reach = Math.min(this.paint.width, this.paint.height) * 0.46;
    const steps = 520;
    let prevReady = false;
    let px = 0;
    let py = 0;
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * Math.PI * 2 * turns;
      const rad = 0.1 + 0.52 * Math.abs(Math.cos(k * t));
      const x = this.cx + Math.cos(t * 1.15) * rad * reach;
      const y = this.cy + Math.sin(t * 1.15) * rad * reach;
      if (!prevReady) {
        this.stampRaw(x, y, 0.2);
        prevReady = true;
      } else {
        const dist = Math.hypot(x - px, y - py);
        const n = Math.max(1, Math.ceil(dist / 6));
        for (let s = 1; s <= n; s++) {
          const u = s / n;
          this.stampRaw(px + (x - px) * u, py + (y - py) * u, 0.22);
        }
      }
      px = x;
      py = y;
    }
  }

  private paintCurve(kind: number, k: number) {
    const reach = Math.min(this.paint.width, this.paint.height) * 0.46;
    const steps = 640;
    let prevReady = false;
    let px = 0;
    let py = 0;
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * Math.PI * 2 * 2.6;
      let rad = 0.4;
      let ang = t;
      if (kind === 0) {
        rad = 0.08 + 0.58 * Math.abs(Math.cos(k * t * 0.35));
        ang = t;
      } else if (kind === 1) {
        rad = 0.16 + 0.4 * (0.5 + 0.5 * Math.sin(3 * t));
        ang = t * 0.85 + Math.sin(t * 0.65) * 1.4;
      } else {
        rad = 0.06 + (i / steps) * 0.66;
        ang = t * (0.7 + k * 0.08);
      }
      const x = this.cx + Math.cos(ang) * rad * reach;
      const y = this.cy + Math.sin(ang) * rad * reach;
      if (!prevReady) {
        this.stampRaw(x, y, 0.25);
        prevReady = true;
      } else {
        const dist = Math.hypot(x - px, y - py);
        const n = Math.max(1, Math.ceil(dist / 7));
        for (let s = 1; s <= n; s++) {
          const u = s / n;
          this.stampRaw(px + (x - px) * u, py + (y - py) * u, 0.28);
        }
      }
      px = x;
      py = y;
    }
    this.timeBase = 2.4;
  }

  private fade(dt: number) {
    const amt = 1 - Math.pow(0.993, dt / 16.67);
    this.pctx.globalCompositeOperation = "source-over";
    this.pctx.fillStyle = `rgba(0,0,0,${amt})`;
    this.pctx.fillRect(0, 0, this.paint.width, this.paint.height);
  }

  private fillBlack() {
    this.pctx.globalCompositeOperation = "source-over";
    this.pctx.fillStyle = "#000000";
    this.pctx.fillRect(0, 0, this.paint.width, this.paint.height);
  }

  private resize() {
    const rect = this.view.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (w === this.view.width && h === this.view.height && dpr === this.dpr && this.paint.width === w) return;
    const prev = document.createElement("canvas");
    prev.width = this.paint.width;
    prev.height = this.paint.height;
    if (prev.width && prev.height) prev.getContext("2d")?.drawImage(this.paint, 0, 0);
    this.dpr = dpr;
    this.view.width = w;
    this.view.height = h;
    this.paint.width = w;
    this.paint.height = h;
    this.cx = w / 2;
    this.cy = h / 2;
    this.fillBlack();
    if (prev.width && prev.height) {
      this.pctx.globalCompositeOperation = "source-over";
      this.pctx.drawImage(prev, (w - prev.width) / 2, (h - prev.height) / 2);
    }
  }

  private present() {
    const ctx = this.vctx;
    if (!ctx) return;
    const w = this.view.width;
    const h = this.view.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#0c0b0a";
    ctx.fillRect(0, 0, w, h);

    const segments = this.settings.segments;
    const slice = (Math.PI * 2) / segments;
    const half = this.settings.mirror ? slice * 0.5 : slice;
    const reach = Math.hypot(w, h) * 0.5 + 4;

    ctx.save();
    ctx.translate(this.cx, this.cy);
    for (let i = 0; i < segments; i++) {
      this.blit(ctx, i * slice, false, half, reach);
      if (this.settings.mirror) this.blit(ctx, i * slice, true, half, reach);
    }
    ctx.restore();

    const nd = Math.min(w, h) * 0.5;
    const vignette = ctx.createRadialGradient(this.cx, this.cy, nd * 0.38, this.cx, this.cy, nd * 1.18);
    vignette.addColorStop(0, "rgba(12,11,10,0)");
    vignette.addColorStop(1, "rgba(12,11,10,0.78)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, w, h);

    ctx.beginPath();
    ctx.arc(this.cx, this.cy, nd * 0.9, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(212,165,116,0.38)";
    ctx.lineWidth = Math.max(1, this.dpr);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(this.cx, this.cy, Math.max(3 * this.dpr, nd * 0.016), 0, Math.PI * 2);
    ctx.fillStyle = "#d4a574";
    ctx.fill();
  }

  private blit(
    ctx: CanvasRenderingContext2D,
    rotation: number,
    mirrored: boolean,
    half: number,
    reach: number,
  ) {
    ctx.save();
    ctx.rotate(rotation);
    if (mirrored) ctx.scale(1, -1);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, reach, 0, half);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(this.paint, -this.cx, -this.cy);
    ctx.restore();
  }
}
