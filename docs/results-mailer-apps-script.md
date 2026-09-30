# Making the assessment result emails actually send

Every tool asks for an email at the end. Until this is done, none of them send
one. The address is captured and tagged in Mailchimp correctly, so nothing is
lost, but no email arrives.

This is about ten minutes and it fixes all eight tools at once. It is the same
shape as the waiting list script, so if you have done that one this will feel
familiar.

## Why this way

Resend cannot verify francoisesterhuizen.com while your DNS sits on Wix, and
Wix refuses to put MX records on a subdomain. A Mailchimp journey would work,
but it is one journey per tool to build and maintain, and it has to be kept in
step with the copy every time a tool changes. This sends through your own
Gmail, from your own address, and the wording lives in the code with everything
else.

Your Workspace account will send up to 1,500 of these a day. You are nowhere
near that.

## 1. Create the script

Go to **script.google.com** and choose **New project**. Name it
`Assessment results mailer`. Delete whatever is in the editor and paste this:

```javascript
// The shared secret. Invent a long random string and put the SAME one here
// and in Cloudflare. Without it, anybody who finds this URL could send mail
// from your account.
const KEY = 'PUT_YOUR_LONG_RANDOM_STRING_HERE';

function doPost(e) {
  try {
    var d = JSON.parse(e.postData.contents);

    if (!d.key || d.key !== KEY) {
      return out({ ok: false, error: 'bad key' });
    }
    if (!d.to || !d.subject || !d.body) {
      return out({ ok: false, error: 'missing fields' });
    }

    var msg = {
      to: d.to,
      subject: d.subject,
      body: d.body,
      name: 'Francois Esterhuizen',
      replyTo: 'francois@francoisesterhuizen.com'
    };

    // Added 30 Sep 2026. His rule: "Emails should also always have
    // hyperlinks." Plain text cannot put a link on words, so a caller that
    // wants one sends an `html` field as well. Both parts go out together:
    // the mail client shows the HTML, anything that cannot falls back to
    // d.body. Callers that send no html are unaffected.
    if (d.html) { msg.htmlBody = d.html; }

    MailApp.sendEmail(msg);

    return out({ ok: true });
  } catch (err) {
    return out({ ok: false, error: String(err) });
  }
}

function out(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
```

> **If you already have this script deployed, it needs updating.** The
> `if (d.html)` line above is new, added 30 Sep 2026. Without it the open day
> confirmation still sends, but the Zoom link arrives as a bare URL on its own
> line instead of sitting on the words "Join the open day here". Open the
> project at script.google.com, paste the block above over what is there,
> keep your existing KEY, and deploy a **new version** of the existing
> deployment so the URL does not change. If the URL changes, the
> `RESULTS_MAILER_URL` secret has to change in Cloudflare too.

Replace `PUT_YOUR_LONG_RANDOM_STRING_HERE` with something long and random.
Anything unguessable will do.

## 2. Deploy it

**Deploy → New deployment → Select type → Web app.**

- Execute as: **Me**
- Who has access: **Anyone**

"Anyone" is right here even though it reads alarming. The endpoint refuses
every request that does not carry your secret key, and Cloudflare is the only
thing that has it. Google will warn you the script is unverified, which is
because it is your own script and nobody has reviewed it. Choose Advanced, then
continue.

Copy the web app URL. It looks like
`https://script.google.com/macros/s/AKfyc.../exec`

## 3. Add both values to Cloudflare

Cloudflare dashboard → Workers & Pages → **francois-resources** → Settings →
Variables and secrets.

| Name | Value | Type |
|---|---|---|
| `RESULTS_MAILER_URL` | the web app URL from step 2 | **Secret** |
| `RESULTS_MAILER_KEY` | the same random string you put in the script | **Secret** |

They must match exactly or every send is refused.

Then tell me and I will redeploy, or redeploy yourself.

## 4. Check it

Finish any tool, ask for the email, and watch your inbox. The first send will
ask Google for permission to send mail as you. Approve it once.

If it works the page says "Sent. Check your inbox in a minute or two." If it
does not, the page now says so plainly instead of claiming it sent. That
honesty is the point: for a while every tool said Sent and nothing arrived.

## What the emails say

The wording lives in `functions/api/assessment.js`, not in the script above, so
it is version controlled and swept by the same voice rules as everything else.
Each one is four lines and the link.

Two of them use a deliberately plain subject line, "The results you asked for",
and say nothing about the topic anywhere in the email:

- Windows and Walls
- Two Different Problems

Both of those pages promise the reader exactly that, because an inbox somebody
else reads is the harm those tools exist to prevent. **If you ever change those
two subject lines, you are breaking a promise made on the page.**
