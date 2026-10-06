# Hiking Game

A mini game I made for my personal page using React, Phaser 3, Matter.js and Vite. Walk, climb and make your way to the summit, with travel photos along the trail.

## Run locally

Requires Node.js 22.12 or newer.

```sh
npm install
npm run dev
```

## Add it to a React project

Run `npm run build:library` and copy `dist-lib` into your project. Serve `public/assets/hiking` at `/assets/hiking`.

```jsx
import { HikingGameAboutAdapter } from './hiking/hiking.js';
import './hiking/hiking.css';

<HikingGameAboutAdapter label="Hiking" />
```

The host needs React and React DOM. `npm run build` creates the standalone site.

[Artwork credits](CREDITS.md)

[![Open the Game](https://img.shields.io/badge/Open_the_Game-168cff?style=for-the-badge)](https://nelsonfaria-dev.github.io/hiking-game-playtest/?v=65)
