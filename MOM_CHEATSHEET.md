# 📝 Mom's cheat sheet — talking to Claude about the LCAC website

Print this. Keep it next to your laptop.

## How to start every session

1. Open Terminal (search "Terminal" or "PowerShell" on Windows)
2. Type these two lines:
   ```
   cd "C:\path\to\lcautism-coalition"
   claude
   ```
3. Wait for Claude to say something like "What would you like to work on today?"

That's it. Now you just talk in plain English.

---

## Common things you'll want to do — copy these prompts

### 🆕 Add a new event

> "Add a new event to the events page: Coalition Meeting on Wednesday June 25th 2026 at 6 PM at the S&D Community Center in Napavine. Same description as the other Coalition Meetings."

### ✏️ Change the date or details on an event

> "Change the date on the Art with Krystian event to Saturday May 9th."

> "The Adult Group on April 25 needs the location updated — it's now at Riverside Park, not Fairway Lanes."

### 🗑 Remove an event that didn't happen

> "Delete the May Teen Group event — we cancelled it."

### 🎥 Add a promo video to an event

> "Add this YouTube video to the Car & BMX Show event: https://www.youtube.com/watch?v=ABC123"

(Claude will convert the YouTube watch URL to the embed format automatically.)

### 📄 Add a flyer to an event

1. Save the flyer as a PDF on your desktop (e.g. `car-bmx-flyer.pdf`)
2. Tell Claude:
   > "Add the flyer car-bmx-flyer.pdf from my Desktop to the Car & BMX Show event."

Claude will move the PDF into the right folder and wire it up.

### 📸 Swap a photo on a page

1. Save the photo as a JPG or PNG (max 1600px wide, under 500KB)
2. Drag it to your Desktop
3. Tell Claude:
   > "Replace the placeholder photo on the homepage hero with mom-2025-event.jpg from my Desktop. The photo shows a community gathering at the S&D Center."

### 📝 Change the wording on a page

> "On the about page, change 'serves families' to 'walks alongside families' in the mission section."

> "Update the contact page intro to mention we now have Spanish-speaking volunteers."

### 📞 Update phone number, email, or address

> "Change the phone number in the footer from (360) 555-1234 to (360) 555-9876 on every page."

### 🌐 Push my changes live

> "Push that change to the website."

(Claude will ASK you to confirm before pushing. You answer "yes" if you're sure, "no" if you want to keep making more changes first.)

---

## Things Claude will (and should) ask you about

- **"Should this be visible on every page or just one?"** — answer wherever you want it.
- **"Want me to push this live now or wait for more changes?"** — your call. Pushing live is a one-second thing; you can do it after every edit OR batch them up.
- **"This image is 4MB — could you resize it to under 500KB first? Photo too large will load slowly on phones."** — yes, please use https://tinypng.com or similar to compress.

---

## Things to NEVER ask Claude to do without Ben

- "Delete the volunteer page"
- "Change the form so it sends to a different email"
- "Add a new page from scratch"
- "Update the website's colors / fonts / design"
- "Connect a new tool / plugin / service"

These need Ben's eyes. Just text him: "Hey, can you help me with [thing]?"

---

## When something goes wrong

If Claude says "I hit an error" or you see red text on the screen, **STOP and text Ben**. Don't try to fix it yourself — Ben can usually un-stick things in 60 seconds.

If the live website at lcautism.org looks broken (blank page, weird formatting, etc.), text Ben FIRST. Most often it's because of a deploy in progress (60 seconds to settle) but if it's still broken after 2 minutes, Ben needs to roll back.

---

## Quick reference

| Want to... | Type this prompt |
|---|---|
| Add an event | "Add an event for [date] at [location]: [description]" |
| Edit an event | "Change [event name]'s date to [new date]" |
| Cancel an event | "Remove [event name] from the events page" |
| Add a video | "Add this YouTube video to [event]: [URL]" |
| Add a flyer | "Add [filename.pdf] from my Desktop to [event]" |
| Swap a photo | "Replace the [which one] photo with [filename] from my Desktop" |
| Edit page text | "On [page name], change '[old text]' to '[new text]'" |
| Push live | "Push this live" or "Send this to the website" |

---

You've got this 💙
