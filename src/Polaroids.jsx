import React, {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { fitMemoryPhoto } from "./MemoryPresentationQueue.js";
import { parseMemoryCaption } from "./MemoryFrameLabel.js";
import "./memory-browser.css";

const caption = (photo) => photo.caption ?? photo.captionDraft ?? "";
const orientation = (photo) =>
  photo.orientation ??
  ((photo.width ?? 1) < (photo.height ?? 1) ? "portrait" : "landscape");

function MemoryTravelStamp({ place, country }) {
  const arcId = `memory-stamp-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  if (!place && !country) return null;
  return (
    <svg
      className="hiking-memory-travel-stamp"
      viewBox="0 0 100 100"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <path id={arcId} d="M 14 51 A 36 36 0 0 1 86 51" />
      </defs>
      <circle cx="50" cy="50" r="43" />
      <circle cx="50" cy="50" r="36" className="hiking-stamp-inner-ring" />
      <text
        className="hiking-stamp-place"
        style={{ fontSize: place.length > 18 ? 7.1 : 8.5 }}
      >
        <textPath href={`#${arcId}`} startOffset="50%" textAnchor="middle">
          {place.toUpperCase()}
        </textPath>
      </text>
      <path
        className="hiking-stamp-mountains"
        d="m 28 57 15-21 8 12 6-7 16 17 M 36 46 l 7 5 4-6 M 28 61 h 45"
      />
      <text x="50" y="76" textAnchor="middle" className="hiking-stamp-country">
        {country.toUpperCase()}
      </text>
      <path
        className="hiking-stamp-postmark"
        d="M 84 51 q 6-4 12 0 M 85 57 q 6-4 12 0 M 84 63 q 6-4 12 0"
      />
    </svg>
  );
}

// One physical photo treatment for trail moments, summit moments and browsing.
export function MemoryPolaroid({
  photo,
  variant = "automatic",
  onOpen,
  selected = false,
  photoSize,
  rotation = -1.4,
  onReady,
  onLoading,
}) {
  const [failed, setFailed] = useState(false),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    setFailed(false);
    setAttempt(0);
  }, [photo.src, photo.viewSrc]);
  const source = photo.viewSrc ?? photo.src,
    label = caption(photo) || photo.alt || "Hiking photograph";
  const frameLabel = parseMemoryCaption(caption(photo));
  const size =
    photoSize ??
    fitMemoryPhoto(photo, orientation(photo) === "portrait" ? 330 : 480, 460);
  const dimensions = {
    "--photo-width": `${photo.width ?? 4096}px`,
    "--photo-height": `${photo.height ?? 4096}px`,
    "--memory-image-width": `${size.width}px`,
    "--memory-image-height": `${size.height}px`,
    "--memory-rotation": `${rotation}deg`,
    "--memory-stamp-size": `${Math.min(66, Math.max(24, size.width * 0.25))}px`,
    "--memory-caption-size": `${Math.min(27, Math.max(16, size.width * 0.14))}px`,
  };
  const imageLoaded = async (event) => {
    const image = event.currentTarget;
    try {
      await image.decode();
    } catch {}
    if (image.isConnected) onReady?.(photo.id);
  };
  const picture = failed ? (
    <div className="hiking-photo-error" role="status">
      <span>This photo could not load.</span>
      <button
        type="button"
        onClick={(event) => {
          event.currentTarget.closest('[role="dialog"]')?.focus();
          onLoading?.(photo.id);
          setFailed(false);
          setAttempt((n) => n + 1);
        }}
      >
        Retry photo
      </button>
    </div>
  ) : (
    <img
      key={`${source}:${attempt}`}
      src={source}
      alt={photo.alt ?? ""}
      width={photo.width}
      height={photo.height}
      loading="eager"
      decoding="async"
      onLoad={imageLoaded}
      onError={() => {
        setFailed(true);
        onReady?.(photo.id);
      }}
    />
  );
  return (
    <figure
      className={`hiking-memory-polaroid hiking-polaroid hiking-polaroid-${variant} ${selected ? "is-selected" : ""}`}
      data-photo-id={photo.id}
      data-orientation={orientation(photo)}
      style={dimensions}
    >
      {onOpen && !failed ? (
        <button
          type="button"
          className="hiking-polaroid-open hiking-polaroid-image"
          onClick={(event) => onOpen(photo, event.currentTarget)}
          aria-label={`Open photo: ${label}`}
        >
          {picture}
        </button>
      ) : (
        <div className="hiking-polaroid-image">{picture}</div>
      )}
      <MemoryTravelStamp
        place={frameLabel.place}
        country={frameLabel.country}
      />
      <figcaption>
        {frameLabel.original && (
          <span className="hiking-photo-caption">
            <span className="hiking-memory-label-original">
              {frameLabel.original}
            </span>
            <span className="hiking-memory-place-name" aria-hidden="true">
              {frameLabel.place}
            </span>
            {(frameLabel.country || frameLabel.year) && (
              <span className="hiking-memory-label-meta" aria-hidden="true">
                {frameLabel.country}
                {frameLabel.country && frameLabel.year && (
                  <span className="hiking-memory-label-divider"> · </span>
                )}
                {frameLabel.year && (
                  <span className="hiking-memory-label-year">
                    {frameLabel.year}
                  </span>
                )}
              </span>
            )}
          </span>
        )}
        {photo.placeYear?.trim() && (
          <span className="hiking-photo-place">{photo.placeYear}</span>
        )}
      </figcaption>
    </figure>
  );
}

// Compatibility exports for existing consumers; the shared card owns its layout.
export const PolaroidCard = MemoryPolaroid;
export function PolaroidStrip({ memory, onOpen, variant = "gallery" }) {
  if (!memory?.photos?.length) return null;
  return (
    <section
      className="hiking-memory-strip"
      aria-label={memory.title ?? "Hiking memory"}
    >
      <div className="hiking-polaroid-row">
        {memory.photos
          .filter((photo) => photo.active !== false)
          .map((photo) => (
            <MemoryPolaroid
              key={photo.id ?? photo.src}
              photo={photo}
              variant={variant}
              onOpen={(item, trigger) => onOpen?.(memory.id, item.id, trigger)}
            />
          ))}
      </div>
    </section>
  );
}

export function MemoryGallery({
  memories,
  initialPhotoId = null,
  onClose,
  returnFocus,
  fallbackFocus,
  title = "Memories",
}) {
  const dialogRef = useRef(null),
    closeRef = useRef(null),
    trackRef = useRef(null),
    photoRefs = useRef(new Map()),
    stripScroll = useRef(0),
    returnPhoto = useRef(null);
  const allPhotos = useMemo(
    () =>
      memories.flatMap((memory) =>
        (memory.photos ?? []).filter((photo) => photo.active !== false),
      ),
    [memories],
  );
  const [enlargedId, setEnlargedId] = useState(initialPhotoId),
    [frame, setFrame] = useState(() => ({
      width: typeof window === "undefined" ? 960 : window.innerWidth,
      height: typeof window === "undefined" ? 540 : window.innerHeight,
    }));
  const enlarged =
    allPhotos.find((photo) => photo.id === enlargedId) ??
    (initialPhotoId != null ? allPhotos[0] : null);
  const directPhoto = initialPhotoId != null,
    short = frame.height <= 580,
    mobile = frame.width <= 650;
  const paperSides = short ? 20 : mobile ? 24 : 32,
    captionReserve = short ? 44 : mobile ? 52 : 58;
  const photoSize = (photo) =>
    fitMemoryPhoto(
      photo,
      Math.max(44, frame.width - paperSides - (mobile ? 42 : 96)),
      Math.max(44, frame.height - captionReserve - paperSides - 80),
    );
  const thumbnailSize = (photo) =>
    fitMemoryPhoto(
      photo,
      Math.min(mobile ? 260 : 310, frame.width - paperSides - 68),
      Math.max(
        44,
        Math.min(
          short ? frame.height - captionReserve - paperSides - 100 : 420,
          frame.height - captionReserve - paperSides - 160,
        ),
      ),
    );
  const closeView = useCallback(() => {
    if (enlarged && !directPhoto) {
      returnPhoto.current = enlarged.id;
      setEnlargedId(null);
    } else onClose();
  }, [enlarged, directPhoto, onClose]);
  useEffect(() => {
    closeRef.current?.focus();
    const keepFocus = (event) => {
      if (
        dialogRef.current?.isConnected &&
        !dialogRef.current.contains(event.target)
      )
        closeRef.current?.focus();
    };
    document.addEventListener("focusin", keepFocus);
    return () => {
      document.removeEventListener("focusin", keepFocus);
      let attempts = 0;
      const restore = () => {
        // The pause panel remounts when browsing closes. Find its replacement
        // trigger when the original button was removed while the dialog was open.
        const replacement =
          !returnFocus?.isConnected && returnFocus
            ? [
                ...(fallbackFocus?.current?.querySelectorAll("button,[href]") ??
                  []),
              ].find(
                (element) =>
                  element.tagName === returnFocus.tagName &&
                  element.textContent === returnFocus.textContent &&
                  element.getAttribute("aria-label") ===
                    returnFocus.getAttribute("aria-label"),
              )
            : null;
        const target = returnFocus?.isConnected
          ? returnFocus
          : (replacement ?? fallbackFocus?.current);
        if (
          target?.isConnected &&
          !target.closest("[inert]") &&
          getComputedStyle(target).visibility !== "hidden"
        ) {
          target.focus?.();
          return;
        }
        if (attempts++ < 15) window.setTimeout(restore, 40);
        else fallbackFocus?.current?.focus?.();
      };
      window.setTimeout(restore, 0);
    };
  }, [returnFocus, fallbackFocus]);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const measure = () =>
      setFrame({ width: dialog.clientWidth, height: dialog.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(dialog);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (enlarged) {
      closeRef.current?.focus();
      return;
    }
    if (trackRef.current) trackRef.current.scrollLeft = stripScroll.current;
    const button = photoRefs.current
      .get(returnPhoto.current)
      ?.querySelector(".hiking-polaroid-open");
    if (button) {
      button.focus({ preventScroll: true });
      returnPhoto.current = null;
    } else closeRef.current?.focus();
  }, [enlarged?.id]);
  const browse = (index) => {
    const photo = allPhotos[Math.max(0, Math.min(allPhotos.length - 1, index))],
      card = photoRefs.current.get(photo?.id),
      track = trackRef.current;
    if (!card || !track) return;
    track.scrollTo({
      left: card.offsetLeft - (track.clientWidth - card.clientWidth) / 2,
      behavior: "instant",
    });
    if (document.activeElement !== track)
      card
        .querySelector(".hiking-polaroid-open")
        ?.focus({ preventScroll: true });
  };
  const keys = (event) => {
    if (event.code === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat) closeView();
      return;
    }
    if (
      !enlarged &&
      ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.code)
    ) {
      event.preventDefault();
      event.stopPropagation();
      const track = trackRef.current,
        focused = document.activeElement?.closest("[data-photo-id]"),
        center = (track?.scrollLeft ?? 0) + (track?.clientWidth ?? 0) / 2;
      let current = allPhotos.findIndex(
        (photo) => photo.id === focused?.dataset.photoId,
      );
      if (current < 0)
        current = allPhotos.reduce((best, photo, index) => {
          const card = photoRefs.current.get(photo.id),
            chosen = photoRefs.current.get(allPhotos[best]?.id);
          return card &&
            chosen &&
            Math.abs(card.offsetLeft + card.clientWidth / 2 - center) <
              Math.abs(chosen.offsetLeft + chosen.clientWidth / 2 - center)
            ? index
            : best;
        }, 0);
      browse(
        event.code === "Home"
          ? 0
          : event.code === "End"
            ? allPhotos.length - 1
            : current + (event.code === "ArrowLeft" ? -1 : 1),
      );
      return;
    }
    if (event.code !== "Tab") return;
    const focusable = [
      ...dialogRef.current.querySelectorAll(
        'button:not([disabled]),[href],input:not([disabled]),[tabindex="0"]',
      ),
    ].filter(
      (element) =>
        element.getClientRects().length && !element.closest("[inert]"),
    );
    event.preventDefault();
    event.stopPropagation();
    if (!focusable.length) {
      dialogRef.current.focus();
      return;
    }
    const current = focusable.indexOf(document.activeElement),
      next =
        current < 0
          ? event.shiftKey
            ? focusable.length - 1
            : 0
          : (current + (event.shiftKey ? -1 : 1) + focusable.length) %
            focusable.length;
    focusable[next].focus();
  };
  return (
    <div
      className="hiking-memory-browser-backdrop"
      onClick={(event) => {
        if (!event.target.closest('figure,button,[role="region"]')) closeView();
      }}
    >
      <section
        className="hiking-memory-browser"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={
          enlarged
            ? `Photograph: ${caption(enlarged) || enlarged.alt || "Hiking photograph"}`
            : title
        }
        tabIndex={-1}
        onKeyDown={keys}
      >
        <button
          ref={closeRef}
          className="hiking-memory-browser-close"
          type="button"
          onClick={closeView}
          aria-label={enlarged ? "Close photo" : "Close memories"}
        >
          <span aria-hidden="true">×</span>
        </button>
        {enlarged ? (
          <div className="hiking-memory-browser-photo">
            <MemoryPolaroid
              key={enlarged.id}
              photo={enlarged}
              variant="gallery"
              photoSize={photoSize(enlarged)}
              rotation={0}
            />
          </div>
        ) : (
          <div
            className="hiking-memory-browser-strip"
            ref={trackRef}
            onScroll={(event) => {
              stripScroll.current = event.currentTarget.scrollLeft;
            }}
            role="region"
            aria-label="Memory photographs"
            tabIndex={0}
          >
            {allPhotos.map((photo) => (
              <div
                key={photo.id ?? photo.src}
                className="hiking-memory-browser-item"
                ref={(element) => {
                  if (element) photoRefs.current.set(photo.id, element);
                  else photoRefs.current.delete(photo.id);
                }}
              >
                <MemoryPolaroid
                  photo={photo}
                  variant="gallery"
                  photoSize={thumbnailSize(photo)}
                  rotation={0}
                  onOpen={(item) => {
                    stripScroll.current = trackRef.current?.scrollLeft ?? 0;
                    setEnlargedId(item.id);
                  }}
                />
              </div>
            ))}
            {!allPhotos.length && <p>No memories discovered yet.</p>}
          </div>
        )}
      </section>
    </div>
  );
}
