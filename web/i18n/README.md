# Translating Prenúncio

One file per language, `<code>.json`. `en.json` is the reference: every other file has exactly its keys. A key a file lacks is shown in English, and the test fails on it.

## Tone

Plain and short. One sentence per idea, present tense, no adjectives, no exclamation marks, no slogans in pairs of fragments. Where someone did something the subject is "we" (we trained, we tested, we built). The reader is addressed as an adult who enforces the law, writes about it or studies it. No em dashes. Say "the Amazon", never "the Legal Amazon". The benchmark is called "benchmark" in every language unless your language has one settled word for it. Never write that a place was "flagged".

## How a string is written

- A string is a whole sentence. Never build one from two keys.
- `{name}` is a placeholder; keep every placeholder of the English sentence, in whatever order your language needs. Numbers arrive already formatted for your locale. The test compares the placeholders of each sentence with the English ones.
- **Plural forms.** Any string may be replaced by an object of forms, `{"one": "...", "few": "...", "many": "...", "other": "..."}`, with the categories your language has in CLDR; `other` is required. It is chosen by the count behind `{n}`. It works for the keys that carry a count: `ahead`, `next`, `legendNext.*`, `cellHa.*`, `act.bandSubN`, `st.forestB`, `st.first`, `st.sources`. `rank` uses ordinal categories (English: one, two, few, other give 1st, 2nd, 3rd, 4th).
- **`{ "all": ..., "here": ... }`** is one sentence in two versions: for the whole Amazon, and for a place the reader selected ("here"). Translate both whole.
- Arrays keep their length and order (`level`: quiet, watch, warning, alarm; `act.parts`: a quarter, a third, half, two thirds, three quarters; `enso`; `ensoLevel`; `bench.head`: the six column headings, the first and fourth empty; `numSources`: the numbers zero to twelve as words, agreeing with the word for "sources" in `st.sources`).
- `km²`, `%`, `TI`, `UC`, `CSV`, `API`, `GitHub`, `IBAMA`, `INPE`, `El Niño` and the model's name stay as they are. Write units the way your language does.

## The groups of keys

- `st.*`: the opening story, one caption a step, read large. **At most 110 characters each** (about 55 in Chinese, Japanese and Korean). `st.next`, `st.back`, `st.done` are spoken labels of the arrow buttons. There are twelve steps. `st.sectors` names the Sectors mode with the exact word of `modes.sectors` and lists the four kinds in the singular. The last step has two versions, `st.use` for a pointer ("move the pointer over the map", "click to zoom in") and `st.useTouch` for a finger ("tap the map"). `st.lossB` says the total cleared since the first year; `st.lossBMore` is the same sentence with a comparison to a place your readers know whose area is `st.moreKm` km² (for English, England, 130,279); it is used only while the total is larger. Leave both out if no place fits.
- `like`: the table of comparisons, used under a headline that states an area ("Twice Greater London."). **Choose 10 to 15 places your readers know**, from about 25 km² to about 130,000 km², spread evenly (each roughly two to three times the one before). Each row has `km` (its area in km²) and whole sentences for `same`, `x2`, `x3`, `x4`, `x5`, `x10`, `half`, `third`; leave out a multiple that reads badly for that place. A file with no `like` shows no comparison.
- `fc`, `fcNone`, `mfc.*`, `mobs.*`, `burned.*`, `past*`, `where.*`, `lastSub.*`, `act.say`, `act.none`: headlines of the bulletin. Number first where your language allows. **At most about 70 characters.** No full stop at the end.
- `hazard.*`, `scale.*`, `modes.*`, `kinds.*`, `ranking`, `story`, `about`, `skip`, `close`, `copy`, `chance`: controls, set in capitals where the script has them. **One or two words; `modes.*` at most 11 characters each, `hazard.*` at most 13.**
- `level`: the four alert levels, one word each, at most 9 characters.
- `chanceBy`, `chanceFor`, `legend.*`, `legendNext.*`, `lower`, `higher`, `less`, `more`, `mapped`, `step*`, `under`: the key to the map's colours. `chanceBy` is at most about 60 characters.
- `cell*`, `area*`, `tip*`: what a cell or a sector says under the pointer.
- `why.*`: the sentence or two that say why a place is on the priority list.
- `aboutText.*`: the About page, in order. `bench.*`: the benchmark table and its buttons.
- `act.*`: the Actions view (what enforcement accounts for). `act.honest` is one sentence and must keep both ideas: a floor, and not proof of cause.
- `sign.*`, `signs`, `signTitle`, `enso*`: the small traces under the timeline.
- `people.*`: the credit under a photograph of an Indigenous people (author and licence are a licence condition) and the heading of the other peoples of the same land.
- `front.*`, `menu`, `home`, `closeList`, `language`, `prevYear`, `nextYear`, `onlyFrom`, `bars`, `line`: labels read by screen readers and shown on hover.
