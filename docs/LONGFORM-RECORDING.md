# Long-form Practice and Local Recording

Working branch: `feature/longform-recording`. No database migration is required.

## Long-form practice

- Open Korean or English in the Dock and choose Long-form.
- Ten original TypeNews essays are included, five per language. User-authored text import and local custom-text management are not exposed.
- Sentence segmentation preserves paragraph boundaries and caps individual segments at 180 characters, preferring word boundaries.
- Current, previous, and next sentences use the existing vertical line animation. The current sentence expands to fit narrow viewports without an internal scrollbar.
- Progress, completion and per-segment duration/accuracy are saved in this browser. Reload resumes the last selected text. Restart clears that text's progress.
- Progress is local to this browser and is not synced between accounts/devices.
- Practice reuses the existing unscored scripture path. It does not submit ranking scores or integrity events.

## Recording

- The Dock camera button opens settings; microphone recording is on by default with noise suppression, echo cancellation and automatic gain control disabled.
- Desktop Chrome/Edge require explicit selection of the current TypeNews tab. Capture Handle verifies the selected tab. Canvas cropping extracts only the typing area from that verified tab, without native crop reconfiguration or compositor frame callbacks during startup.
- Output is capped at 5 minutes / 100 MB and 1920 x 1080. Actual resolution follows the typing area and device pixel ratio. Files use a supported MediaRecorder format, normally WebM.
- Stopping opens a preview with original download and start/end selection. Export closes the editor immediately, returns focus to typing, and re-encodes the chosen interval with audio in the background. A corner notification shows progress and permits cancellation; cancellation restores the editor, and failures retain a reopen action.
- Manual recording stop retains the verified display connection. The next click starts a fresh recording without another screen chooser. The microphone and per-recording canvas/encoder stop between clips; idle sharing saves no video. The Dock shows a sharing status/disconnect button. Disconnecting, leaving the component, or a capture error closes the connection; the next recording requires selection again.
- The editor provides draggable start/end handles, a seek bar, keyboard boundary adjustment, 0.1-second nudging, set-start/end-at-playhead controls, selection looping, preview speed/mute, and selection reset. Preview speed/mute do not change exported audio or playback speed.
- The Dock recording control is the last group, separated from ignore options by a line; vertical Dock layouts use a horizontal separator.
- Hiding the tab, ending sharing, losing the microphone, or changing viewport/target geometry ends recording. Stable coordinates avoid cropping unrelated pixels from an older captured layout.
- The typing-card and Dock hover scale is suspended while recording so ordinary pointer movement cannot be mistaken for a geometry change. Deliberate dragging, resizing, viewport changes and out-of-bounds movement still stop capture safely.
- Recording and editing stay in browser memory; no files are uploaded. Closing the preview discards the in-memory recording.
- Tab capture records visible pixels; content overlapping the typing area can appear in the recording.
- `Permissions-Policy` now permits microphone access from this origin only. Browser permission remains required.

## Verification

From `frontend`:

```sh
npm run lint
npm run build
npm run test:longform
npm run test:recording
```

Optional browser regression harnesses require the Playwright package and an installed Chrome, with the development server at `http://localhost:3000`. Playwright may be supplied through `NODE_PATH` by the development environment.

```sh
node scripts/test-longform-browser.cjs
node scripts/test-recording-browser.cjs
node scripts/test-recording-native.cjs
```

The recording browser test supplies a synthetic screen and sine-wave microphone, then checks pixels, media duration, decoded audio, track cleanup and wrong-tab rejection. The native test captures only its own generated fixture and app tab in headless Chrome, with a synthetic microphone; it never records the user's desktop or physical microphone. It checks the complete Dock-to-download flow.

Screenshots, test recordings and bundled test modules are written to the ignored `frontend/test-results/` directory.

## Separate showcase work

`feature/keyboard-showcase` is a separate branch pointer prepared for future implementation. See `KEYBOARD-SHOWCASE-PLAN.md` for the requested 10-keyboard collection, KeyXIF/manual build information, sound clips and collage export. No showcase tables, uploads or public pages are introduced by this change.
