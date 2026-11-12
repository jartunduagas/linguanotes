# LinguaNotes

A personal language-study app to keep your notes organized by category and quiz you on
words, translations, and conjugations — so you can actually memorize them.

Built as a **zero-install web app**: it runs directly in any modern browser on your
**phone or computer**. No accounts, no server, no build step.

## What it does

- **Pick your learning language:** French, English, Portuguese, or Japanese.
- **Every word has English + Spanish translations.**
- **Organize notes by category** (Verbs, Vocabulary, Phrases, or your own custom ones).
- **Auto-generated conjugations** (French / English / Portuguese): activate only the
  tenses you want so you're not overwhelmed, and the app conjugates verbs for you.
- **Japanese mode:** words with translations + a dedicated **Writing & Reading** practice
  for the Hiragana and Katakana alphabets (character ↔ romaji drills).
- **Smart quiz:** random questions in all directions, prioritizing new words and the ones
  you struggle with most (it tracks your answer history).

## Theme

Dark slate background with a **crimson** accent — dark but soft.

## How to run it

The app uses ES module imports, so it must be served over `http://` (opening the file
directly with `file://` won't work — browsers block module loading there).

**On your computer** — from inside the `linguanotes` folder:

```bash
node serve.mjs
```

Then open the printed URL (`http://localhost:8000`). No dependencies to install.
(You can also use `python3 -m http.server` if you prefer.)

**On your phone (same Wi-Fi as your computer):** run `node serve.mjs`, find your
computer's local IP (e.g. `192.168.1.20`), and open `http://192.168.1.20:8000` on your phone.

**Best option — host it for free:** push this repo to GitHub and enable **GitHub Pages**.
You'll get a public URL that works on any device, anywhere.

> Note: the app loads React from a CDN at runtime, so your browser needs an internet
> connection the first time it loads. Your study data is stored locally in your browser.

## Testing

Pure logic (conjugation, quiz scoring, kana drills) has sanity tests:

```bash
node test/logic.test.mjs
```

## Data & storage

All your notes live in your browser's `localStorage` (so each device has its own copy).
The storage code is isolated in `src/storage.js` behind a small interface, so cloud sync
(shared notes across phone + computer) can be added later without rewriting the app.
