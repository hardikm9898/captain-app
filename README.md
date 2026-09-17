# BillerPe Captain App (Android)

Phone-first table-side ordering companion for restaurant captains. Same design, flow and
assets as `../captain-app-prototype`; every read and write goes to the outlet's
**BillerPe local server** (`billerpe-local-exe`) — never to the cloud directly.

See [PLAN.md](PLAN.md) for the screen → endpoint mapping and the deliberate differences from
the prototype.

## Stack

- React 19 + TypeScript + Vite + Tailwind v4 + TanStack Router (hash history, static SPA build)
- Capacitor 8 → `android/` native project (app id `com.billerpe.captain`)
- Fonts (Manrope, Archivo) bundled via `@fontsource`, so the app looks identical offline

## Develop

```sh
npm install
npm run dev              # http://localhost:5180 — works in a desktop browser too
npm run typecheck
```

The app finds the local server in this order: last address that worked → mDNS
`billerpe-local-server.local:4100` → `VITE_EXE_BASE_URL` (see `.env.example`) → the address the
captain types on the login screen (tap the server chip on the outlet card).

## Build the Android app

Requirements: Android SDK (Android Studio), JDK 17–21 (Gradle 8.14 does not run on JDK 25).

```sh
npm run build                         # dist/
npx cap sync android                  # copies dist/ into android/app/src/main/assets
cd android && ./gradlew assembleDebug # android/app/build/outputs/apk/debug/app-debug.apk
```

`android/local.properties` must point `sdk.dir` at your SDK. If Gradle complains about the JDK,
set `JAVA_HOME` to a JDK 21 (or `org.gradle.java.home` in `android/gradle.properties`).
`npx cap open android` opens the project in Android Studio for signing / release builds.

## Local server requirement

The exe must accept the bearer token on the socket handshake for live updates
(`connection/socket.js#resolveHandshakeToken`, added with this app). REST already accepted
`Authorization: Bearer` — the login response token is what the app stores.

## Layout

```
src/lib/exe/        HTTP client, LAN discovery, typed endpoints, socket change feed
src/lib/captain/    store (same useCaptain() contract as the prototype), mappers, bill maths,
                    device-local persistence (drafts, cart round, guests, alerts)
src/components/     prototype UI copied verbatim (ui/ + captain/)
src/routes/         prototype screens (login/profile adapted to real auth and server status)
android/            Capacitor Android project
```
