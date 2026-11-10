# No Ball submissions (Apps Script)

The public page is `input-form/index.html`. It is not linked from the site. Until `FORM_ENDPOINT` in that file is filled in, the page says “Form not connected yet” and does not send anything.

GitHub Pages serves the folder as `https://friendnotphoe.com/input-form/` and redirects `/input-form` (no slash) to that address. There is no `robots.txt` in the repo; the page itself sends `noindex, nofollow`.

Nothing here contains a Google credential. `SHARED_TOKEN` is optional and is **not** a secret, because the same value would be visible in the page.

## What Zaid does

1. Open the spreadsheet that holds the card pipeline. Do not edit **Master Reference** or **Sheet1**.
2. **Extensions → Apps Script**.
3. Select `Code.gs`, replace its contents with this folder’s `Code.gs`, and save.
4. Leave `SHARED_TOKEN` as `''` unless you set the same string on `SHARED_TOKEN` in `input-form/index.html`.
5. **Deploy → New deployment → type: Web app**.
   - Execute as: **Me**
   - Who has access: **Anyone**
6. Authorize the spreadsheet permission when Google asks. The script only creates **Friend Submissions** (if it is missing) and appends rows there.
7. Copy the web app URL. It ends in `/exec`.
8. Open that URL once. The browser should show `{"ok":true,"ready":true}` and the sheet should gain no row.
9. Paste the URL into `input-form/index.html` as `FORM_ENDPOINT` (it ships as an empty string). That edit is what connects the form. Publish it only when you want friends to send entries.
10. After the site update is live, submit one test from `https://friendnotphoe.com/input-form/`. Confirm the row is on **Friend Submissions** and that Master Reference and Sheet1 did not change.

Changing the script later: **Deploy → Manage deployments → pencil → Version: New version → Deploy**. An old deployment keeps running the old code until you do that.

To change colors, edit `CATEGORY_COLORS` in `Code.gs` (Food first = Green, Drinks first = Blue, Legendary = Gold, Vibes first = Blue) and deploy a new version. That object is the only color mapping.

## What the script does

`doPost` reads a JSON body (`Content-Type: text/plain` from the page, so the browser does not send a CORS preflight). It rejects a bad body, a token mismatch, a filled honeypot (`company`), a submission faster than 3 seconds after the page loaded, and any field that fails the same checks as the page (score is a whole number from 1 to 300, vibes are at most 50 words and 250 characters, rankings are whole numbers from 0 to 100, the maps link is blank or an https Google Maps URL).

It then takes a script lock and appends one row:

`Submitted at` (America/New_York), `Submitted by`, `Restaurant`, `HP`, `Category`, `Color`, `City`, `Area`, `Vibes`, `Food`, `Drink`, `Scene`, `Google Maps link`.

`Submitted by` is the friend’s name from the form (required, 60 characters or fewer). After a successful send the page keeps that name and clears the rest, so the same person can add another place.

Text that starts with `=`, `+`, `-`, or `@` is prefixed with a quote so it cannot run as a formula.

The 3-second check uses a timestamp the page sends. It slows a browser that submits the instant it loads. It is not access control: anyone who has the `/exec` URL can post, and the page will contain that URL once it is connected. Don’t put the URL anywhere public beyond this unlisted page.

## Stop taking entries

Remove the deployment (or delete the web app), or clear `FORM_ENDPOINT` and publish the page again. Rows already in Friend Submissions stay until you delete them. None of this changes DNS.
