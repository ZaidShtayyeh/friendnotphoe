# Approved card finish

Approved 17 November 2026. The added decorated etched frame belongs **only on the back**.

The front keeps its original tatreez, corner flowers, separators, printed information and photo. Its only new finish is the approved fine surface texture. All 1500 × 2100 source fronts and 750px thumbnails are preserved byte for byte. The website uses a shared surface layer instead of recompressing 97 photographs. Sharing composites that same layer into the existing image export; the creator, review and inspiration card also use it.

`approved-finish.json` records the selection. `assets/card-finish-v1/front-surface.svg` contains the exact grain settings and protected photo/icon regions from the approved study. Render it using multiply compositing. Do not bake it into the source and also overlay it in the browser.

`build-backs.mjs` produces three full-resolution back designs and small filter thumbnails. The source back artwork is stored losslessly in `sources/`. The back uses the original logo, the woven hidden-heart pattern, framed centerpiece and decorated etched border. City text remains NYC, as in the approved artwork; these website backs are category illustrations, not geographic data.

Future front cards automatically receive the finish through the shared rendering functions. Keep using the existing V12 card compositor and its photo/crop/stat preservation rules. The deck box remains a separate study.

Validation: run `node --test _site-checks/*.test.cjs` and `node _site-checks/card-finish.browser.mjs`. The browser check blocks notification and submission requests.

Rollback: revert the release commit, then publish normally. No source photos or card records need restoration.
