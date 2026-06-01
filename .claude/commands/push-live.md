---
description: Make the previewed change LIVE on the real website
---

The operator has reviewed the preview and wants to make it LIVE on lcautism.org.

FIRST, confirm out loud: **"Just to confirm — you want this live on the real website now? Type 'yes' to send it live."** Wait for "yes" (CLAUDE.md rule 3). If they say no, stop and do nothing.

Once they confirm:

1. Make sure the current change is committed and pushed on the working branch (run `/preview` first if it isn't).
2. Switch to main and update it: `git switch main` then `git pull origin main`.
3. Merge the working branch into main: `git merge <branch-name>`.
4. Push main live: `git push origin main`.
5. Switch back to the working branch: `git switch <branch-name>`.
6. Tell the operator: **"Sent it live! Give the website about 60 seconds to update, then I'll check it's really live."**
7. **Confirm it actually went live** (don't just assume the push worked):
   - Wait about 60 seconds for Vercel to finish deploying.
   - Fetch the live page that changed (e.g. `https://lcautism.org/...`) and check the new text/photo is actually there.
   - If it IS there, tell her: **"✅ Confirmed live — it's on the real website now. Open [the page link] and you should see it. Look right?"** and give her the direct link to the page she changed.
   - If it is NOT there yet after a minute, wait another 30–60 seconds and check once more before reporting.
8. Only call it done once she says it looks right. If she says it looks wrong or she can't see it, do NOT leave it broken — offer to undo the change (revert) and tell her you can roll it back, or to text Ben if she's unsure.

If ANY git step errors — a merge conflict, an auth failure, anything red — STOP immediately. Do not force, do not `--hard`, do not retry blindly. Tell the operator: "I hit an error pushing. Could you text Ben?" (CLAUDE.md rule on push failures).
