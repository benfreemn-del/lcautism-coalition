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

### Still TODO (deferred — see "Photo Gaps" + "Blockers" above)
- GA4 measurement ID (placeholder still in head)
- Court Support: replace `mailto:` fallback CTAs with real public Google Form `/viewform` URLs
- Wire remaining `<!-- TODO: Replace with real photo -->` slots in vision2030.html + summercamp.html + conference.html
- Mom-provided higher-res originals to replace Wix scrapes (especially leadership headshot + BMX/camp photos that we don't have)
- Real Instagram / YouTube / TikTok handles for footer (or remove)
- Stripe Donate Link (replace `/donate` page bouncing to legacy Wix)
- Update Michelle Whitlow's full bio (Wix scrape only got opening paragraph verbatim)

