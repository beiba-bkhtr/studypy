# StudyPy

StudyPy is an RPG-style Python learning app: interactive lessons, in-browser code
execution via Pyodide, a Monaco editor, realtime sandbox/duel features, and an
optional Gemini-powered mentor.

Built with React 19, Vite, TypeScript, Tailwind CSS v4, Firebase and Socket.IO.

## Requirements

- Node.js 20+
- A Firebase project (Auth + Firestore)
- A Gemini API key, if you want the AI mentor and generated daily challenges

## Getting started

```bash
npm install
cp .env.example .env   # then fill in the values
npm run dev
```

The dev server runs at http://127.0.0.1:3000.

## Connecting Firebase

This repository ships **no credentials**. `firebase-applet-config.json` is an
empty template; real values are read from the environment.

1. Create a project at https://console.firebase.google.com
2. Enable **Authentication** (Email/Password and, optionally, Google) and
   **Firestore Database**.
3. Add a Web app, then copy its config into `.env`:

   ```
   VITE_FIREBASE_API_KEY="..."
   VITE_FIREBASE_AUTH_DOMAIN="your-project.firebaseapp.com"
   VITE_FIREBASE_PROJECT_ID="your-project"
   VITE_FIREBASE_STORAGE_BUCKET="your-project.firebasestorage.app"
   VITE_FIREBASE_MESSAGING_SENDER_ID="..."
   VITE_FIREBASE_APP_ID="..."

   FIREBASE_PROJECT_ID="your-project"
   ```

   `FIREBASE_PROJECT_ID` is used server-side to verify browser ID tokens and
   must match the project above.

Accounts are created in Firebase Auth from a nickname, as
`u<hex>@pyquest.app`. That domain is an internal identifier, never shown in the
UI — see the note in `src/contexts/AuthContext.tsx` before changing it.

You will also need Firestore security rules; none are included here.

## Scripts

```bash
npm run dev       # dev server with HMR
npm run build     # production build into dist/
npm run preview   # serve the production build
npm run lint      # tsc --noEmit
```

## Performance

The app profiles the machine on first load — reduced-motion preference, CPU
cores, memory, connection, plus a short frame-rate probe — and drops to a
cheaper rendering path on weaker hardware, setting `data-perf="low"` on
`<html>`. CSS then disables backdrop filters and clamps large blur radii, so
the layout is identical but much cheaper to draw. Users can override the choice
from the profile menu; an explicit choice is remembered and wins over detection.

The 3D hero scene is code-split, loads only when scrolled into view, and is
skipped entirely without WebGL support. The Python runtime is fetched on first
use rather than at startup.

## Branding

The product name lives in `src/constants/brand.ts` (`BRAND_NAME`) and drives
every user-facing string plus the `localStorage` namespace. Renaming means
editing that file, then `index.html`, `metadata.json` and this README.

## License

See [LICENSE](LICENSE).
