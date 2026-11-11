# Website release candidate

Prepared on 11 November 2026 from live `origin/main` at `2e2b3a0`. Not published.

## Scope

The creator and website are separate commits. The creator can be deployed alone without replacing the homepage. The full website candidate uses the approved forest palette and original ring lettering. The creator stays at `/betweenusfriends/` and is not added to public navigation. The illustrative creator-credit study is excluded because verified author assignments are not available.

## Checks completed

- 36 validation, Apps Script, place extraction and place-connection tests pass. Apps Script unit tests use a test double and do not write live sheet rows.
- Five release checks pass: all 77 live card records preserved exactly, full-size and thumbnail files present, all published article content preserved, draft articles excluded, original form endpoint and public Places key retained, live six/seven glint counts preserved, no dependency on local preview folders.
- Existing submission endpoint health GET returned HTTP 200 and `{ok:true,ready:true}`. No real submissions sent.
- Browser: shared `#card/cervos` opens a 1500 × 2100 card; C + B is present; `#post-0` opens the correct article; legacy `#exploration` opens Explore; Back and Forward return to the correct pages.
- Browser: forest homepage loads its elastic WebGL heart, image assets resolve, globe loads, map renders, no console errors observed.
- Phone: 390px page has no horizontal overflow; scroll entrance lands all cards without leftover hidden cards; creator placeholder and live submission copy are correct.
- Existing browser spec selectors updated for the revised UI. That Playwright script was not run in this session; browser verification used the provided computer-use browser tool.
- Google Places is restricted on localhost. The live-domain setup was verified in the preceding work; selected-place UI state and races are covered by the local test double.

## Payload and preservation

Original card artwork, heart files, Google configuration, backend, CNAME, social metadata and analytics are preserved. The tiny filter backs are 180px WebP assets (46,924 bytes combined), rather than loading roughly 17MB of PNGs. Full-resolution cards remain unchanged. Globe code loads only when needed.

## Release and rollback

Confirm whether the user wants the creator alone or both pieces before pushing. Confirm remote main still matches the baseline before release; reconcile any newer changes first. GitHub Pages publishes root of main. After deployment, check the actual production pages and Google place selection. If a release fails verification, revert its individual commit and redeploy; do not reset remote history.
