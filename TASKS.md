# LCAC website — open tasks & content gaps

This file tracks ongoing work on the Lewis County Autism Coalition site.
**Mom + Ben + Claude all see this.** Updated as items get done or new gaps surface.

Last updated: 2026-05-05

---

## 🔴 BLOCKERS — needed from LCAC

These can't be fixed in code. Someone at LCAC needs to provide them.

### 1. Google Analytics 4 measurement ID
- **Status:** placeholder `[[GA4_MEASUREMENT_ID]]` is live on every page
- **What's needed:** the real `G-XXXXXXX` ID from LCAC's Google Analytics admin
- **Where to find it:** analytics.google.com → Admin → Property Settings → "Measurement ID"
- **Once we have it:** Claude can find-and-replace the placeholder in 5 min — appears in `<head>` of every HTML file
- **Without it:** all analytics on the new site are dead. The cookie consent banner is wired and ready; just needs the real ID.

---

## 📸 PHOTO GAPS — what's missing or low-res

The old Wix site has ~150–200 real LCAC photos. The new site is rendering everywhere with `assets/images/logo.png` as a placeholder. Mom should provide higher-res originals when she can. Until then, web-resolution scrapes from the live Wix site are in `assets/images/`.

### Photos needed (priority order)

| Page | Slot | What's needed | Status |
|---|---|---|---|
| **Homepage** | Hero | A real photo representing LCAC's community (event group shot, SDCC building, etc.) | _placeholder_ |
| **Homepage** | About / Mission | Photo of community gathering or kids in program | _placeholder_ |
| **SDCC** | "More Than a Building" | Real photo of the SDCC building exterior | _placeholder_ |
| **SDCC** | "About the Center" | Inside the SDCC — provider rooms, sensory space, program area | _placeholder_ |
| **SDCC** | Gallery (if added) | 6–10 photos from ribbon-cutting, parades, programs at SDCC | _missing_ |
| **About** | Hero / story | Photo from an early LCAC event or founding moment | _placeholder_ |
| **About** | Timeline cards | Photo per milestone (ribbon-cutting, programs, events) | _placeholder_ |
| **Leadership** | ED headshot | Michelle Whitlow professional headshot | _missing — page not yet built_ |
| **Leadership** | Board photos | Optional — 6 board member headshots | _missing_ |
| **Events** | BMX Show | Photos from past 2 years of BMX Show | _missing_ |
| **Events** | Past programs | Optional gallery shots from Coalition Meetings, Parent Empowerment, etc. | _missing_ |
| **Cultivating Belonging** | Hero | Photo of a community education event | _missing — page not yet built_ |
| **Summer Camp** | Hero / activity shots | Photos from past camp years | _missing — page not yet built_ |
| **SWWA Conference** | Hero / past speakers | Conference photos / speaker headshots | _missing — page not yet built_ |
| **Partners** | Partner logos | 60+ partner organization logos | _missing — currently shows generic categories_ |

### Low-res photos (need higher-res originals)

When the photo-scrape agent grabs from Wix, it pulls web-quality (typically 800–1600px). For print materials or hero use these may need replacement with full-res originals from mom.

_(scraped photo list will populate here as scraping completes)_

---

## ✅ CONTENT GAPS — pages that need building or beefing up

| Page | Status | Source content | Notes |
|---|---|---|---|
| Leadership | _missing_ | Board roster + Michelle Whitlow ED bio | Page needs to be built |
| What Is Autism | _missing_ | Old Wix `/what-is-autism` (~1,100 words) | Public-info article, good SEO |
| Vision 2030 | _missing_ | Old Wix `/vision-2030` (4 strategic goals, ~1,050 words) | |
| Court Support | _missing_ | Old Wix `/courtsupport` (~650 words) + 2 Google Form URLs | Public form URLs need verification (Wix returned `/edit` private URL) |
| Cultivating Belonging | _missing_ | Old Wix `/cultivating-inclusion` (~340 words) | Plus link to facebook.com/CultivatingBelongingLC |
| Summer Sensory Camp | _missing_ | Old Wix `/summer-camp` content | Registration is by phone (360) 748-0271, not online |
| SWWA Conference | _missing_ | Old Wix `/swwautism-conference` content | Conference postponed to Nov 2026 |
| Partners (named list) | _shallow — generic categories only_ | Old Wix `/community-partners` (60+ named orgs) | |
| Volunteer form | _shallow — basic name/email only_ | Old Wix has 18+ fields | Add: interests checkboxes, availability, signature, license upload |
| Sponsorship variants | _only Car & BMX exists_ | Old Wix has Santa, Teal Pumpkin too | Same shape, different tier amounts |

---

## 🟡 NICE-TO-HAVE / POLISH

- [x] Wire BMX flyer to event card (`assets/flyers/bmx-show-2026.jpg` exists but orphaned)
- [x] `tel:` link on homepage phone (currently plain text)
- [x] Add `robots.txt` at site root
- [ ] Replace generic IG/YT/TikTok footer links with real LCAC handles or remove
- [ ] Stripe Donate Link (replace `/donate` page bouncing to legacy Wix)
- [ ] Update Michelle Whitlow's full bio (Wix scrape only got opening paragraph verbatim)
- [ ] Verify public Google Form URLs for Court Support (Intake/Auth + Request Services)
- [ ] Cancel Squarespace SITE plan AFTER hectorlandscaping cutover proves stable (separate client)

---

## 🛣️ FUTURE MIGRATION (when ready, not now)

### Move LCAC out of Bluejay Business folder
- Currently lives at `C:\Users\BenFr\OneDrive\Desktop\Bluejay Business\Lewis County Austim Coalition\` — inside Ben's BlueJays project
- Plan: move to its own path so it stands alone (not nested inside another product)
- Both Ben + mom get separate GitHub access on the standalone repo
- Mom's connection: she'll be set up with her own GitHub auth so she can push her own changes via Claude Code

### Domain transfer (lcautism.org)
- Currently registered with Wix
- Plan: transfer registrar OR repoint DNS to Vercel
- Will follow same pattern as Hector Landscaping migration (unlock at Wix → grab EPP code → Namecheap transfer or DNS-only → add domain to Vercel project)
- 60-day domain rule applies — check Wix renewal date before initiating

### Order of operations (when ready)
1. Get all P0/P1 content gaps closed (TASKS items above)
2. Provide GA4 measurement ID
3. Mom ready to manage updates herself via Claude Code
4. Move repo to standalone path
5. Set up mom's GitHub on her laptop
6. Initiate domain transfer
7. Cut DNS to Vercel
8. Cancel Wix subscription after live site is verified

---

## How this file gets used

- **Mom:** if you finish a task above, ask Claude to mark it done. If you have a new photo or content gap to track, ask Claude to add it here.
- **Ben:** review periodically, knock out blockers (especially GA4 ID).
- **Claude:** every session, read this file. Before starting work, check if the task is listed. After finishing, mark it done and move it to "Recently completed" with a date.

---

## ✅ Recently completed

### 2026-05-06 — Final pre-DNS-flip audit pass

P0 sitewide ZIP fix:
- ✅ ZIP code corrected sitewide: `Napavine, WA 98565` → `Napavine, WA 98532` (29 occurrences across 24 HTML files). The wrong ZIP would have broken Google Maps lookups and donor mailings the moment DNS flipped to Vercel.

P1 content / parity fixes vs live lcautism.org Squarespace:
- ✅ SDCC business hours: `9:00 AM - 4:00 PM` → `9:00 AM - 5:00 PM` (matches Squarespace)
- ✅ Leadership page: added 7th board card "Vice President — Open Position" with apply-to-join CTA (Squarespace lists VP as the open seat)
- ✅ Leadership page: added "How to Reach the Team" section with 3 emails (info@, outreach@, executivedirector@) — was previously info@ only
- ✅ Spanish page (`pages/espanol.html`) mobile menu: added 6 links that English mobile menu had (Court Support, Summer Camp, SWWA Conference, Leadership, Recursos en Español)
- ✅ Partner name typos fixed:
  - `LC Primary Care & Family Medicine` → `Lewis County Private Family Medicine` (Squarespace says "Private")
  - `Community Action Lewis-Mason` → `Community Action Council of Lewis County`
  - `Arc Washington` → `The ARC of Washington`
- ✅ services.html hero: replaced `logo.png` placeholder with `community-team-members.jpg`
- ✅ Conference page banner reframed: "Postponed to November 2026" → "Returning November 2026" (date is past, copy now reads forward-looking)

P2 polish (Rule 20 photo cropping):
- ✅ Added `object-position: center top` to 21 people-photo `<img>` tags across 6 pages (index, about, sdcc, statewide, summercamp, vision2030). Faces no longer get cropped at the wrong height in 4:3 aspect ratio crops. (Michelle Whitlow's headshot already had it.)

### Still requires LCAC input (not auto-fixable)
- 🔴 GA4 measurement ID (placeholder still in head — only LCAC's Google Analytics admin has this)
- 🔴 Court Support Google Form URLs — the page currently uses `mailto:outreach@lcautism.org?subject=...` fallbacks; replace with real `/viewform` URLs from LCAC's Google Forms admin
- 🔴 Stripe Donate Link — `pages/donate.html` "Donate Now" CTA links to `https://www.lcautism.org/donate` (will infinite-loop after DNS flip). Need real Stripe Donate URL or third-party processor URL.
- 🟡 Coalition Meetings event card has past date (April 22, 2026) — needs next meeting date from LCAC. Auto-archives via JS but the HTML source still lists it as the first card.
- 🟡 Conference page placeholder photos (no usable conference photos in scraped library — Mom needs to provide originals)
- 🟡 Partners section: 60+ partner LOGOS missing (currently text-only chips — works fine, but logos would be richer)

### 2026-05-05 — Big content + photo build
- ✅ TASKS.md tracker created
- ✅ robots.txt added at site root
- ✅ Wrapped (360) 644-5222 in `tel:` links sitewide (15 files)
- ✅ Removed stale Formspree HTML comments (4 files)
- ✅ Wired BMX flyer (`bmx-show-2026.jpg`) to its event card on events.html
- ✅ Built **Leadership** page (`pages/leadership.html`) — board roster + Michelle Whitlow ED bio
- ✅ Built **What Is Autism** page (`pages/whatisautism.html`) — 1100-word public-info article
- ✅ Built **Vision 2030** page (`pages/vision2030.html`) — 4 strategic goals + action steps
- ✅ Built **Cultivating Belonging** page (`pages/cultivating.html`)
- ✅ Built **Court Support** page (`pages/courtsupport.html`)
- ✅ Built **Summer Camp** page (`pages/summercamp.html`)
- ✅ Built **SWWA Conference** page (`pages/conference.html`) — postponed-to-Nov-2026 status + 2024 speakers
- ✅ Built **Santa Sponsor** page (`pages/santasponsor.html`)
- ✅ Built **Teal Pumpkin Sponsor** page (`pages/tealpumpkin.html`)
- ✅ Populated **Partners** page (`pages/partners.html`) with 50+ named partners across 9 categories (replaced generic 4-card grid)
- ✅ Scraped 28 photos from old Wix site → `assets/images/`
- ✅ Compressed 121 MB → 9.9 MB (92% smaller, all photos now ≤700KB)
- ✅ Wired real photos into key feature slots:
  - homepage hero (`hero-friends-eating-outdoors.jpg`)
  - homepage SDCC card (`sdcc-ribbon-cutting-2025.jpg`)
  - SDCC "More Than a Building" (`sdcc-building-2025.jpg`)
  - Leadership ED slot (`michelle-whitlow.jpg`)
  - Statewide WA INCLUDE feature (`community-team-members.jpg`)
  - Statewide Local Impact feature (`community-group-smiling.jpg`)

### Still TODO
- 🔴 GA4 measurement ID (placeholder still in head — only LCAC's Google Analytics admin has this)
- 🟡 Court Support: replace `mailto:` fallback CTAs with real public Google Form `/viewform` URLs
- 🟡 Mom-provided higher-res originals to replace Wix scrapes (especially BMX/camp photos that we don't have)
- 🟡 Stripe Donate Link (replace `/donate` page bouncing to legacy Wix)
- 🟡 Conference page placeholder photos (no usable conference photos in scraped library — Wix conference page was mostly speaker headshot tiles & event flyers)
- 🟡 Homepage hero photo — current scrape (`hero-friends-eating-outdoors.jpg`) reads stock-y; mom may want to swap with a real LCAC community photo

### Confirmed: no LCAC accounts on Instagram / YouTube / TikTok / X / LinkedIn
Verified via direct scrape of all Wix pages (only Wix template default URLs found, no real LCAC handles) AND Google Search ("Lewis County Autism Coalition" + each platform → no matches). **Conclusion: keep these social icons removed from footer until mom confirms LCAC has accounts on those platforms.** Only Facebook (real URL) is preserved.

### 2026-05-05 — Final autonomous polish (perf + SEO + galleries)
- ✅ Updated `sitemap.xml` from 14 → 23 URLs (all 9 new pages + 2 sponsor variants now included with proper priorities)
- ✅ Swapped homepage `og:image` from `logo.png` to a real LCAC photo (`sdcc-ribbon-cutting-2025.jpg`) so social link previews show the community, not just a logo. Also added `og:image:alt` and `twitter:image` for full preview compatibility.
- ✅ Added `loading="lazy"` to 61 img tags across 24 files. Modern browsers smart-defer below-fold images for faster initial paint and lower data usage on mobile.
- ✅ Built SDCC photo gallery on `pages/sdcc.html` — "A Look Around" section using 7 previously-unused SDCC photos (building exterior, building 2025, new roof, interior sitting area, ribbon-cutting tables, ribbon-cutting martial arts, big check). Gives the SDCC page real visual proof of the space and the community moments.
- ✅ Built community photo gallery on `pages/about.html` — "Faces of LCAC" section using 9 previously-unused community + parade photos (women hugging, women smiling, happy parking lot, sun tent, parade jeep, parade family, parade crowd, autism resources table, joined hands unity). Brings the About page to life.
- ✅ Photo usage: 28 of 29 scraped photos now wired into the site (was 12 before this batch). 1 photo unreferenced (`hero-community.jpg`) — kept on disk as backup.

### 2026-05-05 — Desktop "More" dropdown
- ✅ Added a desktop "More ▾" dropdown to the nav so all 11 secondary pages (Leadership, Partners, Statewide, What Is Autism, Vision 2030, Cultivating Belonging, Court Support, Summer Camp, SWWA Conference, Sponsorship, Recursos en Español) are reachable on desktop without opening the hamburger menu. Pure CSS — no JS dependency. Hidden on mobile (≤1023px) — hamburger menu carries those links there. CSS appended to `css/styles.css`. Dropdown HTML inserted in all 24 HTML files via Python (handled both `pages/` prefix on homepage and bare paths on other pages).

### 2026-05-05 — Round 2 polish (bio + remaining photo slots)
- ✅ Expanded Michelle Whitlow's ED bio on Leadership page from 2 paragraphs to full 5-paragraph version (verbatim port from Wix, with proper "Warm regards / Michelle Whitlow, M.S. / Executive Director" sign-off)
- ✅ Wired all 6 remaining placeholder photos:
  - `summercamp.html` Summer Sensory Camp feature: `summer-camp-sensory-play.jpg`
  - `summercamp.html` Peer Mentorship feature: `community-kids-playing-parking-lot.jpg`
  - `vision2030.html` Goal 1 (Acceptance): `community-group-of-people.jpg`
  - `vision2030.html` Goal 2 (Early Intervention): `community-girl-hugging-grandmother.jpg`
  - `vision2030.html` Goal 3 (Youth Success): `hero-children-playing-circle.jpg`
  - `vision2030.html` Goal 4 (Adult Self-Sufficiency): `hero-smiling-teen-boy.jpg`
- ✅ Confirmed via web search + Wix scrape: no LCAC Instagram/YouTube/TikTok/X/LinkedIn accounts exist publicly. Footer cleanup is correct.
- 🟡 Conference page still has decorative placeholders — no usable conference photos in scraped library (those photos were mostly 2024 speaker headshot tiles, not general conference shots)

### 2026-05-05 — QA pass + polish (post-launch)
- ✅ Fixed RSVP modal auto-opening on /pages/events (was rendering on page load due to inline `display:flex` overriding `[hidden]` attribute)
- ✅ Fixed "an welcoming" → "a welcoming" sitewide (5 instances across 5 files)
- ✅ Fixed "belonging and belonging" duplicate-word typo on partners.html
- ✅ Replaced 6 identical board-member bios on Leadership page with role-varied versions
- ✅ Removed broken Instagram / YouTube / TikTok footer icon links sitewide (were going to bare domains; 72 icon-links removed across 24 files). Facebook (real LCAC URL) preserved.
- ✅ Shortened mobile menu label "Spectrum & Development Community Center" → "S&D Community Center" sitewide (23 files)
- ✅ Fixed "Download Flyer (PDF)" button text on events.html — file is actually `.jpg`, button now says "View Event Flyer"

