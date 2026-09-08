# Wiring the waiting list to the Google Sheet

Signups already work and are already being saved. This step is what makes them
appear in the sheet by themselves. Until it is done, nothing is lost: every
signup sits in Cloudflare KV and the export link below hands the whole list
back as a CSV.

Sheet: **Event Waiting List**
https://docs.google.com/spreadsheets/d/10IlJ1Rpy34Avlk1Im1JoxvP_Ig5L7cHP1xKwD7_aAFc/edit

## 1. Add the script to the sheet

Open the sheet, then **Extensions → Apps Script**. Delete whatever is in the
editor and paste this in:

```javascript
function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  var d = JSON.parse(e.postData.contents);
  sheet.appendRow([
    d.timestamp || new Date().toISOString(),
    d.event || '',
    d.name || '',
    d.email || '',
    "'" + (d.phone || ''),   // leading quote keeps 082... from losing its zero
    d.notes || '',
    d.source || ''
  ]);
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}
```

The leading apostrophe on the phone number is deliberate. Without it Sheets
reads 0824441831 as a number and throws the leading zero away.

## 2. Deploy it

**Deploy → New deployment → Select type → Web app.**

- Description: anything
- Execute as: **Me**
- Who has access: **Anyone**

"Anyone" sounds alarming and is correct here. It is a write-only endpoint that
only appends rows, the URL is a long unguessable string, and Cloudflare is the
only thing that knows it. Google will warn you that the script is unverified.
That is because it is your own script and nobody has reviewed it, which is
expected. Choose Advanced, then go through.

Copy the web app URL it gives you. It looks like
`https://script.google.com/macros/s/AKfyc.../exec`

## 3. Add it to Cloudflare

Cloudflare dashboard → Workers & Pages → **francois-resources** → Settings →
Variables and secrets.

| Name | Value | Type |
|---|---|---|
| `WAITLIST_SHEET_URL` | the web app URL from step 2 | **Secret** |
| `WAITLIST_EXPORT_KEY` | any long random string you invent | Secret |

Also under Settings → Bindings, confirm there is a **KV namespace** binding
named `FUNNEL`. The funnel counters already use it, so it is probably there.

Then redeploy, or tell me and I will.

## 4. Check it

Go to the events page, put yourself on a list, and watch the row appear.

## If the sheet ever misses one

Every signup is in KV regardless. This gives you the lot as a CSV:

```
https://resources.francoisesterhuizen.com/api/waitlist?export=YOUR_EXPORT_KEY
```

It returns a 404 to anybody without the key, so the link is safe to keep in
your notes but not to publish.
