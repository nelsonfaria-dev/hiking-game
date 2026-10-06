import React from "react";
import { credits } from "./game/hikingArt.js";

export function HikingAssetCredits({ className = "" }) {
  return (
    <div className={className} aria-label="Hiking asset credits">
      {credits.map((item) => (
        <p key={item.title}>
          <a href={item.source} target="_blank" rel="noopener noreferrer">
            {item.title}
          </a>{" "}
          by {item.author}, licensed under{" "}
          <a href={item.licenseUrl} target="_blank" rel="noopener noreferrer">
            {item.license}
          </a>
          . Assets extracted, converted and adapted for this game.
        </p>
      ))}
    </div>
  );
}
