import { useEffect, useRef, useState } from "react";
import { Download, Eraser, FlipHorizontal2, Pause, Play, Shuffle } from "lucide-react";
import {
  KaleidoEngine,
  type ColorMode,
  type KaleidoSettings,
  type Phase,
} from "@/lib/kaleidoscope/engine";

const MODES: { id: ColorMode; label: string }[] = [
  { id: "prism", label: "Prism" },
  { id: "jewel", label: "Jewel" },
  { id: "ember", label: "Ember" },
  { id: "tide", label: "Tide" },
  { id: "ash", label: "Ash" },
];

export function KaleidoscopeApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<KaleidoEngine | null>(null);
  const [segments, setSegments] = useState(8);
  const [mode, setMode] = useState<ColorMode>("prism");
  const [mirror, setMirror] = useState(true);
  const [frozen, setFrozen] = useState(false);
  const [phase, setPhase] = useState<Phase>("drifting");
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = new KaleidoEngine(canvas, setPhase);
    engineRef.current = engine;
    engine.setSettings({ segments: 8, mode: "prism", mirror: true, frozen: false });
    engine.start();
    return () => {
      engine.stop();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    const settings: KaleidoSettings = { segments, mode, mirror, frozen };
    engineRef.current?.setSettings(settings);
  }, [segments, mode, mirror, frozen]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (event.key === " ") {
        event.preventDefault();
        setFrozen((value) => !value);
      } else if (event.key === "r" || event.key === "R") {
        randomize();
      } else if (event.key === "m" || event.key === "M") {
        setMirror((value) => !value);
      } else if (event.key === "c" || event.key === "C") {
        engineRef.current?.clear();
      } else if (event.key === "e" || event.key === "E") {
        save();
      } else if (event.key === "ArrowRight") {
        setSegments((value) => Math.min(16, value + 1));
      } else if (event.key === "ArrowLeft") {
        setSegments((value) => Math.max(3, value - 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(null), 1600);
    return () => window.clearTimeout(id);
  }, [notice]);

  function randomize() {
    const nextMode = MODES[Math.floor(Math.random() * MODES.length)]?.id ?? "prism";
    const nextSegments = 4 + Math.floor(Math.random() * 11);
    const nextMirror = Math.random() > 0.2;
    setMode(nextMode);
    setSegments(nextSegments);
    setMirror(nextMirror);
    setFrozen(false);
    const engine = engineRef.current;
    engine?.setSettings({
      segments: nextSegments,
      mode: nextMode,
      mirror: nextMirror,
      frozen: false,
    });
    engine?.burst();
  }

  function save() {
    const ok = engineRef.current?.exportPng() ?? false;
    setNotice(ok ? "Image saved" : "Could not save");
  }

  const phaseLabel = frozen ? "Frozen" : phase === "following" ? "Following" : "Drifting";

  return (
    <main className="stage">
      <canvas
        ref={canvasRef}
        className={frozen ? "stage-canvas is-frozen" : "stage-canvas"}
        aria-label="Kaleidoscope. Move the pointer to fold light into a symmetric pattern."
      />
      <header className="topbar">
        <div>
          <h1 className="wordmark">Lumenfold</h1>
          <p className="tagline">Move to fold light</p>
        </div>
        <p className="phase">
          <strong>{phaseLabel}</strong>
        </p>
      </header>
      <div className="dock-wrap">
        <section className="dock" aria-label="Kaleidoscope controls">
          <div className="field-row">
            <label className="field-label" htmlFor="segments">
              Segments
            </label>
            <div className="field-row">
              <span className="field-value">{segments}</span>
              <button type="button" className="clear-btn" onClick={() => engineRef.current?.clear()}>
                <Eraser size={13} strokeWidth={1.75} aria-hidden="true" /> Clear
              </button>
            </div>
          </div>
          <input
            id="segments"
            className="segment-slider"
            type="range"
            min={3}
            max={16}
            step={1}
            value={segments}
            aria-valuemin={3}
            aria-valuemax={16}
            aria-valuenow={segments}
            onChange={(event) => setSegments(Number(event.target.value))}
          />
          <div className="mode-row" role="radiogroup" aria-label="Color mode">
            {MODES.map((item) => (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={mode === item.id}
                className={mode === item.id ? "mode-btn is-on" : "mode-btn"}
                onClick={() => setMode(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="action-row">
            <button
              type="button"
              className={mirror ? "action is-on" : "action"}
              aria-pressed={mirror}
              onClick={() => setMirror((value) => !value)}
            >
              <FlipHorizontal2 size={16} strokeWidth={1.75} aria-hidden="true" />
              <span>Reflect</span>
            </button>
            <button
              type="button"
              className={frozen ? "action is-on" : "action"}
              aria-pressed={frozen}
              onClick={() => setFrozen((value) => !value)}
            >
              <span className="icon-swap" aria-hidden="true">
                <Pause className={frozen ? "icon-off" : "icon-on"} size={16} strokeWidth={1.75} />
                <Play className={frozen ? "icon-on" : "icon-off"} size={16} strokeWidth={1.75} />
              </span>
              <span>{frozen ? "Resume" : "Freeze"}</span>
            </button>
            <button type="button" className="action" onClick={randomize}>
              <Shuffle size={16} strokeWidth={1.75} aria-hidden="true" />
              <span>Random</span>
            </button>
            <button type="button" className="action" onClick={save}>
              <Download size={16} strokeWidth={1.75} aria-hidden="true" />
              <span>Save</span>
            </button>
          </div>
          <p className="keys">Space freeze · R random · M reflect · E save · C clear</p>
        </section>
      </div>
      {notice ? <p className="toast">{notice}</p> : null}
      <p className="sr-only" aria-live="polite">
        {phaseLabel}. {segments} segments. {mode} color. {mirror ? "Reflected." : "Rotation only."}
      </p>
    </main>
  );
}
