# Project: ARMUT V2 Web Dashboard DIY Hardware Redesign

## Architecture
- **Canvas & Surface Layer (`style.css`)**: Dark DIY modular hardware theme (#171b1a background, #202623 surface, #343e37 trace border, #5ba374 active emerald glow, #aad6b5 text accents) with corner solder jumper pseudo-elements (`:after`) and telemetry grids (`.module-record-facts`).
- **Domain Views Layer (`home-panel.mjs`)**: Dedicated modular views for Physical Deployment Zones (`odalar`), Hardware Logic Engine (`otomasyonlar`), Multi-Pin Batch Actuation (`sahneler`), Direct Camera Units (`kameralar`), and Streamlined 3-Device Physical Status (`genel bakış` / `home`).
- **Device Interaction & Modal Layer (`app.mjs`)**: Native dialog modal intercepting Hub card clicks in the devices tab (`#devices`) to configure ST7789 TFT display screen modes (`status`, `presence`, `sensors`, `system`) and brightness/rotation/timeout with safe finite number parsing and integer rounding via `runtime.update()`. Direct access to `#hub` schematic preview and pinout preserved.
- **Hardware Map & Schematic Layer (`hardware-map-view.mjs`, `wiring-view.mjs`)**: Preserved without modification, verified by interactive navigation tests.

## Code Layout
- `style.css`: Dashboard CSS tokens, solder jumper decorations, `.hp-card`, `.presence-active`, responsive device grid.
- `home-panel.mjs`: `renderHome()`, `renderCameras()`, `renderAutomations()`, `renderScenes()`, `renderRooms()`, live event tracking.
- `app.mjs`: `renderDeviceCards()`, hub click modal trigger (`openHubDisplayModal`), navigation route handling.
- `build-cloud.mjs` & `cloudflare-worker.js`: Cloud worker bundling.
- `test/`: 163+ automated node test suites.

## Feature Inventory
| # | Feature | Description | Milestone | Source | Status |
|---|---------|-------------|-----------|--------|--------|
| 1 | Dark DIY Hardware Theme Styling | Add solder jumper `:after` styling, #171b1a bg, #5ba374 presence glow, and hardware telemetry styling to home panel cards | M1 | Survey 1, R1 | DONE |
| 2 | Omit Generic Consumer Smart-Home Flows | Remove `roomForm`, `cameraForm`, room CRUD, manual URL prompts, and consumer lifestyle marketing copy | M1 | Survey 1, R1 | DONE |
| 3 | Redesign Kameralar View | Direct snapshot/stream frames for Camera-01 and Camera-02, radar telemetry, spot LED controls | M1 | Survey 1, R1 | DONE |
| 4 | Redesign Otomasyonlar View | Hardware logic engine view displaying trigger-to-actuator signal paths | M1 | Survey 1, R1 | DONE |
| 5 | Redesign Sahneler View | Multi-pin batch actuation panel with instant execution triggers | M1 | Survey 1, R1 | DONE |
| 6 | Redesign Odalar View | Physical deployment zones (Salon, Giriş / Koridor) showing fixed ESP32 hardware node status and direct controls | M1 | Survey 1, R1 | DONE |
| 7 | Streamline Overview (Genel Bakış) | 3-device physical hardware layout (ESP32-S3 Hub + ST7789 display preview, Camera-02 + live snapshot + LD2410C radar aura, Camera-01 + live snapshot + spot switch) | M2 | Survey 2, R2 | DONE |
| 8 | Hub ST7789 Screen Mode Modal | Click on Hub card in devices tab opens modal to select display screen modes (`status`, `presence`, `sensors`, `system`), brightness, rotation, timeout, and persist via `runtime.update` | M2 | Survey 3, R3 | DONE |
| 9 | Preserve Devices Page Design & Schematics | Keep `hardwareMapView`, interactive pin wiring, and schematic preview intact with zero visual/functional regressions | M3 | Survey 1 & 3, R4 | DONE |
| 10 | Repository Verification & Cloud Build | Pass `node source-check.mjs`, all 163+ tests in `node --test`, and `node build-cloud.mjs` | M3 | Acceptance Criteria | DONE |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | DIY Hardware Views Redesign & CSS Tokens | `style.css` styling, `home-panel.mjs` (kameralar, otomasyonlar, sahneler, odalar redesign, consumer flow omission) | none | DONE |
| 2 | Overview Streamlining & Hub Display Screen Modal | `home-panel.mjs` (`renderHome`), `app.mjs` (`renderDeviceCards` hub modal trigger) | M1 | DONE |
| 3 | Full Verification, Cloud Build & Regression Gate | Comprehensive verification (`source-check.mjs`, `node --test`, `build-cloud.mjs`) | M1, M2 | DONE |

## Interface Contracts
### `app.mjs` ↔ Hub Display Modal
- Input: Device `device.id === 'hub'`, active `runtime.home.settings.hubDisplay` (or `defaultHubDisplay()`).
- Output: Invokes `runtime.update(h => ({ ...h, settings: { ...h.settings, hubDisplay: nextDisplay } }))`.
- Valid screen modes: `'status'`, `'presence'`, `'sensors'`, `'system'`.
- Fallback navigation: modal contains button/link to `#hub` for full pinout/schematic view.
- Number sanitation: `Number.isFinite(rawB) ? Math.max(0, Math.min(100, Math.round(rawB))) : 80`.

### `home-panel.mjs` ↔ Hardware Presence Glow
- CSS class `.presence-active` applied to closest `.hp-card` when `presence-radar` entity is active.
- Styling: `border-color: #5ba374; box-shadow: 0 0 16px #41855b40; background: #233027;`.
