import manifest from "../content/photos.json" with { type: "json" };
import labels from "../content/photo-labels.json" with { type: "json" };
import runtime from "../content/photo-assets.json" with { type: "json" };

export const photoManifest = manifest;

export function buildMemoryGroups(
  sourceManifest,
  editableLabels,
  photoRuntime,
) {
  const sourceById = new Map(
    sourceManifest.photos.map((photo) => [photo.id, photo]),
  );
  const runtimeById = new Map(
    photoRuntime.photos.map((photo) => [photo.id, photo]),
  );
  return sourceManifest.groups.map((group) => {
    const photoIds = group.photoIds.filter(
      (id) => sourceById.get(id)?.active !== false,
    );
    return {
      ...group,
      photoIds,
      safeAnchor: [...group.safeAnchor],
      photos: photoIds.map((id) => {
        const source = sourceById.get(id),
          derived = runtimeById.get(id),
          label = editableLabels.photos[id];
        if (!source || !derived || !label)
          throw new Error(
            `${group.id}: Photo ${id} is missing source, runtime assets, or editable labels.`,
          );
        if (
          source.sourceFile !== label.sourceFile ||
          source.sourceFile !== derived.sourceFile
        )
          throw new Error(
            `${id}: Photo source identity differs between content files.`,
          );
        return {
          ...derived,
          caption: label.caption,
          placeYear: label.placeYear,
          alt: label.alt,
        };
      }),
    };
  });
}

// Coordinates remain in design units. The level adapter owns world
// scaling so photo content edits cannot move or change gameplay triggers.
export const memoryGroups = buildMemoryGroups(manifest, labels, runtime);
