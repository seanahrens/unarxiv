# unarXiv E2E Test Specification

**Test target:** https://unarxiv.org
**Test arXiv ID:** 2602.21593

---

## 1. Admin Auth [01-admin-auth.spec.ts]

- [ ] Visiting /admin without password shows password prompt, not dashboard
- [ ] Submitting wrong password on /admin is rejected with error
- [ ] Correct password grants access to the dashboard (skipped without ADMIN_PASSWORD)
- [ ] API: POST /api/admin/verify with no password returns 401
- [ ] API: POST /api/admin/verify with wrong password returns 401
- [ ] API: DELETE /api/papers/:id with no admin header returns 401
- [ ] API: DELETE /api/papers/:id with wrong password returns 401

## 2. ArXiv URL Routes [02-arxiv-routes.spec.ts]

- [ ] /abs/2602.21593 redirects to /p?id=2602.21593
- [ ] /html/2602.21593 redirects to paper page
- [ ] /pdf/2602.21593 redirects to paper page
- [ ] Paper page renders with a non-empty title after redirect

## 3. ArXiv Search Import [03-arxiv-search-import.spec.ts]

- [ ] Typing "2602.21593" in search bar detects arXiv ID and redirects to paper page
- [ ] Imported paper page shows title and arXiv ID
- [ ] API confirms paper exists with status "unnarrated"
- [ ] My Collections heading visible on /my-papers
- [ ] Admin delete removes the test paper (GET returns 404 after)

## 4. Homepage [04-homepage.spec.ts]

- [ ] Homepage loads with at least one paper card visible
- [ ] Clicking a paper card navigates to /p?id=... with a title

## 5. Audio Playback [05-audio-playback.spec.ts]

- [ ] Play button is visible on a complete paper page
- [ ] Clicking play starts audio (audio element paused=false)
- [ ] Audio src points to correct API endpoint

## 6. Text Search [06-text-search.spec.ts]

- [ ] Searching "AI" returns at least one result
- [ ] Multi-word search updates URL with query parameters
- [ ] Gibberish search returns zero results

## 7. Global Media Player [07-media-player.spec.ts]

- [ ] PlayerBar appears (speed button visible) after starting playback
- [ ] Speed button cycles from 1x to 1.25x
- [ ] Pause/resume toggle works (audio pauses and resumes) [FIXME: headless CI unreliable]
- [ ] Skip back 10s decreases currentTime [FIXME: headless CI unreliable]
- [ ] Skip forward 10s increases currentTime [FIXME: headless CI unreliable]
- [ ] Paper link in player bar points to paper page [FIXME: headless CI unreliable]

## 8. Downloads [08-downloads.spec.ts]

- [ ] Download dropdown shows "Download PDF" and "Download Audio" options
- [ ] Audio endpoint returns 200 or 206 with audio content

## 9. Ratings [09-ratings.spec.ts]

- [ ] Full lifecycle: open modal → submit 4★ → modal closes → reload persists → clear rating

## 10. Playlist [10-playlist.spec.ts]

- [ ] Add to playlist via actions dropdown → menu shows "In Playlist" after adding
- [ ] Remove from playlist via actions dropdown → menu shows "Add to Playlist" after removing
- [ ] Playlist state persists across page reload (localStorage-backed)

## 11. Narration Generation [11-narration-gen.spec.ts] (SLOW — full suite only)

- [ ] Import paper, generate narration, poll until complete, verify audio stream

## 12. Turnstile [12-turnstile.spec.ts] (SKIPPED — Turnstile currently disabled)

- [ ] About page "Show email address" renders Turnstile without sitekey errors

## 13. Lists/Collections [13-lists.spec.ts]

- [ ] API: create list, get (public), add items, update metadata, auth required for mutations
- [ ] API: reorder items, remove item, my-lists returns owned lists, delete list
- [ ] Frontend: /l/<list_id> short URL redirects to /l/?id=<list_id>
- [ ] Frontend: My Collections heading visible on /my-papers
- [ ] Frontend: create via API + store token → collection appears in My Collections → view at /l?id=
- [ ] Admin: can see all lists with tokens (skipped if no ADMIN_PASSWORD)

## 14. Transcript Viewer [14-transcript.spec.ts]

- [ ] /s?id= loads h1 title and no error for a complete paper
- [ ] Transcript API endpoint returns 200/206 with text content-type
