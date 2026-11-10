# No Ball submissions (Apps Script)

The public page is `betweenusfriends/index.html`. It is not linked from the site. `FORM_ENDPOINT` in that file is the web app URL this script is deployed at. Until that constant is set, the page says it is not hooked up and does not send anything.

GitHub Pages serves the folder as `https://friendnotphoe.com/betweenusfriends/` and redirects `/betweenusfriends` (no slash) to that address. The page itself sends `noindex, nofollow`. There is no `sitemap.xml`, and no `robots.txt`: a Disallow line would name the page.

Nothing here contains a Google credential. `SHARED_TOKEN` is optional and is **not** a secret, because the same value would be visible in the page.

## What Zaid does

1. Open the spreadsheet that holds the card pipeline. Do not edit **Master Reference** or **Sheet1**.
2. **Extensions → Apps Script**.
3. Select `Code.gs`, replace its contents with this folder’s `Code.gs`, and save.
4. Leave `SHARED_TOKEN` as `''` unless you set the same string on `SHARED_TOKEN` in `betweenusfriends/index.html`.
5. **Deploy → New deployment → type: Web app**.
   - Execute as: **Me**
   - Who has access: **Anyone**
6. Authorize when Google asks. The script needs the spreadsheet and Drive. It only creates **Friend Submissions** (if that tab is missing) and appends rows there. The photo goes in a Drive folder named **FNF Friend Photos** (created in your Drive the first time, then remembered). The script does not share those files.
7. Copy the web app URL. It ends in `/exec`.
8. Open that URL once. The browser should show `{"ok":true,"ready":true}` and the sheet should gain no row.
9. Put that URL in `betweenusfriends/index.html` as `FORM_ENDPOINT` if it is not already the one there. That constant is what connects the form.
10. After you replace `Code.gs`, use **Deploy → Manage deployments → pencil → Version: New version → Deploy** so the existing URL runs this version. Then submit one test from `https://friendnotphoe.com/betweenusfriends/` with a photo. Confirm the row is on **Friend Submissions**, the **Photo** cell is a Drive link you can open, the file is in **FNF Friend Photos** and is not shared publicly, and that Master Reference and Sheet1 did not change.

Changing the script later: **Deploy → Manage deployments → pencil → Version: New version → Deploy**. An old deployment keeps running the old code until you do that.

To change colors, edit `CATEGORY_COLORS` in `Code.gs` (Food first = Green, Drinks first = Blue, Legendary = Gold, Vibes first = Blue) and deploy a new version. That object is the only color mapping.

## What the script does

`doPost` reads a JSON body (`Content-Type: text/plain` from the page, so the browser does not send a CORS preflight). It rejects a body over 8 MB, a token mismatch, a filled honeypot (`company`), a submission faster than 3 seconds after the page loaded, and any field that fails the same checks as the page (score is a whole number from 1 to 300, vibes are at most 50 words and 250 characters, rankings are whole numbers from 0 to 100, three special moves are required at 24 characters or fewer each, the maps link is blank or an https Google Maps URL). The photo is required. Its type has to be jpeg, png, webp, or heic, and the decoded file has to be 5 MB or smaller. The page sends the 3:2 window the friend framed on the card, as an 1800 × 1200 jpeg. A HEIC the browser cannot decode is sent as-is.

It then takes a script lock, saves the photo, and appends one row.

The Drive file is named `yyyy-MM-dd HHmm - Restaurant - Submitted by.ext` in America/New_York, for example `2026-11-10 1649 - C + B - Sam.jpg`. The folder id is stored in Script Properties as `FNF_FRIEND_PHOTOS_FOLDER_ID` after the first save. Nothing calls `setSharing`, so the file stays private to the account that owns the script.

The row is:

`Submitted at` (America/New_York), `Submitted by`, `Restaurant`, `HP`, `Category`, `Color`, `City`, `Area`, `Vibes`, `Food`, `Drink`, `Scene`, `Google Maps link`, `Photo`, `Move 1`, `Move 2`, `Move 3`.

Every column has a fixed position. On a tab that already exists, the script fills in only header cells that are blank, so an older tab gains `Photo` and then `Move 1` to `Move 3` after it. It never inserts or moves a column and never overwrites a header someone typed. Older rows keep blank move cells. The `Photo` cell is the Drive file URL. The moves are the three things to order, in the order they show on the card.

`Submitted by` is the friend’s name from the form (required, 60 characters or fewer). After a successful send the page keeps that name and clears the rest, so the same person can add another place.

Text that starts with `=`, `+`, `-`, or `@` is prefixed with a quote so it cannot run as a formula.

The 3-second check uses a timestamp the page sends. It slows a browser that submits the instant it loads. It is not access control: anyone who has the `/exec` URL can post, and the page will contain that URL once it is connected. Don’t put the URL anywhere public beyond this unlisted page.

## Stop taking entries

Remove the deployment (or delete the web app), or clear `FORM_ENDPOINT` and publish the page again. Rows already in Friend Submissions stay until you delete them. None of this changes DNS.
