// Plays the bell when the kitchen marks a fired round ready (see
// store.tsx's ready-round detection). One shared <audio> element rather
// than a fresh `new Audio()` per call, so a second ready-alert arriving
// while the first is still playing restarts cleanly instead of overlapping.
// Android WebView (like any browser) can block autoplay with no prior user
// gesture - by the time this fires the captain has already logged in and
// tapped around, so it should be allowed, but the play() promise is
// swallowed either way: a missed bell must never surface as an app error.
let bell: HTMLAudioElement | null = null;

function getBell(): HTMLAudioElement | null {
  if (typeof window === "undefined" || typeof Audio === "undefined") return null;
  if (!bell) {
    bell = new Audio("/orderreadybell.mp3");
    bell.preload = "auto";
  }
  return bell;
}

export function playOrderReadyBell() {
  const audio = getBell();
  if (!audio) return;
  try {
    audio.currentTime = 0;
    void audio.play()?.catch(() => {
      // Autoplay blocked, or no audio output on this device - the alert
      // still lands in Alerts either way, this is best-effort only.
    });
  } catch {
    // ignore - same reasoning as above
  }
}
