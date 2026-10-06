import React from "react";
import { createRoot } from "react-dom/client";
import { HikingGameAboutAdapter } from "./index.js";
import "./hiking-game.css";

function App() {
  return (
    <main className="harness">
      <div className="harness-inner">
        <h1>Reach the Summit</h1>
        <HikingGameAboutAdapter label="Open the Game" renderer="canvas" />
      </div>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
