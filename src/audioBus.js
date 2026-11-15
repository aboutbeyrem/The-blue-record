// Only one thing on the page should make sound at a time: the video, the quick
// "hear a year" player, or the app in the frame. Whoever starts says so, and the
// others stop.

const NAME = 'blue-record:audio';

/** Call when you start making sound. `from` is "video", "listen" or "app". */
export function announce(from) {
  window.dispatchEvent(new CustomEvent(NAME, { detail: from }));
}

/** Run `stop` whenever something other than `me` starts making sound. */
export function onOtherAudio(me, stop) {
  const handler = (e) => { if (e.detail !== me) stop(); };
  window.addEventListener(NAME, handler);
  return () => window.removeEventListener(NAME, handler);
}
