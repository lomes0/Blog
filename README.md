# Blog Editor

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

A modern blog platform with rich text editing capabilities, built with Next.js
and Lexical editor. Featuring advanced mathematical content support, interactive
visualizations, and series organization.

## Features

- **Rich Text**: Advanced text formatting, Copy + Paste support, Code syntax
  highlighting, Insert Images, Tables and Sticky notes.
- **Math**: Integrates with [Mathlive](https://cortexjs.io/mathlive) for writing
  LaTeX with a Virtual Keyboard.
- **Graph**: Integrates with [Geogebra](https://www.geogebra.org) for graphing
  functions and shapes.
- **Sketch**: Integrates with [Excalidraw](https://excalidraw.com/) for
  hand-drawn like sketches.
- **Blog Organization**: Create posts and organize them into series for
  multi-part content.
- **Responsive UI**: Optimized for all device sizes with high-performance
  rendering.

## Getting Started

See [docs/bootstrap.md](docs/bootstrap.md) for the full from-zero setup (Node, a
Docker Postgres, and the required environment variables).

```
npm install
docker compose up -d
npx prisma migrate dev
npm run dev
```

## Troubleshooting

If you encounter hydration errors or other rendering issues, see
[Hydration Error Troubleshooting](docs/guides/hydration.md) for detailed
instructions.

## Documentation

- [docs/](docs/README.md) — index of all guides, architecture notes, and plans
- [CLAUDE.md](CLAUDE.md) — architecture, API route conventions, and
  authorization rules
- [DESIGN.md](DESIGN.md) — design system: tokens, typography, spacing, component
  conventions
