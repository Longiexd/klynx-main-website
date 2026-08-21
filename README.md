# Klynx Marketing Site

A multi-page marketing site for Klynx (Odoo-based business automation for SMEs), plus a
Cloudflare Workers-backed review system with a lightweight admin moderation panel.

## Structure

```
site/                   → deploy this folder as-is to Cloudflare Pages (or any static host)
  index.html
  services.html
  use-cases.html
  reviews.html
  infrastructure.html
  pricing.html
  case-study.html
  contact.html
  faq.html
  platforms.html        → "Klynx OS" product page (in development)
  admin.html            → review moderation panel (see below)
  klynx.css
  klynx.js
  klynx-favicon.svg
  favicon.ico

workers/
  reviews-worker.js     → Cloudflare Worker: stores/moderates visitor-submitted reviews in KV
```

No build step — everything is static HTML/CSS/vanilla JS. Deploy `site/` directly.

## Placeholder values — replace before going live

A few endpoints are intentionally left as placeholders so nothing personal/live ships in
this repo. Search for these and swap in your own:

- **`site/klynx.js`** : `REVIEWS_API` constant, currently `https://klynx-reviews.YOUR-SUBDOMAIN.workers.dev`
- **`site/contact.html`** : the audit-request form's `action`, currently `https://your-email-forwarding-worker.workers.dev`

Both are meant to point at your own deployed Worker(s).

## Deploying the site (Cloudflare Pages)

```bash
cd site
wrangler pages deploy . --project-name=klynx
```
Or connect the repo in the Cloudflare dashboard (Workers & Pages → Create → Pages →
Connect to Git). No build command needed; output directory is `/`.

## Deploying the reviews Worker

```bash
cd workers
wrangler deploy reviews-worker.js
wrangler kv namespace create REVIEWS
wrangler secret put ADMIN_KEY
```
Bind the `REVIEWS` KV namespace to the Worker in `wrangler.toml`, and lock
`ALLOWED_ORIGIN` in `reviews-worker.js` down to your real domain once live.

## Admin panel

`site/admin.html` is a standalone review-moderation UI. It has no hardcoded credentials
on first load it asks for a Worker URL and an admin key, both of which are stored only in
your own browser's `localStorage`. It's marked `noindex, nofollow`. For real protection,
put it behind Cloudflare Access rather than relying on obscurity.

## What's intentionally not in this repo

A personal links page and a personal photo were part of the original project but are kept
out of version control - see `.gitignore`.
