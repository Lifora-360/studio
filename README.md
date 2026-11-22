# Lifora Studio

Browser tools the Lifora care team uses to make client material.

| Tool | Path | Output |
| --- | --- | --- |
| Client profile picture | `/profile/` | 1600 × 1600 PNG for the client's WhatsApp care-team group |
| Investigation report | `/report/` | Branded A4 PDF listing the tests the client should get done |

Both tools run entirely in the browser. Client details are never sent to a server: the PNG and PDF are
generated on the device, and drafts are kept in that browser's `localStorage` only (cleared with
**Start a new client**). Name and age typed in one tool are carried over to the other.

## What changed from the single-file HTML versions

**Both tools**
- Hosted as a site, so there's nothing to download or email around. Works on phones.
- One shared look: the forest, parchment and brass of the Lifora signature artwork, Cormorant (close to the
  logo's serif) and Figtree, self-hosted so nothing loads from third-party CDNs.
- **Share** button on phones opens the system share sheet, so the PNG/PDF goes straight to WhatsApp.
- Drafts survive a refresh; **Start a new client** wipes them.

**Profile picture** (from v3.1)
- BMI is calculated from height and weight (WHO Asian cut-offs) and shown on the card.
- Lowercase serif `lifora` lockup matching the clinic's printed material; bigger client name, readable at chat size;
  a live chat-size preview next to the card.
- Vector icons replace the unicode glyphs (`▱`, `Ø`) that rendered inconsistently between phones.
- One redraw per frame instead of five event listeners redrawing on every keystroke.
- The "If the download did not start…" banner no longer pops up after every successful download.
- Doctor and program suggestions; the program pill no longer repeats in the footer.

**Investigation report** (from Premium v2)
- 216 KB single file split up: the signature artwork is a cached image, and html2canvas/jsPDF are served
  from this site and only loaded when a PDF is made (the PDF works even when cdnjs is blocked).
- Preview scales to fit any screen instead of needing a 1400 px+ window.
- Packages collapse, show how many tests are picked in each, and search opens matching packages.
- Date and "Recommended by" doctor printed on the report.
- Re-paginates after web fonts load, so preview and PDF always match.

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
assets/css/report.css   report page designs
assets/js/common.js     storage, share/download, fonts, toast
assets/js/profile.js    canvas drawing for the profile picture
assets/js/report.js     test catalogue, pagination, PDF export
assets/fonts/           Cormorant Garamond + Figtree (SIL OFL)
vendor/                 html2canvas 1.4.1, jsPDF 2.5.1 (MIT)
```

Editing the test catalogue: `PACKAGES` (what appears in the sidebar) and `OUTPUT` (how tests are grouped
into profiles on the report) at the top of `assets/js/report.js`.
