import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal, flushSync } from "react-dom";
import { level, photos as defaultPhotos, trailFeedback } from "./game/data.js";
import { HikingAssetCredits } from "./HikingAssetCredits.jsx";
import { MemoryGallery } from "./Polaroids.jsx";
import { MemoryPresentation } from "./MemoryPresentation.jsx";
import { formatDuration } from "./formatDuration.js";
import { ControlsTutorial } from "./ControlsTutorial.jsx";
import { filterMemoryPhotos } from "./MemoryPresentationQueue.js";
import "./hiking-game.css";

const initial = {
  state: "LOADING",
  traversalMode: "trail",
  effort: 10,
  progress: 0,
  highestProgress: 0,
  visited: [],
  falls: 0,
  activeSeconds: 0,
  unlockedPhotos: [],
  unlockedPhotoIds: [],
  safeMemoryPresentation: false,
  memoryPreviewId: null,
  clipFlags: [false, false, false],
};
const EMPTY_ART = {},
  NOOP = () => {};
const copy = {
  en: {
    start: "Start hiking",
    pause: "Pause",
    resume: "Resume",
    close: "Close",
    preview: "View the summit",
    restart: "Play again",
    back: "Back to About",
    ready: "Reach the summit.",
    controls:
      "A / D or ← / → to move. Space or W to jump. E / PUSH on steep slopes, E / CLIP at cable anchors. On the climbing wall, use W / A / S / D or all four arrows to follow the holds.",
    touchControls:
      "Use the arrows to move and JUMP on the trail. Use CLIP at the cable anchors. On the climbing wall, use all four arrows to follow the holds.",
    rest: "Catching a breath…",
    effort: "EFFORT",
    memories: "Memories",
    finish: "YES! I MADE IT!",
    previewTitle: "A look at the summit",
    loading: "Preparing the trail…",
    error: "Could not open the trail",
    retry: "Retry",
  },
  "pt-PT": {
    start: "Começar",
    pause: "Pausa",
    resume: "Continuar",
    close: "Fechar",
    preview: "Ver o cume",
    restart: "Jogar de novo",
    back: "Voltar ao About",
    ready: "Chega ao cume.",
    controls:
      "A / D ou ← / → para andar. Espaço ou W para saltar. E / PUSH nas rampas e E / CLIP nas ancoragens do cabo. Na parede, usa W / A / S / D ou as quatro setas para seguir as presas.",
    touchControls:
      "Usa as setas para andar e JUMP no trilho. Usa CLIP nas ancoragens do cabo. Na parede, usa as quatro setas para seguir as presas.",
    rest: "A recuperar o fôlego…",
    effort: "ESFORÇO",
    memories: "Memórias",
    finish: "SIM! CONSEGUI!",
    previewTitle: "Uma vista do cume",
    loading: "A preparar o trilho…",
    error: "Não foi possível abrir o trilho",
    retry: "Tentar novamente",
  },
};

function ControlButton({
  action,
  label,
  accessibleLabel = label,
  apiRef,
  disabled = false,
  resetToken,
}) {
  const held = useRef(new Map());
  const release = useCallback(
    (event) => {
      if (held.current.delete(event.pointerId))
        apiRef.current?.setInput(action, `pointer:${event.pointerId}`, false);
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {}
    },
    [action, apiRef],
  );
  const releaseAll = useCallback(() => {
    for (const [id, element] of held.current) {
      apiRef.current?.setInput(action, `pointer:${id}`, false);
      try {
        element.releasePointerCapture(id);
      } catch {}
    }
    held.current.clear();
  }, [action, apiRef]);
  useEffect(() => {
    const api = apiRef.current,
      q = api?.getSnapshot();
    if (
      disabled ||
      q?.state !== "PLAYING" ||
      !(
        ["left", "right"].includes(action) ||
        (q.traversalMode !== "trail" && ["up", "down"].includes(action))
      )
    )
      return;
    // A state transition clears intentions, while a captured pointer can still be
    // physically held. Resume continuous directions without replaying action edges.
    for (const id of held.current.keys()) {
      api.setInput(action, `pointer:${id}`, false);
      api.setInput(action, `pointer:${id}`, true);
    }
  }, [resetToken, disabled, action, apiRef]);
  useEffect(() => {
    const visibility = () => {
      if (document.hidden) releaseAll();
    };
    window.addEventListener("blur", releaseAll);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("blur", releaseAll);
      document.removeEventListener("visibilitychange", visibility);
      releaseAll();
    };
  }, [releaseAll]);
  return (
    <button
      type="button"
      className={`hiking-control hiking-control-${action}`}
      disabled={disabled}
      aria-label={accessibleLabel}
      onPointerDown={(event) => {
        event.preventDefault();
        if (held.current.has(event.pointerId)) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        held.current.set(event.pointerId, event.currentTarget);
        apiRef.current?.setInput(action, `pointer:${event.pointerId}`, true);
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
    >
      {label}
    </button>
  );
}

export function HikingGameOverlay({
  open,
  onClose = NOOP,
  onComplete,
  photos = defaultPhotos,
  locale = "en",
  reducedMotion,
  debug = false,
  triggerElement = null,
  theme = {},
  art = EMPTY_ART,
  renderer = "auto",
}) {
  const t = copy[locale] ?? copy.en;
  const publishedSnapshotRef = useRef(initial),
    apiRef = useRef(null),
    hostRef = useRef(null),
    dialogRef = useRef(null),
    focusBefore = useRef(null),
    scrollBefore = useRef(null),
    onCompleteRef = useRef(onComplete),
    onCloseRef = useRef(onClose),
    eventsRef = useRef([]),
    activeKeys = useRef(new Map()),
    galleryRef = useRef(null),
    touchRef = useRef(false);
  const [snapshot, setSnapshot] = useState(initial),
    [error, setError] = useState(null),
    [gallery, setGallery] = useState(null),
    [memoryStatus, setMemoryStatus] = useState({
      current: null,
      summitComplete: false,
    }),
    [showCredits, setShowCredits] = useState(false),
    [showTouch, setShowTouch] = useState(false),
    [instance, setInstance] = useState(0);
  onCompleteRef.current = onComplete;
  onCloseRef.current = onClose;
  galleryRef.current = gallery;
  touchRef.current = showTouch;
  const state = snapshot.state,
    mode = snapshot.traversalMode ?? "trail",
    atEnd = state === "SUMMIT" || state === "SUMMIT_PREVIEW",
    sequence = state === "SUMMIT_SEQUENCE";
  const special = mode !== "trail",
    wall = mode === "wall_climb",
    via = mode.startsWith("via_");
  const memoryById = (id) =>
    photos.find((memory) => memory.id === id || memory.legacyId === id);
  const previewVisible = !!memoryStatus.current && !memoryStatus.hidden;
  const unlockedMemories = filterMemoryPhotos(
    photos,
    snapshot.unlockedPhotoIds,
  );
  const endMemories = filterMemoryPhotos(photos, snapshot.unlockedPhotoIds, {
    all: atEnd,
  });
  const showEndActions =
    state === "SUMMIT_PREVIEW" ||
    (state === "SUMMIT" && memoryStatus.summitComplete);
  const resetToken = `${snapshot.runId}:${mode}:${state}:${snapshot.falls}`;
  const close = useCallback((reason) => onCloseRef.current(reason), []);
  const closeMemory = useCallback(() => {
    apiRef.current?.clearInput();
    apiRef.current?.resume("memory_gallery");
    setGallery(null);
  }, []);
  const expandMemories = useCallback(
    (ids, photoId, trigger) => {
      apiRef.current?.clearInput();
      apiRef.current?.pause("memory_gallery");
      setGallery({
        ids,
        photoId,
        all: atEnd,
        trigger: trigger ?? document.activeElement,
      });
    },
    [atEnd],
  );
  const expandMemory = useCallback(
    (id, photoId, trigger) => expandMemories([id], photoId, trigger),
    [expandMemories],
  );
  const restoreHeldDirections = useCallback(() => {
    const api = apiRef.current,
      q = api?.getSnapshot();
    if (q?.state !== "PLAYING") return;
    for (const [code, action] of activeKeys.current)
      if (
        ["left", "right"].includes(action) ||
        (q.traversalMode !== "trail" && ["up", "down"].includes(action))
      ) {
        api.setInput(action, "key:" + code, false);
        api.setInput(action, "key:" + code, true);
      }
  }, []);
  const resumeManual = useCallback(() => {
    const api = apiRef.current;
    api?.clearInput();
    dialogRef.current?.focus();
    // An embedded browser can return from blur without a window focus event.
    // Explicit Resume in a visible document also releases that browser pause;
    // the simulation still owns gallery pauses and its rest/photo return state.
    if (!document.hidden) api?.resume("document_hidden");
    api?.resume("manual_pause");
    restoreHeldDirections();
  }, [restoreHeldDirections]);
  // Resume may first return to rest/respawn, and traversal changes also clear
  // controller input. Reconcile held directions whenever movement becomes valid.
  // Action keys retain their release requirement (no repeated jumps or CLIPs).
  useLayoutEffect(() => {
    if (open && !gallery && state === "PLAYING") restoreHeldDirections();
  }, [open, gallery, resetToken, restoreHeldDirections]);
  const onMemoryStatus = useCallback(
    (status) => {
      setMemoryStatus(status);
      const api = apiRef.current;
      if (!api) return;
      const q = api.getSnapshot();
      if (
        trailFeedback.photoMomentIds.includes(status.current) &&
        !status.hidden
      )
        api.beginPhotoMoment(status.current);
      else if (q.photoMomentId && status.current !== q.photoMomentId) {
        api.endPhotoMoment(q.photoMomentId);
        restoreHeldDirections();
      }
      api.setSummitPhotoPresentation(status.summitPending === true);
      api.setTrailPhotoPresentation(
        !status.hidden &&
          !status.summitGroup &&
          photos.some((memory) =>
            memory.photos?.some(
              (photo) =>
                photo.id === status.current &&
                (photo.orientation === "portrait" ||
                  photo.width < photo.height),
            ),
          ),
      );
    },
    [restoreHeldDirections, photos],
  );
  const togglePause = useCallback(() => {
    const current = apiRef.current?.getSnapshot()?.state;
    if (current === "PAUSED") resumeManual();
    else {
      apiRef.current?.clearInput();
      apiRef.current?.pause("manual_pause");
    }
  }, [resumeManual]);

  useEffect(() => {
    if (!open) return;
    focusBefore.current = triggerElement ?? document.activeElement;
    const root =
        document.getElementById("root") ??
        document.querySelector(".site-frame"),
      wasInert = root?.inert;
    scrollBefore.current = {
      x: window.scrollX,
      y: window.scrollY,
      body: document.body.style.overflow,
      html: document.documentElement.style.overflow,
    };
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    if (root) root.inert = true;
    dialogRef.current?.focus();
    return () => {
      document.body.style.overflow = scrollBefore.current?.body ?? "";
      document.documentElement.style.overflow =
        scrollBefore.current?.html ?? "";
      if (root) root.inert = wasInert ?? false;
      if (scrollBefore.current)
        window.scrollTo(scrollBefore.current.x, scrollBefore.current.y);
      focusBefore.current?.isConnected && focusBefore.current.focus?.();
    };
  }, [open, triggerElement]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false,
      ready = false;
    setError(null);
    publishedSnapshotRef.current = initial;
    setSnapshot(initial);
    setGallery(null);
    eventsRef.current = [];
    const timeout = window.setTimeout(() => {
      if (!cancelled && !ready) setError("The trail did not finish loading.");
    }, 12000);
    import("./game/PhaserHost.js")
      .then(async ({ createHikingGame }) => {
        if (cancelled) return;
        const api = await createHikingGame(hostRef.current, {
          reducedMotion:
            reducedMotion ??
            window.matchMedia("(prefers-reduced-motion: reduce)").matches,
          debug,
          art,
          renderer,
          restText: t.rest,
          hintLocale: locale,
          touchControls: touchRef.current,
          onSnapshot: (next) => {
            if (!cancelled) {
              ready = true;
              const previous = publishedSnapshotRef.current;
              publishedSnapshotRef.current = next;
              if (
                previous.state !== next.state ||
                previous.safeMemoryPresentation !== next.safeMemoryPresentation
              )
                flushSync(() => setSnapshot(next));
              else setSnapshot(next);
            }
          },
          onEvent: (event) => {
            if (cancelled) return;
            eventsRef.current = [...eventsRef.current.slice(-99), event];
            if (event.type === "fatal-error")
              setError(event.message ?? "Render failed.");
            if (event.type === "summit") onCompleteRef.current?.(event.summary);
          },
        });
        if (cancelled) {
          api.dispose();
          return;
        }
        apiRef.current = api;
      })
      .catch((reason) => {
        if (!cancelled) setError(reason.message);
      });
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      apiRef.current?.dispose();
      apiRef.current = null;
    };
  }, [open, instance, debug, art, reducedMotion, renderer, t.rest, locale]);

  useEffect(() => {
    if (open) setShowTouch(window.matchMedia("(pointer: coarse)").matches);
  }, [open]);
  useEffect(() => {
    apiRef.current?.setTouchControls(showTouch);
  }, [showTouch]);

  useEffect(() => {
    if (!open) return;
    const keymap = {
      KeyA: "left",
      ArrowLeft: "left",
      KeyD: "right",
      ArrowRight: "right",
      KeyW: "up",
      ArrowUp: "up",
      KeyS: "down",
      ArrowDown: "down",
      Space: "jump",
      KeyE: "push",
    };
    const down = (event) => {
      if (galleryRef.current) return;
      if (event.code === "Tab") {
        const list = [
          ...dialogRef.current.querySelectorAll(
            "button:not([disabled]),[href],input:not([disabled])",
          ),
        ].filter(
          (element) =>
            element.getClientRects().length && !element.closest("[inert]"),
        );
        const first = list[0],
          last = list.at(-1);
        if (!first) return;
        if (
          event.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === dialogRef.current)
        ) {
          event.preventDefault();
          last.focus();
        } else if (
          !event.shiftKey &&
          (document.activeElement === last ||
            document.activeElement === dialogRef.current)
        ) {
          event.preventDefault();
          first.focus();
        }
        return;
      }
      if (event.code === "Escape") {
        event.preventDefault();
        if (event.repeat) return;
        const current = apiRef.current?.getSnapshot()?.state;
        if (current === "PAUSED") resumeManual();
        else if (
          [
            "PLAYING",
            "FORCED_REST",
            "RESPAWNING",
            "SUMMIT_SEQUENCE",
            "SUMMIT",
            "PHOTO_MOMENT",
          ].includes(current)
        ) {
          apiRef.current?.clearInput();
          apiRef.current?.pause("manual_pause");
        } else close("escape");
        return;
      }
      if (
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        /^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName) ||
        event.target?.isContentEditable
      )
        return;
      const action = keymap[event.code];
      if (!action || !dialogRef.current?.contains(document.activeElement))
        return;
      event.preventDefault();
      const q = apiRef.current?.getSnapshot(),
        continuous =
          ["left", "right"].includes(action) ||
          (q?.traversalMode !== "trail" && ["up", "down"].includes(action));
      if (event.repeat || activeKeys.current.has(event.code)) {
        // A physical direction can outlive a pause or browser focus transition.
        if (continuous && q?.state === "PLAYING") {
          activeKeys.current.set(event.code, action);
          apiRef.current?.setInput(action, `key:${event.code}`, false);
          apiRef.current?.setInput(action, `key:${event.code}`, true);
        }
        return;
      }
      // Keep the physical key latched until keyup, even when the controller clears
      // intentions during a mode transition, gallery, pause, or death.
      activeKeys.current.set(event.code, action);
      apiRef.current?.setInput(action, `key:${event.code}`, false);
      apiRef.current?.setInput(action, `key:${event.code}`, true);
    };
    const up = (event) => {
      const action = activeKeys.current.get(event.code);
      if (action) {
        event.preventDefault();
        apiRef.current?.setInput(action, `key:${event.code}`, false);
        activeKeys.current.delete(event.code);
      }
    };
    const suspend = () => {
      for (const [code, action] of activeKeys.current)
        apiRef.current?.setInput(action, "key:" + code, false);
      activeKeys.current.clear();
      apiRef.current?.clearInput();
      apiRef.current?.pause("document_hidden");
    };
    const restore = () => {
      if (!document.hidden) apiRef.current?.resume("document_hidden");
    };
    const visibility = () => (document.hidden ? suspend() : restore());
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", suspend);
    window.addEventListener("focus", restore);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", suspend);
      window.removeEventListener("focus", restore);
      document.removeEventListener("visibilitychange", visibility);
      activeKeys.current.clear();
      apiRef.current?.clearInput();
    };
  }, [open, close, resumeManual]);

  if (!open) return null;
  const systemMessage = [
    "checkpoint_unlocked",
    "respawn_complete",
    "wall_failure",
    "clip_required",
  ].includes(snapshot.message?.trigger)
    ? snapshot.message
    : null;
  const themeStyle = {
    "--hiking-bg": theme.background ?? "#020d18",
    "--hiking-panel": theme.panel ?? "#061827",
    "--hiking-text": theme.text ?? "#f0f6f8",
    "--hiking-blue": theme.accent ?? "#168cff",
    "--hiking-font":
      theme.fontFamily ?? "Inter, ui-sans-serif, system-ui, sans-serif",
  };
  const controlProps = {
    apiRef,
    resetToken,
    disabled: state !== "PLAYING" || !!gallery,
  };
  return createPortal(
    <div
      className="hiking-overlay"
      style={themeStyle}
      role="dialog"
      aria-modal="true"
      aria-label="Hiking game"
      tabIndex={-1}
      ref={dialogRef}
    >
      <div className="hiking-shell">
        <div className="hiking-game-content" inert={gallery ? true : undefined}>
          <header className="hiking-top">
            <div className="hiking-brand">
              <span>ABOUT / INTERESTS</span>
              <strong>
                HIKING <b>↗</b>
              </strong>
            </div>
            <div className="hiking-top-actions">
              <button
                onClick={togglePause}
                disabled={["LOADING", "READY"].includes(state)}
              >
                {state === "PAUSED" ? t.resume : t.pause}
              </button>
              <button
                className="hiking-close"
                onClick={() => close("close-button")}
              >
                {t.close} <span aria-hidden="true">×</span>
              </button>
            </div>
          </header>
          <div className={`hiking-hud ${sequence || atEnd ? "quiet" : ""}`}>
            <div className="hiking-effort">
              <span>{t.effort}</span>
              <b>{Math.round(snapshot.effort)}%</b>
              <i>
                <em style={{ width: `${snapshot.effort}%` }} />
              </i>
            </div>
            <div className="hiking-route">
              <span>START</span>
              <i
                role="progressbar"
                aria-label="Trail progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(snapshot.highestProgress * 100)}
              >
                <em style={{ width: `${snapshot.highestProgress * 100}%` }} />
                <b style={{ left: `${snapshot.progress * 100}%` }} />
              </i>
              <span>SUMMIT</span>
            </div>
            <div className="hiking-hud-extra">
              {snapshot.unlockedPhotos.length}/6 memories
            </div>
          </div>
          <div
            className="hiking-stage"
            ref={hostRef}
            aria-label="Illustrated hiking trail"
          />
          {systemMessage && state === "PLAYING" && (
            <div
              key={systemMessage.id}
              className="hiking-speech hiking-system-message"
              style={{ "--speech-ms": `${systemMessage.durationMs ?? 3200}ms` }}
              aria-live="polite"
            >
              {systemMessage.trigger === "checkpoint_unlocked"
                ? "Checkpoint saved"
                : systemMessage.text}
            </div>
          )}
          <MemoryPresentation
            memories={photos}
            snapshot={snapshot}
            suspended={!!gallery}
            reducedMotion={
              reducedMotion ??
              window.matchMedia("(prefers-reduced-motion: reduce)").matches
            }
            onOpen={expandMemory}
            onStatus={onMemoryStatus}
            fallbackFocus={dialogRef}
          />
          <div
            className={`hiking-controls ${showTouch && state === "PLAYING" ? "show" : ""} ${wall || via ? "hiking-controls-directional" : ""}`}
          >
            <div className="hiking-dpad">
              <ControlButton
                {...controlProps}
                action="left"
                label="←"
                accessibleLabel="Move left"
              />
              <ControlButton
                {...controlProps}
                action="right"
                label="→"
                accessibleLabel="Move right"
              />
              {(wall || via) && (
                <>
                  <ControlButton
                    {...controlProps}
                    action="up"
                    label="↑"
                    accessibleLabel="Move up"
                  />
                  <ControlButton
                    {...controlProps}
                    action="down"
                    label="↓"
                    accessibleLabel="Move down"
                  />
                </>
              )}
            </div>
            <div
              className={`hiking-context-controls ${wall ? "no-action" : ""}`}
            >
              <ControlButton
                {...controlProps}
                action="jump"
                label="JUMP"
                disabled={
                  controlProps.disabled ||
                  special ||
                  !!snapshot.pushSectionId ||
                  snapshot.jumpLocked
                }
              />
              <ControlButton
                {...controlProps}
                action="push"
                label={via ? "CLIP" : "PUSH"}
                disabled={
                  controlProps.disabled ||
                  wall ||
                  (via ? mode !== "via_waiting_clip" : !snapshot.pushSectionId)
                }
              />
            </div>
          </div>

          <footer className="hiking-footer">
            <span>
              {level.world.routeIsRealGeography ? "TRAIL" : "ILLUSTRATED TRAIL"}
            </span>
            <div>
              <button
                onClick={() => setShowCredits((value) => !value)}
                aria-expanded={showCredits}
              >
                Credits
              </button>
              <button onClick={() => setShowTouch((value) => !value)}>
                {showTouch ? "Hide" : "Show"} touch controls
              </button>
            </div>
          </footer>
          {showCredits && (
            <div className="hiking-credits">
              <button
                className="hiking-credits-close"
                onClick={() => setShowCredits(false)}
                aria-label="Close credits"
              >
                ×
              </button>
              <span className="hiking-kicker">ASSET CREDITS</span>
              <HikingAssetCredits />
            </div>
          )}
          {state === "LOADING" && !error && (
            <div className="hiking-panel">
              <span className="hiking-kicker">HIKING</span>
              <h2>{t.loading}</h2>
            </div>
          )}
          {error && (
            <div className="hiking-panel">
              <span className="hiking-kicker">HIKING</span>
              <h2>{t.error}</h2>
              <p>{error}</p>
              <div className="hiking-panel-actions">
                <button onClick={() => setInstance((number) => number + 1)}>
                  {t.retry}
                </button>
                <button onClick={() => close("close-button")}>{t.close}</button>
              </div>
            </div>
          )}
          {state === "READY" && (
            <div className="hiking-panel hiking-ready">
              <span className="hiking-kicker">THE TRAIL</span>
              <h1>{t.ready}</h1>
              <ControlsTutorial locale={locale} touch={showTouch} />
              <div className="hiking-panel-actions">
                <button
                  className="hiking-primary"
                  onClick={() => {
                    apiRef.current?.start();
                    dialogRef.current?.focus();
                  }}
                >
                  {t.start} <span aria-hidden="true">↗</span>
                </button>
                <button onClick={() => apiRef.current?.previewSummit()}>
                  {t.preview}
                </button>
              </div>
            </div>
          )}
          {state === "PAUSED" && !gallery && (
            <div className="hiking-panel hiking-pause">
              <span className="hiking-kicker">PAUSED</span>
              <h2>Take your time.</h2>
              <div className="hiking-panel-actions">
                <button className="hiking-primary" onClick={resumeManual}>
                  {t.resume}
                </button>
                <button onClick={() => apiRef.current?.previewSummit()}>
                  {t.preview}
                </button>
                <button onClick={() => apiRef.current?.restart()}>
                  {t.restart}
                </button>
                {unlockedMemories.length > 0 && (
                  <button
                    onClick={(event) =>
                      expandMemories(
                        unlockedMemories.map((memory) => memory.id),
                        null,
                        event.currentTarget,
                      )
                    }
                  >
                    View unlocked memories
                  </button>
                )}
              </div>
            </div>
          )}
          {sequence && (
            <div className="hiking-summit-note" aria-live="polite">
              <button onClick={() => apiRef.current?.skipPresentation()}>
                Skip
              </button>
            </div>
          )}
          {atEnd && (
            <div
              className={`hiking-ending ${state === "SUMMIT_PREVIEW" ? "preview" : ""} ${previewVisible ? "memory-active" : ""}`}
            >
              <div className="hiking-ending-copy">
                <span className="hiking-kicker">
                  {state === "SUMMIT_PREVIEW" ? "SUMMIT PREVIEW" : "SUMMIT"}
                </span>
                <h1>
                  {state === "SUMMIT_PREVIEW" ? t.previewTitle : t.finish}
                </h1>
                {state === "SUMMIT" && (
                  <strong className="hiking-altitude">2499 m</strong>
                )}
                {state === "SUMMIT_PREVIEW" && <p>A view before the climb.</p>}
              </div>
              {showEndActions && (
                <div className="hiking-ending-actions">
                  <div className="hiking-panel-actions">
                    {endMemories.length > 0 && (
                      <button
                        onClick={(event) =>
                          expandMemories(
                            endMemories.map((memory) => memory.id),
                            null,
                            event.currentTarget,
                          )
                        }
                      >
                        {t.memories}
                      </button>
                    )}
                    <button
                      className="hiking-primary"
                      onClick={() => {
                        setGallery(null);
                        apiRef.current?.restart();
                      }}
                    >
                      {t.restart}
                    </button>
                    <button onClick={() => close("back-to-about")}>
                      {t.back}
                    </button>
                  </div>
                  {state === "SUMMIT" && (
                    <small>
                      {formatDuration(
                        snapshot.winSummary?.activeSeconds ??
                          snapshot.activeSeconds,
                      )}{" "}
                      · {snapshot.unlockedPhotos.length}/6 memories ·{" "}
                      {snapshot.falls} falls
                    </small>
                  )}
                </div>
              )}
            </div>
          )}
          {debug && (
            <div className="hiking-debug">
              {snapshot.currentChapter ?? snapshot.zone}/{snapshot.routeSegment}{" "}
              · {snapshot.material}/{snapshot.surfaceId} · {mode} · local{" "}
              {((snapshot.localProgress ?? 0) * 100).toFixed(1)}% global{" "}
              {(snapshot.progress * 100).toFixed(1)}% / best{" "}
              {(snapshot.highestProgress * 100).toFixed(1)}% · CP{" "}
              {snapshot.checkpoint} · memory {snapshot.memoryPreviewId ?? "—"}{" "}
              queued {(snapshot.pendingMemories ?? []).join(",") || "—"} · clips{" "}
              {(snapshot.clipFlags ?? []).map(Boolean).map(Number).join("/")}{" "}
              gate {snapshot.currentClip ?? "—"} held{" "}
              {Number(snapshot.clipHeld ?? false)} release{" "}
              {Number(snapshot.clipNeedsRelease ?? false)} · wall{" "}
              {snapshot.wallProgress?.toFixed(2) ?? "—"} error{" "}
              {snapshot.wallError?.toFixed(1) ?? "—"} outside{" "}
              {snapshot.wallOutsideSeconds?.toFixed(2) ?? "—"}s · x{" "}
              {snapshot.x?.toFixed(0)} y {snapshot.feetY?.toFixed(0)}
              {snapshot.camera && (
                <>
                  {" "}
                  · camera {snapshot.camera.scrollX?.toFixed(0)}/
                  {snapshot.camera.scrollY?.toFixed(0)} zoom{" "}
                  {snapshot.camera.zoom?.toFixed(2)} anchor{" "}
                  {snapshot.camera.anchorX?.toFixed(0)}/
                  {snapshot.camera.anchorY?.toFixed(0)} bounds{" "}
                  {JSON.stringify(snapshot.camera.bounds)}
                </>
              )}
            </div>
          )}
        </div>
        {gallery && (
          <MemoryGallery
            memories={filterMemoryPhotos(
              photos.filter((memory) => gallery.ids.includes(memory.id)),
              snapshot.unlockedPhotoIds,
              { all: gallery.all },
            )}
            initialPhotoId={gallery.photoId}
            returnFocus={gallery.trigger}
            fallbackFocus={dialogRef}
            onClose={closeMemory}
            title={
              gallery.ids.length === 1
                ? memoryById(gallery.ids[0])?.title
                : gallery.ids.length === 6
                  ? "Six chapters from the trail"
                  : "Memories from the trail"
            }
          />
        )}
      </div>
    </div>,
    document.body,
  );
}
