# Reese for Richland — Campaign Website

Jim Reese for Richland County Council District 1 (Republican)
Domain: reeseforrichland.com | Built by Crown Media Group

---

## Project Overview

Single-file campaign landing page. All CSS and JS are inline — no build step required.
Open `index.html` in any browser and it works. Drop the `/website` folder on any static host to deploy.

---

## Files

```
website/
├── index.html        ← Complete page (open this in browser)
├── images/
│   ├── fb-campaign-1.jpg   ← Hero: Jim's campaign banner (auto-downloaded)
│   ├── fb-campaign-3.jpg   ← About: District 1 map (auto-downloaded)
│   ├── jim-profile-fb.jpg  ← News card: campaign logo (auto-downloaded)
│   └── [add more photos here as campaign grows]
└── README.md
```

---

## Swapping Photos

All image `src` paths point to the `images/` folder. To replace a photo:

1. Drop the new photo into `images/`
2. Find the `<img>` tag in `index.html` and update the `src` attribute
3. Update the `alt` text to describe the new photo

**Photo swap priorities (highest impact first):**
- **Hero (right side):** Replace `fb-campaign-1.jpg` with a portrait headshot (600x750px recommended). The current banner is landscape — a portrait of Jim will look stronger in the split hero layout.
- **About section:** Replace `fb-campaign-3.jpg` with a family photo (Jim + Elisa + kids). Use the district map image elsewhere as a supplemental visual.
- **News cards:** Add event photos as they happen (cookout, door-knocking, etc.)

---

## Customizing Content

All content is in plain HTML in `index.html`. Search for any text to find and edit it.

**Key things to update as campaign progresses:**
- Add more news cards in the `#news` section as events happen
- Update the cookout RSVP link if the form URL changes
- Add a yard sign request option to the Join section
- Add X/Twitter and YouTube social links in the footer (two commented-out placeholders are ready)

---

## All Links Wired

| Button | Destination |
|---|---|
| Donate (all) | Square checkout |
| Join / Cookout RSVP | Google Form |
| Facebook | Jim's FB page |
| Instagram | Jim's IG page |
| Email | electjimreese@gmail.com |
| Phone | 803-530-3712 |

---

## Deploy to Netlify (Drag & Drop — 60 seconds)

1. Go to **netlify.com** and log in (use King's account)
2. Click **"Add new site" → "Deploy manually"**
3. Drag the entire `/website` folder into the drop zone
4. Netlify gives you a live URL immediately (e.g., `reese-for-richland-xyz.netlify.app`)
5. Share that preview URL with Jim

---

## Connect reeseforrichland.com (Hostinger DNS → Netlify)

Jim's domain is registered at Hostinger. To point it to this Netlify site:

**Step 1 — In Netlify:**
- Go to your site → "Domain management" → "Add a domain"
- Enter `reeseforrichland.com`
- Netlify will show you the DNS records you need

**Step 2 — In Hostinger (hpanel.hostinger.com):**
- Go to **Domains → reeseforrichland.com → DNS / Nameservers**
- Find the existing A record for `@` → delete it
- Add new A record: `@` → Netlify's IP address (shown in Netlify dashboard, e.g. `75.2.60.5`)
- Add CNAME record: `www` → `[your-site-name].netlify.app`

**Step 3 — Wait:**
- DNS propagation: 15 minutes to 48 hours (usually under 1 hour)
- Netlify auto-provisions SSL (Let's Encrypt) once DNS resolves
- Site goes live at https://reeseforrichland.com

---

## Remaining Placeholder Items

- [ ] Hero photo: swap to a portrait headshot of Jim (landscape banner currently in place)
- [ ] About photo: swap to a family photo (Jim, Elisa, and the kids)
- [ ] Add X/Twitter link in footer when account is ready (placeholder comment in code)
- [ ] Add YouTube link in footer if a channel is created
- [ ] Add event recap photos to news cards after the April 18th cookout

---

Built by Crown Media Group | king@crownmediagroup.co | crownmediagroup.co
