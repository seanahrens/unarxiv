# unarXiv E2E Test Specification

**Test target:** https://unarxiv.org
**Test arXiv ID:** 2602.21593

---

## 1. Admin Auth [01-admin-auth.spec.ts]

- [ ] Visiting /admin without password shows password prompt, not dashboard
- [ ] Visiting /admin/curate without password shows password prompt
- [ ] Submitting wrong password on /admin is rejected with error
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
- [ ] Imported paper page shows title, authors, abstract
- [ ] API confirms paper exists with status "not_requested"
- [ ] Admin delete removes the test paper (GET returns 404 after)

## 4. Homepage [04-homepage.spec.ts]

- [ ] Homepage loads with at least one paper card visible
- [ ] Clicking a paper card navigates to /p?id=... with a title

## 5. Audio Playback [05-audio-playback.spec.ts]

- [ ] Play button is visible on a complete paper page
- [ ] Clicking play starts audio (audio element paused=false)
- [ ] Audio src points to correct API endpoint

## 6. Text Search [06-text-search.spec.ts]

- [ ] Searching "neural" returns at least one result
- [ ] Multi-word search updates URL with query parameters
- [ ] Gibberish search returns zero results

## 7. Global Media Player [07-media-player.spec.ts]

- [ ] Header player appears after starting playback
- [ ] Pause/resume toggle works (audio pauses and resumes)
- [ ] Skip back 15s decreases currentTime
- [ ] Skip forward increases currentTime
- [ ] Speed button cycles from 1x to 1.25x
- [ ] Paper link in header player points to paper page

## 8. Downloads [08-downloads.spec.ts]

- [ ] Download dropdown shows "Download PDF" and "Download MP3" options
- [ ] MP3 audio endpoint returns 200 with audio content-type

## 9. Ratings [09-ratings.spec.ts]

- [ ] Full lifecycle: open modal → submit 4★ → modal closes → reload persists → clear rating

## 10. Playlist [10-playlist.spec.ts]

- [ ] Add to playlist → paper appears on /playlist page
- [ ] Remove from playlist → paper disappears from /playlist page

## 11. Narration Generation [11-narration-gen.spec.ts] (SLOW — full suite only)

- [ ] Import paper, generate narration, poll until complete, verify audio stream
