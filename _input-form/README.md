# No Ball form

The page friends open is `input-form/index.html` (`https://friendnotphoe.com/input-form/`). It is not linked from the site. Sheet setup is in [apps-script/README.md](apps-script/README.md).

`MAPS_API_KEY` in `input-form/index.html` is the browser key for place suggestions. While it is empty, "What's it called" is a normal text field and nothing calls Google. The key is visible in the page. Referrer and API restrictions are what keep it limited. Do not put it in `Code.gs`.

The shot is required. The page compresses it and the script stores the file in a private Drive folder. See [apps-script/README.md](apps-script/README.md).

## New Places key

Use the Google Cloud project this site already has. Create a new key. Do not reuse an old one.

1. Open [Google Cloud Console](https://console.cloud.google.com/) and select that project. Billing has to be on, or the APIs will not answer.
2. Go to **APIs & Services → Library**.
3. Search for **Maps JavaScript API**. Open it and click **Enable**.
4. Back in the library, search for **Places API (New)**. Open that one, not the legacy **Places API**, and click **Enable**.
5. Go to **APIs & Services → Credentials → Create credentials → API key**.
6. Copy the new key, then click **Edit API key** (the key's name in the list).
7. Name it something like `friendnotphoe places`.
8. Under **Application restrictions**, choose **Websites**.
9. Under **Website restrictions**, add these two referrers and nothing else you do not mean to allow:
   - `https://friendnotphoe.com/*`
   - `https://www.friendnotphoe.com/*`
10. Under **API restrictions**, choose **Restrict key**, then select only:
    - Maps JavaScript API
    - Places API (New)
11. Save.
12. Paste the key into `input-form/index.html` as `MAPS_API_KEY` and publish that change when the form should start suggesting. Until then leave the constant empty.

Those two referrers do not cover a laptop preview. To try it locally, add `http://localhost:*/*` and `http://127.0.0.1:*/*` for the check, then remove them.

### Optional daily cap

1. **APIs & Services → Enabled APIs & services → Places API (New) → Quotas and system limits**.
2. Set a daily limit on the autocomplete quota and on the place details quota, at a number you are fine paying for if the page gets shared.
3. Do the same for **Maps JavaScript API** if it shows a daily request quota.
4. Optionally add a budget alert under **Billing → Budgets & alerts**.

The page asks only for `displayName`, `googleMapsURI`, and `addressComponents`, and it sends a session token, so a pick is one session rather than a charge per keystroke.
