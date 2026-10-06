import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { MemoryPolaroid } from "./Polaroids.jsx";
import {
  MemoryPresentationQueue,
  fitMemoryPhoto,
} from "./MemoryPresentationQueue.js";

const activeStates = [
  "PLAYING",
  "FORCED_REST",
  "PHOTO_MOMENT",
  "RESPAWNING",
  "SUMMIT_SEQUENCE",
  "SUMMIT",
];

export function MemoryPresentation({
  memories,
  snapshot,
  suspended = false,
  reducedMotion = false,
  onOpen,
  onStatus,
  fallbackFocus,
}) {
  const layerRef = useRef(null),
    summitRowRef = useRef(null),
    summitManual = useRef(false),
    summitAutoIndex = useRef(-1),
    latest = useRef({ snapshot, suspended, onStatus }),
    lastStatus = useRef(""),
    readyIds = useRef(new Set()),
    ownsFocus = useRef(false),
    placementRef = useRef(null);
  const queue = useMemo(
    () => new MemoryPresentationQueue(memories, { reducedMotion }),
    [memories, reducedMotion],
  );
  const [view, setView] = useState(() => queue.view()),
    [frame, setFrame] = useState({ width: 1200, height: 750 }),
    [summitSlide, setSummitSlide] = useState(0);
  latest.current = { snapshot, suspended, onStatus };
  useLayoutEffect(() => {
    readyIds.current.clear();
  }, [queue, snapshot.runId]);
  useEffect(() => {
    let previous = performance.now();
    const tick = () => {
      const now = performance.now(),
        current = latest.current,
        previousId = queue.current,
        wasHidden = queue.hidden;
      const pictureReady = queue.visiblePhotoIds.every((id) => {
        if (queue.summitIds.includes(id)) return readyIds.current.has(id);
        const image = layerRef.current?.querySelector(
          `[data-photo-id="${id}"] img`,
        );
        return (
          readyIds.current.has(id) ||
          (image?.complete && image.naturalWidth > 0)
        );
      });
      const next = queue.update(
        {
          ...current.snapshot,
          presentationReady: pictureReady,
          presentationSuspended: current.suspended || document.hidden,
        },
        Math.min(0.1, (now - previous) / 1000),
      );
      previous = now;
      if (
        (ownsFocus.current ||
          layerRef.current?.contains(document.activeElement)) &&
        !current.suspended &&
        (next.current !== previousId || (next.hidden && !wasHidden))
      ) {
        fallbackFocus?.current?.focus?.();
        ownsFocus.current = false;
      }
      setView(next);
      const signature = JSON.stringify([
        next.current,
        next.visiblePhotoIds,
        next.phase,
        next.awaitingReady,
        next.hidden,
        next.summitPending,
        next.summitComplete,
        next.queue.length,
      ]);
      if (signature !== lastStatus.current) {
        lastStatus.current = signature;
        current.onStatus?.(next);
      }
    };
    tick();
    const timer = window.setInterval(tick, 40);
    return () => window.clearInterval(timer);
  }, [queue, fallbackFocus]);
  useEffect(() => {
    const element = layerRef.current?.parentElement;
    if (!element) return;
    const measure = () =>
      setFrame({ width: element.clientWidth, height: element.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const renderHidden =
    view.hidden ||
    (view.summitGroup && view.awaitingReady) ||
    !activeStates.includes(snapshot.state) ||
    suspended ||
    document.hidden;
  useLayoutEffect(() => {
    if (renderHidden && ownsFocus.current && !suspended) {
      fallbackFocus?.current?.focus?.();
      ownsFocus.current = false;
    }
  }, [renderHidden, suspended, fallbackFocus]);
  const photo = queue.photos.get(view.current),
    mobile = frame.width <= 650,
    short = frame.height <= 580,
    summitGroup = view.summitGroup;
  const screenMobile =
      typeof window !== "undefined" && window.innerWidth <= 650,
    screenShort = typeof window !== "undefined" && window.innerHeight <= 580;
  const compactSummit = summitGroup && screenShort && !screenMobile,
    summitCarousel = summitGroup && (mobile || compactSummit),
    summitPaneWidth = compactSummit ? frame.width * 0.58 : frame.width;
  const frameSides = screenShort ? 20 : screenMobile ? 24 : 32,
    captionReserve = screenShort ? 62 : screenMobile ? 74 : 86;
  const hud = layerRef.current?.parentElement?.querySelector(".hiking-hud"),
    hudClearance = hud ? hud.offsetTop + hud.offsetHeight + 12 : 0;
  const placementKey = [
    snapshot.runId,
    view.visiblePhotoIds.join(","),
    frame.width,
    frame.height,
    snapshot.gameplayViewportHeight,
    snapshot.gameplayZoom,
    hudClearance,
  ].join("|");
  if (!placementRef.current || placementRef.current.key !== placementKey) {
    const portrait = photo?.orientation === "portrait";
    let maxWidth = mobile
      ? Math.min(frame.width * 0.82, 340) - frameSides
      : portrait
        ? Math.min(390, Math.max(300, frame.width * 0.25)) - frameSides
        : Math.min(500, Math.max(360, frame.width * 0.31)) - frameSides;
    // Small phones need a readable left lane for the avatar and action tips,
    // even when a tall memory fills all the available vertical space.
    if (mobile && portrait && frame.width <= 360)
      maxWidth = Math.min(maxWidth, frame.width - 200 - frameSides);
    if (photo?.id === "P06" && !mobile)
      maxWidth = Math.min(640, Math.max(560, frame.width * 0.51)) - frameSides;
    let top = Math.max(mobile ? 108 : short ? 125 : 143, hudClearance);
    let maxHeight = Math.max(
      44,
      Math.min(
        frame.height * (mobile ? 0.46 : 0.58),
        frame.height - top - captionReserve - (mobile ? 150 : 110),
      ),
    );
    if (mobile && ["P08", "P09"].includes(photo?.id)) {
      maxWidth = Math.min(maxWidth, frame.width * 0.52 - frameSides);
      maxHeight = Math.min(maxHeight, frame.height * 0.32, 240);
    }
    if (summitGroup) {
      const expectedStageHeight = frame.height - (mobile ? 76 : 93),
        freshViewport =
          Math.abs(
            (snapshot.gameplayViewportHeight ?? 0) - expectedStageHeight,
          ) < 5;
      const stageHeight = freshViewport
          ? snapshot.gameplayViewportHeight
          : expectedStageHeight,
        stageTop = freshViewport
          ? (snapshot.gameplayViewportTop ?? 48)
          : mobile
            ? 48
            : 61;
      const fallbackZoom =
        frame.width /
        (mobile ? 540 : Math.max(760, Math.min(980, frame.width / 1.1)));
      const zoom = freshViewport
        ? (snapshot.gameplayZoom ?? fallbackZoom)
        : fallbackZoom;
      // The camera lowers the summit first. Tall screens keep the complete
      // photographs above the flag; short landscape screens use its left side.
      const subjectTop =
        freshViewport && snapshot.summitSubjectTopRatio != null
          ? stageTop + stageHeight * snapshot.summitSubjectTopRatio
          : stageTop + stageHeight * 0.9 - 159 * zoom;
      top = Math.max(mobile ? 102 : short ? 106 : 132, hudClearance);
      const count = view.visiblePhotoIds.length,
        gap = 22;
      maxWidth = summitCarousel
        ? Math.min(310, summitPaneWidth - 64) - frameSides
        : (frame.width - 64 - gap * (count - 1)) / count - frameSides;
      maxHeight = compactSummit
        ? Math.max(44, stageTop + stageHeight - top - captionReserve - 22 - 8)
        : Math.max(
            44,
            Math.min(
              mobile ? 235 : 350,
              subjectTop -
                top -
                captionReserve -
                12 -
                (summitCarousel ? 22 : 0),
            ),
          );
    }
    placementRef.current = {
      key: placementKey,
      top,
      maxWidth,
      maxHeight,
      side: (snapshot.playerScreenRatio ?? 0.32) > 0.62 ? "left" : "right",
    };
  }
  const { top, maxWidth, maxHeight, side } = placementRef.current,
    size = photo ? fitMemoryPhoto(photo, maxWidth, maxHeight) : null;
  const entrySeconds = summitGroup ? 0.28 : 0.42,
    exitSeconds = summitGroup ? 0.25 : 0.32;
  const progress =
    view.phase === "entering"
      ? Math.min(1, view.phaseSeconds / entrySeconds)
      : view.phase === "exiting"
        ? Math.min(1, view.phaseSeconds / exitSeconds)
        : 1;
  const ease = 1 - Math.pow(1 - progress, 3),
    exit = view.phase === "exiting",
    opacity =
      summitGroup && view.awaitingReady
        ? 0
        : reducedMotion
          ? 1
          : exit
            ? 1 - progress
            : ease;
  const drift = reducedMotion ? 0 : exit ? 65 * progress : 110 * (1 - ease),
    rotation = reducedMotion
      ? -1.4
      : exit
        ? -1.4 + progress * 3
        : -1.4 + (1 - ease) * 7;
  const open = (item, trigger) =>
    onOpen?.(queue.groupByPhoto.get(item.id), item.id, trigger);
  const readiness = {
    onReady: (id) => readyIds.current.add(id),
    onLoading: (id) => readyIds.current.delete(id),
  };
  const selectedSummitSlide = (row) => {
    const slides = [...row.children],
      center = row.scrollLeft + row.clientWidth / 2;
    return slides.reduce(
      (best, slide, index) =>
        Math.abs(slide.offsetLeft + slide.clientWidth / 2 - center) <
        Math.abs(
          slides[best].offsetLeft + slides[best].clientWidth / 2 - center,
        )
          ? index
          : best,
      0,
    );
  };
  const scrollSummit = (index, manual = false) => {
    if (manual) summitManual.current = true;
    const row = summitRowRef.current,
      slide = row?.children[index];
    if (slide)
      row.scrollTo({
        left: slide.offsetLeft - (row.clientWidth - slide.clientWidth) / 2,
        behavior: reducedMotion ? "instant" : "smooth",
      });
  };
  useLayoutEffect(() => {
    summitManual.current = false;
    summitAutoIndex.current = -1;
    setSummitSlide(0);
  }, [snapshot.runId, summitGroup]);
  useEffect(() => {
    if (
      !summitCarousel ||
      renderHidden ||
      view.phase !== "visible" ||
      summitManual.current
    )
      return;
    const index = Math.min(
      view.visiblePhotoIds.length - 1,
      Math.floor(view.phaseSeconds / 3),
    );
    if (index !== summitAutoIndex.current) {
      summitAutoIndex.current = index;
      scrollSummit(index);
    }
  }, [
    summitCarousel,
    renderHidden,
    view.phase,
    view.phaseSeconds,
    view.visiblePhotoIds.length,
  ]);
  const summitKeys = (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const row = event.currentTarget;
    if (row.scrollWidth <= row.clientWidth + 1) return;
    event.preventDefault();
    event.stopPropagation();
    const slides = [...row.children],
      current = selectedSummitSlide(row);
    const index =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? slides.length - 1
          : Math.max(
              0,
              Math.min(
                slides.length - 1,
                current + (event.key === "ArrowRight" ? 1 : -1),
              ),
            );
    scrollSummit(index, true);
  };
  return (
    <div
      ref={layerRef}
      className={`hiking-memory-presentation ${summitGroup ? "at-summit summit-group" : ""} ${compactSummit ? "summit-compact" : ""} side-${side}`}
      data-phase={view.phase}
      data-current-photo={view.current ?? ""}
      data-visible-photos={view.visiblePhotoIds.join(",")}
      data-summit-group={summitGroup}
      data-hidden={renderHidden}
      aria-hidden={renderHidden || !photo}
      onFocusCapture={() => {
        ownsFocus.current = true;
        if (summitCarousel) summitManual.current = true;
      }}
      onBlurCapture={(event) => {
        if (
          event.relatedTarget &&
          !layerRef.current?.contains(event.relatedTarget)
        )
          ownsFocus.current = false;
      }}
      style={{
        top,
        width: compactSummit ? summitPaneWidth : undefined,
        "--memory-top": `${top}px`,
        visibility: renderHidden ? "hidden" : undefined,
        pointerEvents: renderHidden ? "none" : undefined,
      }}
    >
      {summitCarousel && (
        <div className="hiking-summit-carousel-controls" style={{ opacity }}>
          <span>Swipe to see all {view.visiblePhotoIds.length} photos</span>
          <div role="group" aria-label="Choose summit photograph">
            {view.visiblePhotoIds.map((id, index) => (
              <button
                key={id}
                type="button"
                aria-label={`Show summit photo ${index + 1}: ${queue.photos.get(id)?.caption ?? id}`}
                aria-current={summitSlide === index ? "true" : undefined}
                onClick={() => scrollSummit(index, true)}
              >
                <span />
              </button>
            ))}
          </div>
        </div>
      )}
      {summitGroup ? (
        <div
          ref={summitRowRef}
          className="hiking-summit-photo-row"
          role="region"
          aria-label="Summit photographs"
          tabIndex={0}
          onKeyDown={summitKeys}
          onPointerDown={() => {
            summitManual.current = true;
          }}
          onWheel={() => {
            summitManual.current = true;
          }}
          onScroll={(event) =>
            setSummitSlide(selectedSummitSlide(event.currentTarget))
          }
          style={{
            opacity,
            justifyContent:
              view.visiblePhotoIds.length === 1 ? "center" : undefined,
            transform: `translateY(${reducedMotion ? 0 : exit ? 14 * progress : 18 * (1 - ease)}px)`,
          }}
        >
          {view.visiblePhotoIds.map((id, index) => {
            const item = queue.photos.get(id),
              photoSize = fitMemoryPhoto(item, maxWidth, maxHeight);
            return (
              <div
                key={id}
                className="hiking-summit-photo-slide"
                role="group"
                aria-label={`${index + 1} of ${view.visiblePhotoIds.length}`}
              >
                <MemoryPolaroid
                  photo={item}
                  photoSize={photoSize}
                  variant="automatic"
                  rotation={0}
                  {...readiness}
                  onOpen={open}
                />
              </div>
            );
          })}
        </div>
      ) : (
        photo && (
          <div
            className="hiking-memory-stack"
            style={{
              "--memory-image-width": `${size.width}px`,
              "--memory-image-height": `${size.height}px`,
              opacity,
              transform: `translateX(${side === "left" ? -drift : drift}px) rotate(${rotation}deg) scale(${reducedMotion ? 1 : exit ? 1 : 0.94 + 0.06 * ease})`,
            }}
          >
            {view.stackHistory.map((id, index) => (
              <div
                key={id}
                className="hiking-memory-card-back"
                aria-hidden="true"
                data-stack-photo={id}
                style={{
                  "--back-x": `${(view.stackHistory.length - index) * 10}px`,
                  "--back-y": `${(view.stackHistory.length - index) * 7}px`,
                  "--back-rotation": `${index % 2 ? 2 : -1}deg`,
                }}
              />
            ))}
            <MemoryPolaroid
              key={photo.id}
              photo={photo}
              photoSize={size}
              variant="automatic"
              rotation={0}
              {...readiness}
              onOpen={open}
            />
          </div>
        )
      )}
    </div>
  );
}
