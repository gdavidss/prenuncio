# content/

Short texts and photographs about the Indigenous peoples whose lands appear on the map. The panel shows them when a visitor selects an Indigenous land.

## Files

- `peoples.json` has one entry per people, keyed by a slug. Fields: `name`, `aliases` (other names and the FUNAI spelling from the land register), `pt` and `en` (two or three sentences), `sources` (the pages each sentence rests on), `photo` (null, or `file` as a path relative to `web/`, `author`, `license`, `source_url` pointing to the Commons page, `caption_pt`, `caption_en`) and `confidence` (`checked` when every sentence is sourced, `thin` when little was found and the text is one safe sentence).
- `ti_peoples.json` maps each land `id` (the `id` of `data/raw/aux_ti/indigenous_area_legal_amazon.shp`, the same `id` used in `web/data/sectors_ti.json`) to a list of people keys.
- `web/img/peoples/<key>.jpg` holds the photographs, at most 900 px on the long side, with all metadata removed.

## Rules for the text

- Present tense, plain, specific, respectful. Who they are today, where they live, how many they are with the year and source of the figure, their language family, and one concrete, true thing about their life, the forest or the pressure on their land.
- No exoticism, no "ancient tribe" clichés, no pity, no slogans, no em dashes.
- Every sentence rests on a source that was opened and is listed in `sources`. Nothing is copied from the sources. Where figures disagree, the most recent is used, with its year.
- The main source is the Instituto Socioambiental encyclopedia Povos Indígenas no Brasil (pib.socioambiental.org) and its table "Quadro Geral dos Povos", which gives population, source and year for each people.
- `name` is the name the people use for themselves where that is common public usage, otherwise the usual Brazilian spelling.
- Peoples in voluntary isolation get no photograph and no speculation, only what FUNAI or ISA state.

## Rules for photographs

- Real photographs only. Never AI-generated, never illustrated.
- Only files whose own Wikimedia Commons page states CC BY, CC BY-SA, CC0 or public domain. Nothing "fair use", non-commercial, no-derivatives or unclear.
- The Commons page must identify the people. If there is doubt that a photo shows that people, it is left out.
- People shown with dignity in ordinary or ceremonial life, recent where possible. No colonial-era anthropometric or posed "specimen" photographs, no nudity of minors, no images of the dead, no photographs of isolated or recently contacted peoples, aerial ones included.
- Author, licence and Commons URL are recorded exactly. Attribution is a condition of the licence, so the panel must show `author` and `license` with a link to `source_url`.
- No photo is better than a wrong or doubtful one.

## How the land join was made

The FUNAI register lists peoples per land under its own spellings, sometimes generic ("Timbira", "Makú", "Karipuna") and sometimes wrong. Each FUNAI name was mapped to one key, and a few lands were corrected by hand where the ISA page for the people names the land. Examples: Trincheira Bacajá and Xikrin do Rio Catete go to `xikrin`; Ipixuna and Nove de Janeiro go to `parintintin`; Araribóia gets `guajajara` as well as `awa-guaja`; Tubarão Latundê goes to `aikana`, `kwaza` and `nambikwara`.

## Adding or correcting an entry

1. Edit `peoples.json`. Keep the key, change the text, and add the URL you used to `sources`. If the text is no longer a single safe sentence, set `confidence` to `checked` only when every sentence has a source.
2. To change which peoples a land shows, edit that land's list in `ti_peoples.json`.
3. For a photograph, check the licence on the file's Commons page, resize to at most 900 px, save as JPEG at quality 80 under 150 KB, strip metadata (`ffmpeg -i in.jpg -vf "scale='min(900,iw)':-2" -map_metadata -1 -q:v 4 out.jpg`), and fill in `photo` with the exact author, licence and Commons URL.
4. Corrections from the peoples themselves, or from their associations, take precedence over any other source, including the ones cited here. If a people asks for a text or a photograph to be changed or removed, do it.
