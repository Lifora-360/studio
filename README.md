# Lifora Studio

Browser tools the Lifora care team uses to make client material.

| Tool | Path | Output |
| --- | --- | --- |
| Client profile picture | `/profile/` | 1600 × 1600 PNG for the client's WhatsApp care-team group |
| Investigation report | `/report/` | Branded A4 PDF listing the tests the client should get done |
| Prescription | `/prescription/` | A4 prescription on Lifora letterhead: doctor, client, diagnosis, medicines, advice, review date |
| Supplements | `/supplements/` | Three A4 PDFs from one form: client schedule, client bill (with payment link and QR), internal cost sheet. Needs sign-in |
| Payments (admin) | `/payments/` | Sign-in register: create UPI payment links, send on WhatsApp, mark paid |
| Checkout (customers) | `/pay/?id=…` | Public page a client opens to pay by UPI app or QR |

The profile and report tools run entirely in the browser. Client details are never sent to a server: the PNG and PDF are
generated on the device, and drafts are kept in that browser's `localStorage` only (cleared with
**Start a new client**). Name and age typed in one tool are carried over to the other.

## Design

Minimal and client-first. The lotus emblem and wordmark (extracted from the master logo onto a
transparent background) appear small; the client's information is the largest thing on every output.

- Colours: teal `#0e3b38` (from the logo), gold `#b8892e` used sparingly, white, allergy red `#b4462f`.
- Type: Playfair Display for headings and the client's name, Figtree for everything else. Self-hosted.

**Profile picture**: square 1600 × 1600 PNG. Order: name and vitals (with BMI on WHO Asian cut-offs),
existing conditions, allergies and intolerances (allergies turn red when present), goals and the
client's own words. No program, doctor, phone number or client ID on the card.

**Test report**: A4 PDF with the client's name, age and sex, tests grouped into profiles with a tick
small leaf beside each, and short preparation notes on the last page. Long selections continue onto more pages.

## Prescription

Doctors and one-tap medicine presets live in `assets/js/rx-config.js`. Staff can also save a doctor and a
signature image on their own device (browser storage only, never uploaded). The page warns when the content
is too long for one A4 sheet.

## Supplements

The catalogue (30s and 60s price lists, cost price and client price) lives only in the Supabase table
`supplement_catalogue`, readable by signed-in payment admins. Prices are never stored in this repository or
shipped in the site code. Edit them in the Supabase table editor.

- Bottles = daily doses × days ÷ tablets per bottle, rounded up (editable per row).
- The schedule has no prices, the bill has client prices only, and the internal PDF has cost prices only.
- "Create payment link" on the bill uses the Payments register; the link and QR are printed on the bill.

## Payments

Merged from the former `Lifora-360/payment` repo. Plain UPI payment requests stored in Supabase
(project `xjqcurdcgxejhqixfdwz`), with manual reconciliation. **Not a payment gateway**: the site cannot
see whether money arrived. Check the bank/UPI app before marking a request paid.

- Config (Supabase URL, public key, UPI ID, amount presets): `assets/js/pay-config.js`.
- Schema: `supabase/schema.sql` (original) + `supabase/migrations/20261122_checkout_v2.sql`
  (lets a client report their UTR after paying; shows "Paid" on links after expiry). The checkout works
  without the migration; it only enables those two features.
- Old links in the form `/?pay=<id>` redirect to `/pay/?id=<id>`.
- Checkout must be publicly reachable: turn off Vercel Authentication for production, or use a
  custom domain.

## Running locally

No build step. Serve the folder with any static server:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Deploying

It's a static site. Import the repository in Vercel (framework preset: **Other**, no build command,
output directory `.`), or enable GitHub Pages on the `main` branch root. `vercel.json` adds
`noindex` and privacy headers; `robots.txt` blocks crawlers.

## Layout

```
index.html              tool picker
profile/index.html      profile picture tool
report/index.html       investigation report tool
assets/css/base.css     shared tokens and studio layout
assets/css/report.css   report sidebar and A4 page
assets/js/common.js     storage, share/download, fonts, images, toast
assets/js/profile.js    canvas drawing for the profile picture
assets/js/report.js     test catalogue, pagination, PDF export
assets/fonts/           Playfair Display + Figtree (SIL OFL)
assets/img/             lotus emblem, logo lockup, favicon
pay/, payments/         checkout and admin pages
assets/js/checkout.js   public checkout
assets/js/payments.js   admin register
supabase/               database schema and migrations
vendor/                 html2canvas 1.4.1, jsPDF 2.5.1, supabase-js 2.58.0, qrcode-generator 1.4.4 (MIT)
```

Editing the test catalogue: `PACKAGES` (what appears in the sidebar) and `OUTPUT` (how tests are grouped
into profiles on the report) at the top of `assets/js/report.js`.
