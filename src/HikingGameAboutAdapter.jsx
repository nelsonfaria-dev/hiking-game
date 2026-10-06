import React, { useRef, useState } from "react";
import { HikingGameOverlay } from "./HikingGameOverlay.jsx";

// Mount at the existing About interest control. The host owns its surrounding layout.
export function HikingGameAboutAdapter({
  label = "HIKING",
  className = "",
  onComplete,
  locale = "en",
  theme,
  art,
  photos,
  debug = false,
  renderer = "auto",
}) {
  const [open, setOpen] = useState(false),
    trigger = useRef(null);
  return (
    <>
      <button
        type="button"
        ref={trigger}
        className={className}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        {label}
      </button>
      <HikingGameOverlay
        open={open}
        onClose={() => setOpen(false)}
        onComplete={onComplete}
        locale={locale}
        theme={theme}
        art={art}
        photos={photos}
        debug={debug}
        renderer={renderer}
        triggerElement={trigger.current}
      />
    </>
  );
}
