# Lifora Studio

Browser tools the Lifora care team uses to make client material.

| Tool | Path | Output |
| --- | --- | --- |
| Client profile picture | `/profile/` | 1600 × 1600 PNG for the client's WhatsApp care-team group |
| Investigation report | `/report/` | Branded A4 PDF listing the tests the client should get done |

Both tools run entirely in the browser. Client details are never sent to a server: the PNG and PDF are
generated on the device, and drafts are kept in that browser's `localStorage` only (cleared with
**Start a new client**). Name and age typed in one tool are carried over to the other.

## Design

Minimal and patient-first. The lotus emblem and wordmark (extracted from the master logo onto a
transparent background) appear small; the client's information is the largest thing on every output.

- Colours: teal `#0e3b38` (from the logo), gold `#b8892e` used sparingly, white, allergy red `#b4462f`.
- Type: Playfair Display for headings and the client's name, Figtree for everything else. Self-hosted.

**Profile picture**: square 1600 × 1600 PNG. Order: name and vitals (with BMI on WHO Asian cut-offs),
existing conditions, allergies and intolerances (allergies turn red when present), goals and the
client's own words. No program, doctor, phone number or client ID on the card.

**Test report**: A4 PDF with the client's name, age and sex, tests grouped into profiles with a tick
box beside each, and short preparation notes on the last page. Long selections continue onto more pages.

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
vendor/                 html2canvas 1.4.1, jsPDF 2.5.1 (MIT)
```

Editing the test catalogue: `PACKAGES` (what appears in the sidebar) and `OUTPUT` (how tests are grouped
into profiles on the report) at the top of `assets/js/report.js`.
