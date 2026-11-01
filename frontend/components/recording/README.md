# Typing recording integration

Mount from a client component in the dock / TopBar:

```tsx
import { TypingRecorder } from "@/components/recording/typing-recorder";

<TypingRecorder targetRef={typingTargetRef} disabled={isUnavailable} />
```

`targetRef` is `React.RefObject<HTMLElement | null>`. It is read on capture frames,
not at mount. A null ref falls back to `document.querySelector(targetSelector)`;
`targetSelector` defaults to `#typing-tab`. Choose the element containing exactly
the desired recording area, without the dock. `disabled` blocks new recordings
while keeping the stop button usable. The microphone checkbox defaults to on.

Desktop HTTPS / localhost Chrome or Edge with Capture Handle is required. The
native chooser remains user-controlled; both `displaySurface === "browser"` and
the unique current-tab capture handle must match. Unsupported browsers, another
tab, screens and windows fail closed. The canvas maps CSS viewport coordinates
to capture pixels and validates them each frame. Changes to target geometry or
viewport size stop capture rather
than sampling a potentially stale full-tab frame with newer DOM coordinates.
Pinch zoom, inconsistent frame geometry, hidden tabs, detached targets and targets
outside the viewport terminate capture. Browser zoom / DPR are mapped from actual
video dimensions. Recordings stop after 5 minutes or near 100 MiB; encoded chunks
are retained intact and a final overflow reports an error rather than corrupting
the file. Only optional microphone audio is recorded (no system/tab audio).

The preview offers the original and real-time re-encoding of the selected interval
through canvas + Web Audio + MediaRecorder. Export may take the interval's full
duration, but it runs after the editor closes so typing can continue. A corner
notification reports progress; cancelling restores the editor and its range.
All streams, timers, audio
contexts and preview/export object URLs are disposed. Download URLs are revoked
after the browser handoff. No uploads, new packages or layout edits are needed.
Restart Next after the `microphone=(self)` policy change.

The recording button returns focus to the typing input after capture starts, so
Space cannot accidentally click Stop. In the editor, Space is reserved for
play/pause even when a button has focus. I/O set the selection start/end, arrows
seek by 0.1 seconds (Shift: 1 second), R resets, M mutes, L toggles looping, and
Ctrl/Cmd+S exports. Timeline slider controls keep their own keyboard behavior.

Run focused checks:

```sh
npx tsx --test features/recording/recording.test.mts
npx eslint components/recording features/recording
```

Manual browser verification: select current tab and record with/without mic;
reject window/monitor/another tab; cancel chooser and mic prompt; stop sharing
from browser; resize/scroll/zoom; hide tab; unmount while chooser or export is
pending; verify permission indicators turn off; download original; select a
short interval and verify exported playback duration and audible keyboard sound;
cancel export; test the 5-minute and byte limits. Native capture, audio sync and
encoder behavior need a real supported browser, beyond mocked device tests.
