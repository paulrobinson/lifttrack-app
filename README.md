# LiftTrack — Source Code

Progressive overload tracker. Pure static React SPA — no backend, no database.  
All data stored in browser `localStorage`.

**Live app:** https://paulrobinson.github.io/lifttrack-app/  
**GitHub repo (built files):** https://github.com/paulrobinson/lifttrack-app

## Stack

- React 18 + TypeScript
- Vite (build)
- Tailwind CSS v3 + shadcn/ui components
- No backend — localStorage only

## Key files

| File | Purpose |
|---|---|
| `client/src/pages/LiftTracker.tsx` | Entire app UI — all components in one file |
| `client/src/lib/storage.ts` | localStorage layer (CRUD for exercises, sessions, sets) |
| `client/src/index.css` | All custom CSS — design tokens, exercise cards, rep bar, animations |
| `client/index.html` | Entry HTML with font imports |

## localStorage keys

| Key | Contents |
|---|---|
| `lt_exercises` | Array of Exercise objects |
| `lt_sessions` | Array of Session objects |
| `lt_session_sets` | Array of SessionSet objects |
| `lt_next_id` | Auto-incrementing ID counter |

## Getting started

```bash
npm install
npm run build        # outputs to dist/public/
```

For local dev, serve `dist/public/` with any static file server.  
The `npm run dev` script starts an old Express server that is no longer used —  
ignore it. Only `npm run build` is needed.

## Deployment

Built files are pushed manually to the `paulrobinson/lifttrack-app` GitHub repo  
and served via GitHub Pages. There is no CI pipeline.

## Notes for the next developer

- `package.json` contains many unused dependencies leftover from the original  
  Express/SQLite scaffolding (drizzle, passport, express, etc.). Safe to prune.
- `server/`, `shared/`, `drizzle.config.ts` are dead code — the app no longer  
  uses a backend.
- The `widget.html` and `screenshot.png` in `dist/public/` are for the portfolio  
  embed widget — regenerate the screenshot with Playwright after visual changes.
- No `.env` files — no secrets anywhere in this project.
