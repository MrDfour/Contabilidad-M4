<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Contabilidad M4 Pro

A desktop accounting application built with React, Vite and Electron.

## Desktop App (Electron)

No web server or browser required — runs as a native desktop application.

**Prerequisites:** Node.js

### Preview the desktop app (without packaging)

```bash
npm install
npm run electron:preview
```

### Build a distributable installer

```bash
npm install
npm run electron:build
```

Installers are placed in the `release/` folder:

| Platform | Output |
|----------|--------|
| Windows  | NSIS installer + portable `.exe` |
| macOS    | `.dmg` |
| Linux    | `.AppImage` + `.deb` |

> **Icons (optional):** Place your icon files at `public/icon.ico` (Windows),
> `public/icon.icns` (macOS), and `public/icon.png` (Linux) before building.

---

## Web / Dev Mode (browser)

**Prerequisites:** Node.js

1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`
