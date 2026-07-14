# DayHop Mode Toggle — Verification Checklist

Test against a fresh browser profile (or clear localStorage: DevTools → Application → Local Storage → delete `dayhop_state_v2`) so first-launch behavior is real. Test desktop AND a phone (the temporary tunnel URL works for both).

## 1. Toggle basics
- [ ] First launch defaults to **R&R Mode** (green thumb on the left option)
- [ ] Tapping **Adventure** slides the thumb right, page warms to apricot, hero photo changes to the rock climber
- [ ] Tapping **R&R** slides back, page cools, skyline photo returns
- [ ] Reload the page — the last used mode is remembered
- [ ] The active mode is obvious at a glance (thumb color, photo, page tint)
- [ ] Keyboard: Tab reaches both mode buttons; Enter/Space switches; focus ring visible

## 2. Mobile swipe (phone only)
- [ ] Swipe **left** on the hero (not on a card) → switches to Adventure
- [ ] Swipe **right** on the hero → switches back to R&R
- [ ] Swiping on an idea **card** still means keep/skip — never switches mode
- [ ] Vertical scrolling over the hero does NOT trigger a mode switch
- [ ] Swiping on the toggle itself also works

## 3. Chrome that must switch with the mode
- [ ] "Today's ideas" heading: **"Today's calm escapes 🌿"** (R&R) vs **"Today's thrills ⚡"** (Adventure)
- [ ] Hint line under the toggle changes
- [ ] Prompt box placeholder changes (visible only while the box is empty)
- [ ] "Try one" example chips change (garden/lookout prompts vs zipline/go-kart prompts)
- [ ] Filter chips change (Calm Water/Culture/Patios… vs Big Experiences/Water Action/Refuel…)
- [ ] Active filter chip uses the mode accent color (moss vs ember)

## 4. Feed behavior on switch
- [ ] With a location picked and the browse feed showing: toggling refetches — R&R leads with gardens/beaches/trails, Adventure leads with ziplines/climbing/karting
- [ ] Feed swap shows skeletons + fade, not a hard flash; no page reload
- [ ] Max **10** cards in the browse feed, grouped under mode-flavored section headers
- [ ] With **prompt results** on screen: toggling does NOT clobber them — a toast explains the new lean instead (protects the free daily generate)
- [ ] Toggling back and forth is fast the second time (per-mode server cache)

## 5. Search respects mode
- [ ] Same prompt in both modes (e.g. "a day near the water with friends") returns calm-leaning vs thrill-leaning idea sets
- [ ] Results are 8–12 ideas, all high quality (rated items ≥ 4.4; no junk listings)
- [ ] "Beyond what you asked ✨" stretch picks match the mode's spirit

## 6. Plans respect mode
- [ ] Shortlist a few ideas in R&R → View My Plan → pacing reads gentle (generous stop times, unhurried notes)
- [ ] Same in Adventure → pacing reads energetic (demanding activity early, meals as refuel breaks)
- [ ] Smart re-plan ("make it more relaxed" / "more thrilling") honors the active mode

## 7. Quality gate (both modes)
- [ ] No card shows a rating below 4.4
- [ ] Browse feed and prompt results never exceed 10 / 12 cards respectively
- [ ] Sparse location (e.g. a small town) still shows a usable feed (floor top-up working)

## 8. Regressions
- [ ] Card swipe keep/skip, shortlist, Details panel, exports, My Plans all still work in both modes
- [ ] Sign in/out doesn't reset or break the mode
- [ ] Pro gates (daily limits, multi-day) behave the same in both modes
- [ ] Old bookmarked clients / no `mode` param → server treats as R&R (check `/api/browse` with no mode field)
