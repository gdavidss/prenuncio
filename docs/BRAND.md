# Prenúncio brand guidelines

Prenúncio is the sign before the event: an early warning for the Brazilian Amazon. It says where forest will be cleared, burned, degraded or mined next, and how hard the pressure is now. It is built to help decide where to act.

**Green is forest. Red is clearing.** Everything else follows from that.

## Voice

Number first, then the fact, then stop. Quantities are named for what happened to the forest (km² cleared, burned, degraded, mined), never for the instrument that saw it. One short sentence per idea, present tense, no adjectives, no reassurance, no exclamation marks. Measured and forecast are never dressed as each other, and a quantity that was not tested is not shown: fire has a map of where it tends to occur and a record of what burned, and no forecast amount. English and Portuguese carry equal weight. No em dashes. In Portuguese, no label followed by a colon.

Where someone did something, the sentence says who, and it is we: we trained a model, we tested it, we built it. No slogans in pairs of fragments. No small print: a line that explains what the reader can already see, or how something was computed, is cut. What stays small is a unit, a forecast's range, what a step of the key means, and the one sentence that says the enforcement figure is a floor and not proof of cause. The benchmark is called the benchmark, in both languages.

The band of the alert level holds the bars and the level's word and nothing else. Under a headline that states an area, the second line says it as a place the reader knows ("Twice Greater London."), from that language's own list of places, each sentence written out whole; no list for a language, no line. The forecast's range stays on the chart, as whiskers and in the hover.

## Colour

| Name | Value | Meaning |
|---|---|---|
| Forest green | `#0b6b3a` | Standing forest on the map, and the brand: the mark and whatever is chosen. |
| Clearing red | `#e4002b` | Clearing. On the map, the chance of clearing, in four reds built around this one. In the bulletin, the alert level and the clearing forecast. In the story, the one line that says a piece of the forest falls every year. |
| Mapped yellow | `#FFD400` | Clearing that was mapped in a replayed year, on the map and in its legend swatch. What happened is yellow, what is likely is red: the yellow reads on every red, on the forest green and on the cream of non-forest. From far, a block with any mapped clearing takes at least half the yellow, so single cells do not vanish. In the story it comes in over one second after the chances are up (at once under reduced motion). |
| Ink | `#10201a` | Type, rules, measured history. |
| Ground | `#f4f5f0` | The page. |
| Grey, line | `#55605a` `#c7cdc5` | Secondary type, hairlines. |
| Fire amber | `#f2a900` | Fire. |
| Degradation blue | `#2f7fe6` | Degradation and selective logging. |
| Mining violet | `#a738cf` | Mining. |
| Water, open land, cleared land | `#9cc4d4` `#d8d6b8` `#ece5d2` | The rest of the base map. Pale, so the forest reads as the green mass. |

### The clearing ramp

Every forest cell has a chance of losing at least a hectare in the year. The map paints it in five steps. Forest under 0.1% stays forest green. From 0.1% up every step is a red, so even a low chance reads as a stain on the forest: a dark, bruised red, a deep red, the clearing red, and a hotter red at the top.

| Chance | Colour | Lightness L* | Share of forest cells, 2027 |
|---|---|---|---|
| under 0.1% | `#0b6b3a` forest green | 39 | 73% |
| 0.1 to 1% | `#6a0f24` bruised red | 22 | 21% |
| 1 to 5% | `#ae0c2c` deep red | 37 | 4.7% |
| 5 to 20% | `#e4002b` clearing red | 48 | 1.6% |
| over 20% | `#ff5a40` hot red | 61 | 0.13% |

The four reds are one hue family (346° to 8°) and their lightness rises with the chance, so the order of the steps does not depend on telling red from green. Through a deuteranopia transform (Viénot, Brettel and Mollon 1999) the steps become four olive yellows of lightness 25, 41, 53 and 65 against a forest of 38, still in order, and their distance from the forest is ΔE 13, 19, 40 and 48. The weak point is known and stated: the lowest step separates from the forest by darkness alone, and for a protanope the clearing red sits close to the forest (ΔE 8), as the brand's red and green always have. Clearing mapped in a replayed year is `#FFD400`, lighter than every step (L* 86), so it separates from the reds and the forest by lightness alone.

The chances are very skewed, so three quarters of the forest stays green, the dark red spreads around the frontier and the two bright reds are rare. Seen from far, a block of cells takes the highest step that a fifth of its forest cells reach, which keeps a hot spot visible without letting one cell paint a whole block. Sectors use the same four reds for their classes of expected clearing, and the lowest class stays green.

The other hazards never share a map with clearing. Each climbs from near the forest green to its own most vivid tone, so on the green map brighter is more: fire `#708030` `#b0921e` `#ecaa08` `#ffd62e`, degradation `#24707c` `#2876b4` `#3888ec` `#8cc4ff`, mining `#5c5c80` `#8446ac` `#b03ad6` `#ec8cff`. Each also has a glyph (notched square, flame, bars, diamond), so it is told apart by shape as well as colour.

## Layout

The map is the page, edge to edge, and the Amazon is the object on it. Nothing has a frame: no border, no outline, no box of rules around the map, a panel or a control. What stands on the page is type, set with space around it, on a surface of the page's own colour that only shows once the map is moved under it. A surface that can stand over the map (the key with the mode switch, the dock, the list, the zoom controls) is a flat block of the page's colour with crisp edges, hugging its content: no fade, no glow, no shadow. Over the page it cannot be seen; when the map is moved under it, the map passes behind.

The left of the page is a column of type. At its top, what the map shows and how to read it: the mode, the kinds of sector and the key, whose steps are the filter. At its bottom, docked, the bulletin with its timeline: the hazards, the level, the headline and the histogram. The ranked list stands on the right, with its way out. The Amazon is fitted to its own outline beside them, never under them, with clear ground between its outline and the column. When the list opens or closes, the Amazon glides once to its new place; nothing else moves it. The header has the mark, the story, About, the API and the language, and nothing else.

The bulletin can come forward to fill the page. Its content keeps a measure of 1100 px in the middle and its plot a height that leaves the bars their proportion. The map is then a small picture of itself in the upper right corner: nothing in it answers the pointer, and a click on it swaps the two back. The swap is drawn, never cut. Every panel that opens has a clear way out. Every control sits on what it changes.

The priority list is bare rows: the rank, the place, a small tag where it lies in protected land (TI, UC), and the place's chance (the mean chance of its forest cells) as a whole percentage with a thin red bar of that length, under the one small word "chance". No paragraph above it. A place that is opened says why in one plain sentence, two at most. Beside the way out, the same list as a file.

On a phone the map is the screen. A band under the header says what it shows. One sheet stands at the bottom at a time. The bulletin rests there showing its level, its headline and its plot, and is pulled up to the header and pushed back. When the list is open it has the lower half, and the bulletin waits behind a small handle under it; closing the list brings it back. The two never overlap. The header is the mark and one menu. Type has a phone's own scale: the story's line 27 px, a headline 21, text 15.5, labels 12.5. The Amazon stands in the middle of what is free between the key and whatever stands at the bottom (the caption, the sheet at rest, the list), and a sheet at rest never rises above half of the screen. The story's caption is set at 24 px with the marks and a 48 px arrow in one row under it; the mode tabs are not there during the story, so the key sits right under the header. A panel on the stage uses the whole height: its X stands in the header's row, and in the story it has none. Edges are flat: no shadow and no gradient above the caption, the sheets or the menu.

### About, the model and the benchmark

The page has one stage, in the middle, and one thing holds it at a time. The map is its default occupant. When something else is called (the timeline, About, the API's instructions) the map leaves for the upper right corner, where it is a small picture of itself, the other thing enters and takes the stage whole, and when it is dismissed the map comes back. There are no side panels over a cropped map. The map travels as a picture of itself, so nothing is redrawn in sight. In the story the map leaves altogether while the model's panel has the stage, and returns with the priority list. The priority list and the sector ranking are the map's companions and stand beside it.

About takes the stage, as a column of text in the middle; on a phone it fills the screen under the header. Its way out stays at the top while the text passes under it, and Escape or the small map dismiss it too. It says what the site shows and who it is for, shows the model, says in two sentences what the model learned from and how it did on a year it had never seen, gives the benchmark and the way in, says that it gets things wrong, and names whose data it is. Nothing else.

The model is drawn as it works. Nine sources are nine sheets of the same territory, stacked, each with the Amazon's outline, a hint of what it holds, its name and who makes it. Traces fall from them into one point, the model, by its name, and leave it in red for the last sheet, which is the map of chance. Ink is what goes in; red is only what comes out. Small particles travel the traces, slowly. The figure is still when less motion is asked for, and it stops when it is off the screen.

The benchmark is the one table on the site: rank, model, score, the year kept apart, who sent it and when, to one decimal in the reader's number format. No stripes, no rules between rows, no box. The row with no model is said plainly and set in grey. Under it at most one short line, then one green button to submit a model and a quieter link to the code.

### The map in the reader's hands

The wheel and a pinch zoom, about the pointer, continuously: no steps between levels. The furthest out is the fit of the moment, the whole Amazon on the stage, never smaller. However the map is dragged, a good part of the Amazon stays in the part of the stage nothing covers. Above the zoom controls a third one goes back to the whole map, dimmed while that is the view. A cell answers the pointer in every layer: what the layer holds for it, in hectares or as a chance (for fire, the band of the forest it stands in, never an amount), then its municipality and state and the protected land it lies in; a click pins it, Escape lets it go. Sectors are painted by the km² expected in each, the figure the hover and the ranking give, so the order of the colours is the order of the ranking.

## The story

A first visit to the bare address is told what this is while the interface is put together around the map. The map is there from the first line and never leaves. While the Amazon is alone it is as large as it is in the tool with the list closed; when the priority list opens it glides once to its place beside it, and then stays. Each step brings in at most one piece of the tool, in the place it keeps. When the last line is read the caption goes away, and what is on the page is the tool. Skipping lands on that same page.

The caption is one line at a time, in the headline's face, in the left column, and nothing is written under it. This is the Amazon. So many squares of forest. Every year a piece of it falls, and that one line is set in the clearing red while the years of clearing are drawn, dark, one after another. What it adds up to. We trained a model to predict the next one: the red arrives and the key takes its place. We tested it on the past: a year that already happened is replayed. What it learns from: the panel opens on the model's figure. The code and the benchmark are open: the panel shows the table and the button, and closes when the reader goes on. For those who enforce, the places that come first: the list opens and the Amazon glides. The last three months and the next three: the timeline takes its dock.

The story scaffolds the tool in twelve steps. Each control arrives at the step that speaks of it, with the stage's enter motion, and stays: the key and the Cells tab with the model; the Sectors tab and the kinds (as a row) with the states on the map; the Priorities tab and the list; the timeline in its dock; at the last step the header's links and the zoom, with the map back on the cells and the whole Amazon. Until the story is over everything that has arrived is inert: no focus, no pointer, the default cursor, and no dimming. The mode row holds its final layout from the first tab on, so nothing shifts. Skip stands before the header's links. When the story ends only the caption leaves: no element appears, disappears or moves. Going back a step takes away the piece that step brought. On a phone the order is the same; at the last step the sheet rests where the tool has it and the caption lies over its foot. The model's panel and the priority list are never open at the same time. The way on and the way back are arrows, large enough to hit, named for a screen reader. Each line's numbers are read from the data files. It is one model, by its name, never two. The red spreads from where the chance is highest, outward, and that is the one orchestrated moment on the site. The story is remembered once finished or skipped, a link with a fragment never shows it, and the header plays it again. On a phone the caption is at the bottom, as tall as its line needs, with the way on at the thumb; About stands between the header and the caption; and the timeline, when it comes, takes the list's place.

## The mark

A forest green square with its corner coming away in red. It is the clearing glyph at the scale of the brand, and it does not change with the alert level.

## Type

Barlow Condensed and Barlow, one family drawn from highway signs and number plates. Condensed at weight 800 sets the wordmark, the level and the headline, because a warning is read from a distance. Regular width sets everything small, with tabular figures. Capitals are for the wordmark, the level and controls. The API panel is the one exception: it shows the instructions file for agents exactly as it is, in the reader's system monospace.

### Other languages and scripts

Every string is in `web/i18n/<code>.json`, one file a language, as whole sentences; `web/i18n/README.md` is the brief for translators. Numbers, percentages, dates and ordinals are written by the reader's locale. The language is the one in the address, else the reader's saved choice, else the country of the request, else the browser's, else English; the header lists every language by its own name.

Barlow is Latin only. Cyrillic uses the system's sans with a narrow face for headlines (Arial Narrow, Roboto Condensed). Arabic, Devanagari, Bengali, Chinese, Japanese and Korean use the system face of the script (SF Arabic or Geeza Pro, Kohinoor or Noto Sans Devanagari and Bengali, PingFang SC, Hiragino Sans, Apple SD Gothic Neo, with the Windows and Noto equivalents after them); no webfont is loaded for them. There a headline is the script's bold at a size a little under the Latin one, with a line height of 1.25, no tracking and no capitals: weight and size carry the warning where a condensed face does not exist. The wordmark stays in Barlow Condensed in every language.

Arabic runs right to left and the page is mirrored: the column of type on the right, the ranked list and the people of a land on the left, the small map in the upper left corner, the arrows of the story turned. Time on the charts still runs left to right, as dates do in Arabic-language charts; the map and the model's figure are not mirrored. Arabic keeps Latin digits.

### The people of an Indigenous land

When an Indigenous land is selected and there is an entry for it, its people take the timeline's place, in its dock (on a phone, in its sheet): a photograph, whole and never cropped to a face, with its author and licence under it as a link to the source (the one small line that is owed, a condition of the licence); then the people's name and two or three lines about them; other peoples of the same land as names that open; then the forecast for the land. The plot is away until the land is let go, by the X at the top or any other way. The dock is as tall as that needs and scrolls; it can be brought to the stage like the timeline. No photograph, no placeholder. There is no column for it beside the map.

Selecting a sector outlines it where it is; the map is never moved or zoomed to it (only a row of the priority list takes the map to its place). The outline lasts exactly as long as the selection: its X, Escape, a click on the empty map, another sector, another kind, another mode or a panel taking the stage all let it go.

## How urgency scales

The level is counted, never chosen. For the hazard and place on screen:

- its own last three months (what INPE's DETER measured) against the same months a year before: 10% up is 1 point, double is 2;
- for the whole Amazon, a strong El Niño (ONI of 1.5 or more) is 1 point;
- for a sector, the top 10% of its kind for forecast risk (or the top three) is 1 point, the top 2% (or first place) is 2.

| Points | Level | Red in the bulletin |
|---|---|---|
| 0 | Quiet | None. |
| 1 | Watch | The level word and one bar of the meter. |
| 2 | Warning | A full red band across the bulletin. |
| 3 or more | Alarm | The whole bulletin turns red. |

On the timeline, measured values are ink and the forecast is in the hazard's hue, hatched as bars or dashed as a line. Clearing opens on months, as bars, with the months ahead; the band over them marks the year being forecast, or the next three or six months when one of those is chosen. In the signals, red marks only what is rising for the place on screen. A replayed past year has no level: the alarm is about now.

### Avoided clearing

The actions view shows what measured enforcement accounts for. It has no level and no red: it looks back, and its news is good. Clearing measured is ink. Above it stands the clearing the model implies had enforcement stayed at its 2021 to 2022 level, in forest green `#0b6b3a`, hatched as bars or dashed as a line. Hatched or dashed because it is modelled, as a forecast is. Green because the gap between the two is forest left standing. The interval and the rule of the reference year are ink. The view says on the screen that it is a floor and an association, and how much of the fall it does not explain.

## Never

- Red for anything that is not clearing or the alert level. Green for anything that is not forest or the brand. Clearing that was avoided is forest, so it is green and never red.
- A level the data does not earn, in either direction.
- Fire in red, or a forecast amount of fire.
- The same tone for clearing that happened and clearing that is likely.
- Boxes that hold one number, accent bars beside text, card grids, footers, tables in the interface. The benchmark is the one table.
- The words placar, board or leaderboard on the screen. It is the benchmark.
- Small print that explains. A second line under the story's caption.
- A frame, a border or a box of rules around anything. A fade, a glow or a shadow at the edge of a surface.
- A control that sits away from what it changes.
- A second thing moving by itself on a screen. The story's red, the swap, the one glide when the list opens and the particles of the model figure are the motion there is.
- Paragraphs on the first screen. Depth is one click away.

## Kinds, Ranking and zoom

The kinds of sector stand under the modes. When the window has the height they are a list, one to a line; in a short window they are one row that never wraps, never under 13 px: its gaps tighten first, then it scrolls. With the people of a land in the dock the list stays and the photograph gives way. Ranking is not a mode and is never on the modes' row. It goes with the kinds, after the last one, in their size and colour, with a small list glyph before the word; on a phone it is the glyph alone at the end of the row. The people's dock stops 16 px or more under the panel, wherever the panel ends, and the photograph gets smaller, whole, before anything meets.

The wheel, the + and − and the double click zoom through one easing. A notch of a mouse wheel is half a level, a pixel of trackpad scroll 0.005 of a level, a trackpad pinch four times that. The zoom follows its target with a time constant of 75 ms about the point under the pointer; the layers are scaled during the gesture and drawn once when it settles. Nothing the wheel says is dropped.
