# Lewis County Autism Coalition — Website

Live: https://www.lcautism.org (currently on Wix; switching to this Vercel-hosted version when the Wix subscription renews in May 2026)

Staging / new site: https://lcautism-coalition.vercel.app

## What this is

A static HTML/CSS/JS website for LCAC. No build step, no React, no framework — just files you can open in a browser.

```
.
├── index.html              ← homepage (hero, mission, programs, contact)
├── css/styles.css          ← all styles in one file
├── js/main.js              ← navigation, scroll animations, form handler
├── pages/                  ← all other pages
│   ├── about.html
│   ├── contact.html
│   ├── donate.html
│   ├── espanol.html        ← Spanish-language resources
│   ├── events.html         ← events listing + RSVP modal + past-events archive
│   ├── partners.html
│   ├── privacy.html
│   ├── sdcc.html           ← Spectrum & Development Community Center
│   ├── services.html
│   ├── smart.html          ← SMART program
│   ├── sponsor.html
│   ├── statewide.html
│   └── volunteer.html
├── assets/
│   ├── images/             ← site images (currently mostly logo.png placeholder)
│   └── flyers/             ← per-event PDF downloads
├── 404.html
├── sitemap.xml
└── vercel.json             ← Vercel config (clean URLs + redirects + security headers)
```

## How it deploys

This repo is connected to a Vercel project (`lcautism-coalition`). Pushing to `main` auto-deploys in ~60 seconds.

```
git push origin main
# → Vercel sees the push, builds, deploys
# → live at lcautism-coalition.vercel.app within ~60s
```

When the Wix subscription expires (May 2026), point the `lcautism.org` DNS at Vercel and this site replaces Wix entirely.

## Forms — Web3Forms

All forms POST to `https://api.web3forms.com/submit`. Each form needs an `access_key` hidden input. Web3Forms maps each access_key to one inbox.

Two access keys, two inboxes:

| Key placeholder | Inbox | Used by |
|---|---|---|
| `4aa1988f-ab2b-4f29-94c6-37d5a651298e` | info@lcautism.org | Home page contact, contact page |
| `c7341c41-b260-4ef0-a8c3-69180da5de8f` | outreach@lcautism.org | Volunteer, sponsor, event RSVPs |

**To activate forms:**
1. Sign up at https://web3forms.com (free — 250 submissions/mo)
2. Add `info@lcautism.org` as an inbox → copy the access key
3. Repeat for `outreach@lcautism.org` → copy that access key
4. Find-and-replace both placeholders across the repo:
   - `4aa1988f-ab2b-4f29-94c6-37d5a651298e` → the info@ key
   - `c7341c41-b260-4ef0-a8c3-69180da5de8f` → the outreach@ key
5. Commit + push. Forms go live on the next deploy.

## Events page — how it works

`pages/events.html` reads each event card's `data-event-*` attributes to decide what to render:

```html
<div class="card event-card fade-in"
     data-event-date="2026-06-13"
     data-event-name="3rd Annual Car & BMX Show FUNdraiser"
     data-event-video="https://www.youtube.com/embed/VIDEO_ID"
     data-event-flyer="car-bmx-show.pdf"
     data-event-rsvp="true">
  ...
</div>
```

| Attribute | What it does |
|---|---|
| `data-event-date` | YYYY-MM-DD. After this date, card auto-moves to the past-events archive |
| `data-event-name` | Pre-fills the RSVP form so emails identify which event |
| `data-event-video` | YouTube/Facebook embed URL → injects iframe inside the card |
| `data-event-flyer` | Filename in `assets/flyers/` (or full URL) → adds Download PDF button |
| `data-event-rsvp` | `"true"` or `"false"` — toggles the RSVP button (default true) |

Past events live in a collapsible `<details>` section below upcoming. The section is hidden when there are no past events.

## Mom: edit-by-Claude workflow

Mom uses Claude Code locally:
1. Clone the repo: `git clone https://github.com/benfreemn-del/lcautism-coalition.git`
2. `cd lcautism-coalition && claude`
3. Talk to Claude in plain English: "Add a Coalition Meeting on June 25th, 2026 at the S&D Community Center."
4. Claude edits `pages/events.html`, mom reviews, mom asks Claude to commit + push
5. Vercel auto-deploys

See `MOM_CHEATSHEET.md` for example prompts. See `CLAUDE.md` for the rules Claude follows.
