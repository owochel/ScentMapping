# Scent Mapping

Live project: [https://scentmapping.netlify.app/](https://scentmapping.netlify.app/)

Scent Mapping is a public interactive site where anyone can contribute:

- a scent name
- a chosen color
- a short description of what that scent feels like

The project explores how people map smell to color and language.

## What this page includes

- **Input section** for adding new scent/color/description entries
- **Library** of submitted entries with relevance search and pagination
- **Visualization** cards (glow-orb style) showing top color associations per scent
- **Color Spectrum Map** showing all used colors as interactive dots
- **Export** buttons (JSON / CSV)

## How it is buit

> **Notice**  
> This project was built with significant help from Cursor during implementation and iteration.

For fontend, this is a vanilla html (no framework build step):

- `index.html` for structure and sections
- `styles.css` for visual design and interactions
- `app.js` for state, rendering, search, data sync, and export logic

For implementation process:

1. Designed and implemented the contribution flow first (input + local state + list render).
2. Built two visual systems:
   - scent-level glow orbs
   - interactive spectrum map with zoom/pan + hover detail
3. The search algorithm is a cosine similarity (token + trigram vectors).
4. Connected Supabase for shared public data.
5. Kept local cache fallback to make the app resilient when remote calls fail.
6. Made export fetch from Supabase first (fallback to local cache).

## Data + backend

The app uses:

- **Supabase** (shared backend)
- **Local Storage** fallback cache (`scentMapping.entries.v1`)

Expected Supabase table: `public.scent_entries`

- `id` (uuid)
- `scent` (text)
- `color_hex` (text)
- `description` (text)
- `created_at` (timestamptz)
- `updated_at` (timestamptz)
