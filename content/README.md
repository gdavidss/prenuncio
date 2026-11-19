# content/

Short texts and photographs about the Indigenous peoples whose lands appear on the map. The panel shows them when a visitor selects an Indigenous land.

## Files

- `peoples.json` has one entry per people, keyed by a slug. Fields: `name`, `aliases` (other names and the FUNAI spelling from the land register), `pt` and `en` (two or three sentences), `sources` (the pages each sentence rests on), `photo` (null, or an object, see below) and `confidence` (`checked` when every sentence is sourced, `thin` when little was found and the text is one safe sentence).
- A `photo` object has `file` (a path relative to `web/`), `author`, `license` (the short form shown in the credit line), `source_url` (the page of the file itself, on Commons, Flickr or the institution's site), `caption_pt` and `caption_en`. Two fields are optional. `license_url` points to the reuse statement when the licence is not a Creative Commons deed. `kind` is `place` when the photograph shows a village, land or river instead of people.
- `peoples_i18n/<lang>.json` holds the same lines and captions in another language, `{"<people key>": {"text": "...", "caption": "..."}}`. `pipeline/peoples.py` writes one file a language for the site, `web/data/peoples/<lang>.json`; where a translation is missing the English stands in and the entry is marked `fallback`.
- `ti_peoples.json` maps each land `id` (the `id` of `data/raw/aux_ti/indigenous_area_legal_amazon.shp`, the same `id` used in `web/data/sectors_ti.json`) to a list of people keys.
- `web/img/peoples/<key>.jpg` holds the photographs, at most 900 px on the long side, with all metadata removed. Peoples who share one photograph each have their own copy.

## Rules for the text

- Present tense, plain, specific, respectful. Who they are today, where they live, how many they are with the year and source of the figure, their language family, and one concrete, true thing about their life, the forest or the pressure on their land.
- No exoticism, no "ancient tribe" clichés, no pity, no slogans, no em dashes.
- Every sentence rests on a source that was opened and is listed in `sources`. Nothing is copied from the sources. Where figures disagree, the most recent is used, with its year.
- The main source is the Instituto Socioambiental encyclopedia Povos Indígenas no Brasil (pib.socioambiental.org) and its table "Quadro Geral dos Povos", which gives population, source and year for each people.
- `name` is the name the people use for themselves where that is common public usage, otherwise the usual Brazilian spelling.
- Peoples in voluntary isolation get no photograph and no speculation, only what FUNAI or ISA state.

## Rules for photographs

- Real photographs only. Never AI-generated, never illustrated.
- The site is free, public and non-commercial, and it credits every photograph with author, licence and a link. Accepted licences are CC BY, CC BY-SA, CC0 and public domain, and also CC BY-NC and CC BY-NC-SA. CC BY-ND and CC BY-NC-ND are accepted only when the photograph is used whole. It may be resized, never cropped or edited.
- Accepted sources are Wikimedia Commons, Flickr photographs whose own page states one of those licences, gov.br portals whose footer licenses the content under CC BY-ND 3.0 (Funai, Ministério dos Povos Indígenas, Sesai, Ibama, ICMBio) when the photograph is credited to the agency or its staff, and institutions that state free reuse with credit (Agência Senado, Câmara dos Deputados, STF, DPU, MPF, state news agencies that say so, Amazônia Real, Apib Comunicação, Cimi when a licence is stated, university repositories with a licence).
- Never used are all rights reserved, no stated licence, press agencies, newspapers, stock sites, the ISA archive, Survival International, film stills and museum photographs that show only objects.
- The source page must identify the people. A photograph that shows several peoples is usable for one of them when the source names that people among those shown, and the caption says so.
- People are shown with dignity in ordinary or ceremonial life, recent where possible. A named adult is left out only when a source says the person has died. Group photographs are fine when adults are the subject. A photograph is left out when a child is the subject, is in the foreground or is unclothed. Adults in traditional dress or body paint are fine when they are plainly adults.
- Still left out are colonial-era anthropometric or posed "specimen" photographs, images of the dead, anything demeaning, and any photograph of isolated or recently contacted peoples, aerial ones included.
- When no usable photograph of a people exists, a photograph of their village, land, river or house can stand in, if the source identifies it as that people's or that land's. It carries `"kind": "place"` and a caption that says what it is. People come first.
- Author, licence and source URL are recorded exactly. Attribution is a condition of every licence, so the panel must show `author` and `license` with a link to `source_url`.
- No photo is better than a wrong or doubtful one.

## How the land join was made

The FUNAI register lists peoples per land under its own spellings, sometimes generic ("Timbira", "Makú", "Karipuna") and sometimes wrong. Each FUNAI name was mapped to one key, and a few lands were corrected by hand where the ISA page for the people names the land. Examples: Trincheira Bacajá and Xikrin do Rio Catete go to `xikrin`; Ipixuna and Nove de Janeiro go to `parintintin`; Araribóia gets `guajajara` as well as `awa-guaja`; Tubarão Latundê goes to `aikana`, `kwaza` and `nambikwara`.

## Adding or correcting an entry

1. Edit `peoples.json`. Keep the key, change the text, and add the URL you used to `sources`. If the text is no longer a single safe sentence, set `confidence` to `checked` only when every sentence has a source.
2. To change which peoples a land shows, edit that land's list in `ti_peoples.json`.
3. For a photograph, check the licence on the file's own page, resize to at most 900 px, save as JPEG at quality 80 under 150 KB, strip metadata (`ffmpeg -i in.jpg -vf "scale='min(900,iw)':-2" -map_metadata -1 -q:v 4 out.jpg`), and fill in `photo` with the exact author, licence and source URL. Do not crop a photograph under an ND licence.
4. Corrections from the peoples themselves, or from their associations, take precedence over any other source, including the ones cited here. If a people asks for a text or a photograph to be changed or removed, do it.
