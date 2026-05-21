# Magic WAND

Windows desktop app for managing Software.

## Run locally

```powershell
npm install
npm start
```

The first version saves records to `data/ip_records.json`.

## Current network check

When the app starts, it checks:

- Public IP
- Current PC name and private IP information
- Current IP range
- Gateway and DNS information when Windows provides it
- IP usage inside the selected range
- Basic network diagnostics

Use the network buttons in the app to refresh, scan the selected IP range, or run diagnostics.

## Layout

The app opens as a maximized standard window, so the native menu bar and window buttons remain available.
Use the left side menu to open `IP관리` or exit the app.

## Legacy Python prototype

The earlier Python/PySide6 prototype remains in `src/magic_wand/` for reference during migration.
The active app is now the Electron version.
