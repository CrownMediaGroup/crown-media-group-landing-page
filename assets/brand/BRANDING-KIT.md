# Crown Media Group — Official Branding Kit
## All Glory to Jesus Global LLC | crownmediagroup.co

---

## COLORS

| Name | Variable | Hex | Use |
|---|---|---|---|
| White | `--white` | `#FFFFFF` | Pure backgrounds |
| Cream | `--cream` | `#FDFBF7` | Primary page background |
| Warm | `--warm` | `#F9F5EE` | Section backgrounds, card fills |
| Gold | `--gold` | `#C9981A` | Primary brand accent |
| Gold Light | `--gold-light` | `#E8B832` | Hover states, highlights |
| Gold Deep | `--gold-deep` | `#9A720D` | Text on light, gradient start/end |
| Gold Pale | `--gold-pale` | `#F5E6B8` | Subtle backgrounds, eyebrow chips |
| Royal | `--royal` | `#1A1A3E` | Dark sections, CTA backgrounds, nav |
| Royal Mid | `--royal-mid` | `#2D2D5A` | Hover on royal |
| Text | `--text` | `#1A1A2E` | Primary body text |
| Text Mid | `--text-mid` | `#4A4A6A` | Secondary body text |
| Text Light | `--text-light` | `#8A8AAA` | Captions, meta, subtle text |
| Border | `--border` | `rgba(201,152,26,0.2)` | Card borders, dividers |
| Border Soft | `--border-soft` | `rgba(201,152,26,0.1)` | Subtle borders |
| Footer BG | — | `#0F0F28` | Footer only |

---

## TYPOGRAPHY

### Fonts
```
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;0,700;1,300;1,400&family=Inter:wght@300;400;500;600;700;800&display=swap');
```

| Role | Font | Weight | Notes |
|---|---|---|---|
| Display / Headlines | Cormorant Garamond | 700 | letter-spacing: -0.02em |
| Body | Inter | 400 | line-height: 1.75 |
| UI / Labels | Inter | 500–700 | |
| Italic accents | Cormorant Garamond | 300–400 italic | Gold color |

### Scale
- Hero: clamp(3.5rem, 7vw, 7rem) — Cormorant Garamond 700
- H2 sections: clamp(2.5rem, 4vw, 4rem) — Cormorant Garamond 700
- Body: 1rem / 0.95rem — Inter 400
- Label: 0.7rem, 700, letter-spacing: 0.2em, UPPERCASE, gold
- Eyebrow: 0.72rem, 700, letter-spacing: 0.18em, UPPERCASE

---

## GRADIENTS

```css
/* Gold gradient — used on featured elements, CTAs, case letter */
background: linear-gradient(135deg, #9A720D 0%, #E8B832 50%, #9A720D 100%);

/* Gold text gradient */
background: linear-gradient(135deg, #9A720D 0%, #E8B832 50%, #9A720D 100%);
-webkit-background-clip: text;
-webkit-text-fill-color: transparent;

/* Gold divider line */
background: linear-gradient(90deg, transparent, #C9981A, transparent);

/* Gold bottom border on service cards */
background: linear-gradient(90deg, #C9981A, #E8B832);
```

---

## BUTTONS

```css
/* Primary — Royal */
.btn-royal {
  background: #1A1A3E;
  color: #E8B832;
  padding: 12px 28px;
  border-radius: 4px;
  font-size: 0.85rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

/* Secondary — Outline */
.btn-outline {
  background: transparent;
  color: #1A1A2E;
  border: 1.5px solid rgba(201,152,26,0.2);
  padding: 12px 28px;
  border-radius: 4px;
  font-size: 0.85rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

/* CTA Gold Large */
.btn-gold-large {
  background: linear-gradient(135deg, #9A720D, #E8B832);
  color: #1A1A3E;
  font-size: 0.95rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 20px 56px;
}
```

---

## COMPONENTS

### Section Label
```css
font-size: 0.7rem; font-weight: 700; letter-spacing: 0.2em;
text-transform: uppercase; color: #C9981A;
```

### Eyebrow Chip
```css
background: #F5E6B8; color: #9A720D;
border: 1px solid rgba(201,152,26,0.2);
padding: 8px 20px; border-radius: 2px;
font-size: 0.72rem; font-weight: 700; letter-spacing: 0.18em;
```

### Card (light)
```css
background: #FFFFFF;
border: 1px solid rgba(201,152,26,0.15);
border-radius: 0; /* flat/minimal */
padding: 48px 36px;
```

### Price Feature Bullet
```css
/* Use -- as bullet, gold color */
content: '--'; color: #C9981A; font-weight: 700;
```

### Blockquote / Pull Quote
```css
border-left: 3px solid #C9981A;
background: #F9F5EE;
font-family: 'Cormorant Garamond', serif;
font-size: 1.4rem; font-style: italic;
color: #9A720D;
padding: 24px 28px;
```

---

## LOGO USAGE

- Logo file: `assets/brand/crown-media-group-logo.png`
- Minimum size: 34px height
- Border-radius on small use: 6–8px
- Never place on busy backgrounds without padding
- Brand name font: Cormorant Garamond 700, letter-spacing: 0.02em

---

## BRAND VOICE

- Bold, direct, confident — no filler words
- Faith-aligned but not religious-heavy in business contexts
- Local (Columbia, SC) and personal — you talk to King directly
- Results-first — lead with proof and outcomes
- Never corporate. Never generic.

---

## CONTACT INFO (official)

- Website: crownmediagroup.co
- Email: king@crownmediagroup.co
- Phone: (908) 848-1436
- Instagram: @mkdavidking
- Location: Columbia, SC 29229

---

## CSS ROOT VARIABLES (copy-paste into any project)

```css
:root {
  --white: #FFFFFF;
  --cream: #FDFBF7;
  --warm: #F9F5EE;
  --gold: #C9981A;
  --gold-light: #E8B832;
  --gold-deep: #9A720D;
  --gold-pale: #F5E6B8;
  --royal: #1A1A3E;
  --royal-mid: #2D2D5A;
  --text: #1A1A2E;
  --text-mid: #4A4A6A;
  --text-light: #8A8AAA;
  --border: rgba(201,152,26,0.2);
  --border-soft: rgba(201,152,26,0.1);
  --footer: #0F0F28;
  --font-display: 'Cormorant Garamond', serif;
  --font-body: 'Inter', sans-serif;
}
```

---

*Crown Media Group | All Glory to Jesus Global LLC | Updated 2026-03-17*
