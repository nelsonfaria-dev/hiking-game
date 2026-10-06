import React from "react";

const copy = {
  en: {
    label: "How to play",
    or: "or",
    walk: "Walk",
    walkHelp: "Move along the trail.",
    jump: "Jump",
    jumpHelp: "Clear gaps and obstacles.",
    action: "Push & clip",
    actionHelp: "Tap to push on steep slopes or clip at cable anchors.",
    climb: "Climb",
    climbHelp: "Follow the holds in all four directions.",
    moveKeys: "A and D, or left and right arrows",
    jumpKeys: "Space, W, or up arrow",
    actionKeys: "E",
    climbKeys: "W, A, S and D, or all four arrows",
    moveTouch: "Left and right arrow buttons",
    jumpTouch: "JUMP button",
    actionTouch: "PUSH and CLIP buttons",
    climbTouch: "All four arrow buttons",
    space: "Space",
  },
  "pt-PT": {
    label: "Como jogar",
    or: "ou",
    walk: "Andar",
    walkHelp: "Avança pelo trilho.",
    jump: "Saltar",
    jumpHelp: "Passa os buracos e obstáculos.",
    action: "Impulso e cabo",
    actionHelp: "Toca para usar PUSH nas rampas ou CLIP nas ancoragens.",
    climb: "Escalar",
    climbHelp: "Segue as presas nas quatro direções.",
    moveKeys: "A e D, ou setas para a esquerda e direita",
    jumpKeys: "Espaço, W ou seta para cima",
    actionKeys: "E",
    climbKeys: "W, A, S e D, ou as quatro setas",
    moveTouch: "Botões das setas para a esquerda e direita",
    jumpTouch: "Botão JUMP",
    actionTouch: "Botões PUSH e CLIP",
    climbTouch: "Botões das quatro setas",
    space: "Espaço",
  },
};

function Key({ children, wide = false }) {
  return (
    <kbd className={`hiking-tutorial-key${wide ? " wide" : ""}`}>
      {children}
    </kbd>
  );
}
function Touch({ children }) {
  return <span className="hiking-tutorial-touch">{children}</span>;
}
function Directions({ touch = false, letters = false }) {
  const Cap = touch ? Touch : Key,
    labels = letters ? ["W", "A", "S", "D"] : ["↑", "←", "↓", "→"];
  return (
    <span className={`hiking-tutorial-dpad${touch ? " touch" : ""}`}>
      <Cap>{labels[0]}</Cap>
      <Cap>{labels[1]}</Cap>
      <Cap>{labels[2]}</Cap>
      <Cap>{labels[3]}</Cap>
    </span>
  );
}

// These are illustrations of the controls, not additional input buttons.
export function ControlsTutorial({ locale = "en", touch = false }) {
  const t = copy[locale] ?? copy.en,
    or = <span className="hiking-tutorial-or">{t.or}</span>;
  const rows = [
    {
      id: "walk",
      title: t.walk,
      help: t.walkHelp,
      label: touch ? t.moveTouch : t.moveKeys,
      demo: touch ? (
        <>
          <Touch>←</Touch>
          <Touch>→</Touch>
        </>
      ) : (
        <>
          <Key>A</Key>
          <Key>D</Key>
          {or}
          <Key>←</Key>
          <Key>→</Key>
        </>
      ),
    },
    {
      id: "jump",
      title: t.jump,
      help: t.jumpHelp,
      label: touch ? t.jumpTouch : t.jumpKeys,
      demo: touch ? (
        <Touch>JUMP</Touch>
      ) : (
        <>
          <Key wide>{t.space}</Key>
          {or}
          <Key>W</Key>
          <Key>↑</Key>
        </>
      ),
    },
    {
      id: "action",
      title: t.action,
      help: t.actionHelp,
      label: touch ? t.actionTouch : t.actionKeys,
      demo: touch ? (
        <>
          <Touch>PUSH</Touch>
          <Touch>CLIP</Touch>
        </>
      ) : (
        <Key>E</Key>
      ),
    },
    {
      id: "climb",
      title: t.climb,
      help: t.climbHelp,
      label: touch ? t.climbTouch : t.climbKeys,
      demo: touch ? (
        <Directions touch />
      ) : (
        <>
          <Directions letters />
          {or}
          <Directions />
        </>
      ),
    },
  ];
  return (
    <dl
      className={`hiking-tutorial${touch ? " for-touch" : " for-keyboard"}`}
      aria-label={t.label}
    >
      {rows.map((row) => (
        <div className="hiking-tutorial-row" key={row.id} data-control={row.id}>
          <dt>
            <span className="hiking-tutorial-sr-only">{row.label}</span>
            <span className="hiking-tutorial-demo" aria-hidden="true">
              {row.demo}
            </span>
          </dt>
          <dd>
            <strong>{row.title}</strong>
            <span>{row.help}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}
