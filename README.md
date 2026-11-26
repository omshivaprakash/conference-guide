# Conference Guide

**One free guide to the major recurring conferences in India and around the world, by stream: when they usually happen, where, who runs them, and their official sites.**

Open it here: **https://omshivaprakash.github.io/conference-guide/** (once GitHub Pages is switched on for this repository).
Works on any phone or laptop. No account, no ads, no app store. You can install it like an app, and it keeps working without internet after your first visit.

It is the companion to **[LitFest Guide](https://omshivaprakash.github.io/litfest-speaker-guide/)** (literature festivals) and **[FilmFest Guide](https://omshivaprakash.github.io/filmfest-guide/)** (film festivals), and is built the same way.

---

## Why this exists

Every field has its big annual meetings, but finding them means knowing the acronym first. If you are a student, researcher, founder or professional in India, simple questions are oddly hard to answer:

- *"What are the main conferences in my field, in India and abroad?"*
- *"What happens in February, and where?"*
- *"Which of these move between cities, and which always meet in the same place?"*

**Conference Guide puts them side by side**, in one clean place, built for a thumb on a phone. It is free and not run by any conference.

---

## What you can do with it

| You want to… | Where to go |
|---|---|
| See every stream, the world map and what is coming up | **Home** (the **All** chip) |
| Open a stream: its conferences, India first, and a month-by-month chart | Stream chip, **Discover** tab |
| Search by name, city, organiser or topic; filter by India, region or month | **Conferences** tab (or **Search**) |
| See where a stream's conferences meet | **Map** tab |
| Open a conference: usual month, place, organiser, how often, official site | Tap any conference |

Links are shareable: `?s=medicine` opens a stream and `#list` or `#map` opens a tab.

---

## What is covered

**159 recurring conferences, 44 of them in India, across 12 streams:** Technology · AI and data · Cybersecurity · Science · Medicine and health · Business and startups · Design · Climate and energy · Policy and society · Humanities and social sciences · Education · Engineering and space. A conference can belong to more than one stream.

India includes, for example, Bengaluru Tech Summit, India Mobile Congress, Nullcon, PyCon India, Raisina Dialogue, BioAsia, APICON, the Indian History Congress and Aero India. The world list includes CES, NeurIPS, ASCO, Davos, COP, Milan Design Week, the Munich Security Conference and the International Astronautical Congress.

---

## Can I trust it?

Mostly, with care.

- Each entry is **hand-listed** from the conference's official site and organiser. Every India entry was checked online in November 2026, and a weekly job flags dead links and disagreements with Wikidata.
- **The month is the usual one.** Dates, venues and host cities change, and some conferences skip years. The official site is always the final word, and every entry links to it (or offers a web search where we have no confirmed site).
- Conferences that **move between cities** sit at their country's centre on the map, drawn as a hollow dot. Those that move between countries are listed beside the map instead.

It is an independent project, not affiliated with any conference. To correct or add something, [open an issue](https://github.com/omshivaprakash/conference-guide/issues/new).

---

## Your privacy

No sign-up, no tracking, no analytics, no cookies. The site makes no requests to outside services when a page loads; fonts and data are served from this repository.

---

## How it works

A website made of plain files: `index.html`, `app.js`, `style.css`, the map outlines in `geo.js`, and the data in `catalog.json`. There is no server and no database. `sw.js` saves the site to your device after the first visit. On every push, GitHub Actions runs `node check-catalog.mjs` to validate the data.

### Data fields (`catalog.json`)

- `streams`: `id`, `name` and a text `icon` for each stream.
- `places`: city name → `[longitude, latitude]`, used for the map.
- `conferences`, one per line:

| Field | Meaning |
|---|---|
| `id` | Short unique id, lower case |
| `name`, `short` | Full name and the short name people use |
| `streams` | One or more stream ids; the first is the main one |
| `city` | Host city, or `null` when it moves |
| `country` | Host country, or `null` when it moves between countries |
| `region` | `India`, `Asia`, `Europe`, `North America`, `Latin America`, `Africa`, `Middle East`, `Oceania` or `Worldwide` |
| `month` | Usual month, or a range such as `August to October` |
| `every` | How often, for example `Annual` or `Every two years, odd years` |
| `since` | First year, where known |
| `org` | Organiser |
| `url` | Official site (https), where confirmed |
| `desc` | One sentence in our own words |
| `wikidata` | Wikidata item id, added by the weekly refresh |

### Weekly refresh

Every Monday, GitHub Actions runs `tools/extractors/refresh/extract.py` (`.github/workflows/refresh.yml`, or run it by hand from the Actions tab). It:

- checks every official link and lists dead or moved ones;
- matches each conference to Wikidata, but only when the Wikidata item's official website is on the same site as ours, and stores its `wikidata` id;
- fills in a missing first year from Wikidata, and never overwrites a year or anything else we checked by hand.

Anything else it finds, such as Wikidata giving a different first year or website, goes into `data/refresh/report.json` for a person to review. It commits only when something changed.

### Adding a conference

Add one line to `conferences` in `catalog.json`. If its city is new, add the city to `places`. Run `node check-catalog.mjs` and open a pull request.

---

## Licence

Code: MIT (`LICENSE`). Data: CC BY 4.0 (`LICENSE-DATA.md`); cite as *Conference Guide (omshivaprakash), https://omshivaprakash.github.io/conference-guide/, CC BY 4.0*. See `CITATION.cff`.
