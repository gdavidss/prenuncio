# Prenúncio brand guidelines

Prenúncio is the sign before the event: an early warning for the Brazilian Amazon. It says where forest will be cleared, burned, degraded or mined next, and how hard the pressure is now. It is built to help decide where to act.

**Green is forest. Red is clearing.** Everything else follows from that.

## Voice

Number first, then the fact, then stop. Quantities are named for what happened to the forest (km² cleared, burned, degraded, mined), never for the instrument that saw it. One short sentence per idea, present tense, no adjectives, no reassurance, no exclamation marks. Measured and forecast are never dressed as each other, and a quantity that was not tested is not shown: fire has a map of where it tends to occur and a record of what burned, and no forecast amount. English and Portuguese carry equal weight. No em dashes. In Portuguese, no label followed by a colon.

## Colour

| Name | Value | Meaning |
|---|---|---|
| Forest green | `#0b6b3a` | Standing forest on the map, and the brand: the mark and whatever is chosen. |
| Clearing red | `#e4002b` | Clearing. On the map, the chance of clearing, in four reds built around this one. In the bulletin, the alert level and the clearing forecast. |
| Mapped dark | `#141414` | Clearing that was mapped in a replayed year. What happened is dark, what is likely is red, and the two are never the same tone. |
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

The four reds are one hue family (346° to 8°) and their lightness rises with the chance, so the order of the steps does not depend on telling red from green. Through a deuteranopia transform (Viénot, Brettel and Mollon 1999) the steps become four olive yellows of lightness 25, 41, 53 and 65 against a forest of 38, still in order, and their distance from the forest is ΔE 13, 19, 40 and 48. The weak point is known and stated: the lowest step separates from the forest by darkness alone, and for a protanope the clearing red sits close to the forest (ΔE 8), as the brand's red and green always have. Clearing mapped in a replayed year stays `#141414`, darker than every step (L* 6).

The chances are very skewed, so three quarters of the forest stays green, the dark red spreads around the frontier and the two bright reds are rare. Seen from far, a block of cells takes the highest step that a fifth of its forest cells reach, which keeps a hot spot visible without letting one cell paint a whole block. Sectors use the same four reds for their classes of expected clearing, and the lowest class stays green.

The other hazards never share a map with clearing. Each climbs from near the forest green to its own most vivid tone, so on the green map brighter is more: fire `#708030` `#b0921e` `#ecaa08` `#ffd62e`, degradation `#24707c` `#2876b4` `#3888ec` `#8cc4ff`, mining `#5c5c80` `#8446ac` `#b03ad6` `#ec8cff`. Each also has a glyph (notched square, flame, bars, diamond), so it is told apart by shape as well as colour.

## Layout

The map is the page, edge to edge, and the Amazon is the object on it. Nothing has a frame: no border, no outline, no box of rules around the map, a panel or a control. What stands on the page is type, set with space around it, on a surface of the page's own colour that only shows once the map is moved under it.

The left of the page is a column of type. At its top, what the map shows and how to read it: the mode, the kinds of sector, the key (whose steps are the filter) and the count of cells. At its bottom, docked, the bulletin with its timeline: the hazards, the level, the headline and the histogram. The ranked list stands on the right, with its way out. The Amazon is fitted to its own outline between them and never under them. When the list opens or closes, the Amazon glides once to its new place; nothing else moves it. The header has the mark, the story, About, the API and the language, and nothing else.

The bulletin can come forward to fill the page, and then the map is a small picture of itself in the lower right corner; a click on it swaps them back. The swap is drawn, never cut. Every panel that opens has a clear way out. Every control sits on what it changes.

On a phone the map is the screen. A band under the header says what it shows. The bulletin is a sheet at the bottom that shows its top and is pulled up to the header and pushed back. The list is a sheet too. The header is the mark and one menu.

### About, the model and the open board

About is a panel on the right of the page, and the whole screen on a phone. Its way out stays at the top while the text passes under it.

The model is drawn as it works. Nine sources are nine sheets of the same territory, stacked, each with the Amazon's outline, a hint of what it holds, its name and who makes it. Traces fall from them into one point, the model, by its name, and leave it in red for the last sheet, which is the map of chance. Ink is what goes in; red is only what comes out. Small particles travel the traces, slowly. The figure is still when less motion is asked for, and it stops when it is off the screen.

The open board is the one table on the site: rank, model, score, the year kept apart, who sent it and when, to one decimal in the reader's number format. No stripes, no rules between rows, no box. The row with no model is said plainly and set in grey. Under the board, one green button to submit a model, and a quieter link to the code.

## The story

A first visit to the bare address is told what this is while the interface is put together around the map. The map is there from the first line and never leaves. While the Amazon is alone it is as large as it is in the tool with the list closed; when the priority list opens it glides once to its place beside it, and then stays. Each step brings in at most one piece of the tool, in the place it keeps: the key, the priority list, About, the timeline in its dock. When the last line is read the caption goes away, and what is on the page is the tool. Skipping lands on that same page.

The caption is one line at a time, in the headline's face, in the left column. Forest. Loss, year by year, in the mapped dark, and what it adds up to. The chance of loss arriving in red, and the places that come first. One year that already happened, as proof. The model and the open board. What lies ahead.

Each line is a sentence that could stand alone, and its numbers are read from the data files. It is one model, by its name, never two. The red spreads from where the chance is highest, outward, and that is the one orchestrated moment on the site. On a phone the caption is at the bottom, as tall as its line needs, with the way on at the thumb, and About stands between the header and the caption. The story is remembered once finished or skipped, a link with a fragment never shows it, and the header plays it again.

## The mark

A forest green square with its corner coming away in red. It is the clearing glyph at the scale of the brand, and it does not change with the alert level.

## Type

Barlow Condensed and Barlow, one family drawn from highway signs and number plates. Condensed at weight 800 sets the wordmark, the level and the headline, because a warning is read from a distance. Regular width sets everything small, with tabular figures. Capitals are for the wordmark, the level and controls. The API panel is the one exception: it shows the instructions file for agents exactly as it is, in the reader's system monospace.

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
- Boxes that hold one number, accent bars beside text, card grids, footers, tables in the interface. The open board is the one table.
- A frame, a border or a box of rules around anything.
- A control that sits away from what it changes.
- A second thing moving by itself on a screen. The story's red, the swap, the one glide when the list opens and the particles of the model figure are the motion there is.
- Paragraphs on the first screen. Depth is one click away.
