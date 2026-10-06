import catalog from "../content/art-slots.json" with { type: "json" };
import { defaultArtOverrides } from "./hikingArt.js";

// The host may replace individual entries without changing physics or level geometry.
export const artSlots = Object.fromEntries(
  catalog.slots.map((slot) => [
    slot.id,
    {
      id: slot.id,
      materialId: slot.materialId,
      src: slot.src,
      approval: slot.approval,
      nativeSize: slot.nativeSize,
      worldSize: slot.worldSize,
      anchor: slot.anchor,
      alphaRequired: slot.alphaRequired,
    },
  ]),
);
export function acceptedArt(overrides = {}) {
  return Object.fromEntries(
    Object.entries(artSlots).map(([id, base]) => {
      const slot = {
        ...base,
        ...(defaultArtOverrides[id] ?? {}),
        ...(overrides[id] ?? {}),
      };
      const source = typeof slot.src === "string" && slot.src;
      const frameSources =
        id === "player.summit_flag_plant" &&
        Array.isArray(slot.frames) &&
        slot.frames.some((f) => typeof f.src === "string" && f.src);
      return [
        id,
        slot.approval === "approved" && (source || frameSources)
          ? slot
          : { ...slot, src: null, frames: [] },
      ];
    }),
  );
}
