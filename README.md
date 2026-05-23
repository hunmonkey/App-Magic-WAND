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
The network page also includes a router finder for the current gateway and common router addresses.

## Work tools

The `업무 도구` menu includes ZIP backup, network drive transfer, saved transfer paths, and desktop web shortcut sets with optional custom icons.
The `문서 관리` menu includes label sheet generation with preset or custom grid sizes.

## Layout

The app opens as a maximized standard window with the native menu bar hidden and the window buttons available.
Use the left side menu groups `PC 관리`, `문서 관리`, `업무 도구`, and `프로그램 종료` to move through the app.

## Legacy Python prototype

The earlier Python/PySide6 prototype remains in `src/magic_wand/` for reference during migration.
The active app is now the Electron version.
