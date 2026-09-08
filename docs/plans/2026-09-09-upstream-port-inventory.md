# Upstream 2.1.3 → Fork Port Inventory

Base: fork `fde080d3` (`feat/port-upstream-2.1.3`)
Source: upstream `edb3df71` (2.1.3 + post-release fixes)
Divergence point: `a1c5350e` (2026-02-12)

190 upstream commits, 34 fork commits, 167 fork-touched files.

## The constraint

"Take every new feature and improvement" is not reachable as stated. 79 of the
190 commits are the architecture rewrite itself, or sit directly on top of it:

| Bucket | Count | What it is |
| --- | --- | --- |
| A — Drizzle / op-sqlite | 37 | The data layer rewrite and everything built on it |
| B — Nitro / native / Expo managed | 36 | Native modules, WorkManager, managed workflow |
| C — LegendList | 6 | List virtualization swap |
| D — Portable JS/TS | 111 | No architectural dependency |

Taking A+B+C means becoming upstream 2.1.3, which is the path that already
failed. Bucket D is the real port surface; A/B/C items worth having must be
*reimplemented* against the fork's expo-sqlite layer, not cherry-picked.

## Tier 1 — take wholesale (63 commits, no fork file touched)

No conflict with fork work. Includes 6 translation-sync commits worth taking as
a batch, plus roughly 25 substantive fixes:

`b680a077` gesture-handler Pressable in PluginListItem ·
`bbb2645a` clean reader preview content ·
`788f6ced` prevent table overflow, CSS cleanup ·
`3e1e2110` WebView address bar ·
`e9f6bdaa` menu styling + outside-tap dismissal ·
`58db0352` Metro reader asset middleware ·
`6d2a9f8e` slider flicker after release ·
`89cddf9e` discover row ripple ·
`138fdff2` duplicate WebView bottom insets ·
`cbe7d70e` collapsed TTS button interaction ·
`97be48df` migration review options ·
`9783c4d5` repository back navigation ·
`76106317` Midnight Dusk chip contrast ·
`e0c89cdd` + `51560195` skeleton loading colors ·
`67e01bc2` stats screen logic ·
`084dccca` chapter drawer read color ·
`5a0717d2` duplicate TTS text from nested formatting ·
`4b580c90` TTS speaking surrounding quotes ·
`7e20f7dc` max reader text size 20 → 50 ·
`158786cc` parseChapterNumber crash ·
`9bde3df7` novel screen empty state flash ·
`9b356ffd` client IDs + env generation ·
`c9358b3a` Android branding assets

The remainder are release/CI/docs commits with no runtime effect.

## Tier 2 — needs your call (48 commits touching fork-modified files)

Grouped by the fork area they collide with.

### Reader — collides with `874c46f7`, `6f00b7f8`, `4dc6e673`

The fork rewrote paged chapter transitions and reader reliability. Upstream
rewrote the same surface independently.

| Commit | Change | Collision |
| --- | --- | --- |
| `25c93afa` | restore saved chapter progress from db | `useChapter.ts` |
| `02b6b984` | prevent WebView reset on settings change | `WebViewReader.tsx` |
| `71da09ed` | current chapter search | `core.js`, `ReaderScreen`, `WebViewReader` |
| `f1dd4b77` | empty chapter reporting | `WebViewReader.tsx` |
| `6548e9a6` | paged reader layout + performance | `ReaderScreen.tsx` — **direct overlap with the fork's paged reader work** |
| `bd716117` | chapter drawer + WebView app bar | `ReaderScreen.tsx` |
| `0ed7d878` | white reader drawer seam | `ReaderScreen.tsx` |
| `93fe04c2` | reader controls + navigation polish | `ReaderScreen`, `ReaderBottomSheet`, `ReaderFooter` |
| `eb310f78` | empty chapter refresh | `WebViewReader`, `useChapter` |
| `e8c55502` | paragraph spacing regex | `core.js` |
| `54fedc2f` | TTS quote trimming | `core.js` |

### Library / bookshelf — collides with `a505bf41`, `46e1d45f`, `a4941535`, `e86348ad`

The fork's custom sorting, filtering, per-category persistence and nested
categories live here.

| Commit | Change | Collision |
| --- | --- | --- |
| `d02291c2` | remember last used library category | `LibraryContext`, `LibraryScreen`, `constants.ts` — **overlaps the fork's per-category sort persistence fix** |
| `c30441b9` | smart library update filters | `LibraryQueries`, `SettingsLibraryScreen` |
| `3d34658d` + `99c31d56` | MD3 tab indicators / borders | `LibraryScreen`, `LibraryBottomSheet` |
| `17c891e1` | bottom sheet UX standardization | `FilterBottomSheet` — **the fork added AutocompleteMulti + max selections here** |
| `a421177f` | category badge layout + drag reorder | `CategoriesScreen`, `CategoryCard` — **fork added subcategory UI here** |
| `732628c4` | date format + relative timestamps | `ChapterItem`, `NovelScreenList`, `HistoryScreen` |

### Novel screen — collides with `acf33e7b`, `165cf7c9`, `2d7acab4`, `714af47d`, `5905a901`

The fork's cover badge, info overlay, genre chips and latest-chapter timestamp.

| Commit | Change | Collision |
| --- | --- | --- |
| `a16ec876` | optimize covers, lists, chapter groups | `NovelCover`, `NovelList`, `ListView` — **all three are heavily forked** |
| `22a1efd1` | skeleton loading optimization | `NovelInfoHeader` |
| `eb12bdfd` | novel genre rendering crashes | `NovelInfoComponents` — fork changed genre rendering |
| `e75f4fba` | more novel statuses + icons | `plugins/types`, `NovelInfoHeader` |
| `15560b67` | plugin imageRequestInit headers on cover | `NovelInfoHeader` |
| `7083c51d` | selectedIds in chapter list extraData | `NovelScreenList` |
| `09652f99` | refetch library after category update | `NovelScreenButtonGroup` |

### Database queries — collides with `17b57360`, `996b1d32`, `4dac8b87`

| Commit | Change | Collision |
| --- | --- | --- |
| `f0693204` | next chapter selection logic | `ChapterQueries` |
| `2cd5a97e` | await db operations inside transactions | `CategoryQueries`, `ChapterQueries`, `NovelQueries`, `LibraryUpdateQueries` — **fork's `4dac8b87` solved the same class of problem differently** |
| `e4d7ba30` | safety level inside transaction | `db.ts` |
| `57eca11a` | pass library status through navigation | `ChapterQueries`, `types` |

### Settings / backup / trackers — collides with `138b151d`, `424cf1a7`, `16ce1d26`

| Commit | Change | Collision |
| --- | --- | --- |
| `5d996f13` | configurable download cooldown | `useSettings`, `downloadChapter` |
| `4a4208e3` | time-tracking toggle + inactivity timeout | `useSettings`, reader |
| `345d084e` | chapter numbers in EPUB titles | `useSettings` |
| `098782d6` | settings layout + theme selection | `SettingsLibraryScreen`, `SettingsTrackerScreen` |
| `5cf7e15d` | reader setting descriptions | `AccessibilityTab`, `NavigationTab` |
| `6a7e90c1` | advanced reader tabs + localization | `AdvancedTab` |
| `523aa90c` | novel covers in library backups | `backup/utils.ts` — **fork rewrote backup heavily** |
| `93bc5e5e` | missing MAL list entries | `myAnimeList` |
| `7ddd934c` | missing tracker client IDs | `aniList`, `myAnimeList` |
| `8f53550d` | restore tracker search requests | `TrackSearchDialog` |

### Misc UI

`65e86100` bottom nav shift → fade · `31cb4b99` bottom nav MD3 alignment
(both `BottomTabBar`/`BottomNavigator`, which the fork touched) ·
`0c854618` MD3 slider (`TTSTab`) · `44c8e54e` dynamic Material theme colors ·
`c0877a9b` ignorable app update notifications (`Main.tsx`) ·
`23f9b183` refresh updates screen on focus · `57b9d41b` ServiceManager
notification throttle — **fork's `be965ebd` rewrote this**.

## Tier 3 — reimplement, do not cherry-pick

Features worth having whose upstream implementation is bound to A/B/C:

| Feature | Upstream commit | Why it needs rework |
| --- | --- | --- |
| Scanlator filtering | `98a2a1d7` | Drizzle schema + query builder; column already on the device DB |
| Time tracking + stats | `89c43c1e`, `96fb52df` | Drizzle; `timeSpent` column already present |
| Repository enable/disable | `909504a7` | Drizzle; `enabled` column already present |
| Non-destructive backup restore | `93209abe` | Drizzle queries, but the fork already has related work |
| Parallel library updates | `79984542` | Native WorkManager scheduling |
| Per-plugin download limits | `648d2106` | Native task queues |
| Durable notifications | `ac1b2f5c` | Native |
| Automatic backup scheduling | `bfb12b04` | Native — **fork already has its own in `138b151d`/`424cf1a7`** |
| DNS over HTTPS | `4d982479` | Native |
| Nitro EPUB export | `4cb1890b` | Native module |
| URL search + intent opening | `77be5624` | Managed-workflow intent filters |
| Custom code settings page | `64707409` | Depends on managed workflow config |

Note the three columns upstream added that the fork's migration 010 already
preserves on disk (`scanlator`, `timeSpent`, `Repository.enabled`) — the data is
there, only the feature code is missing.

## Sequencing

1. Fix the pre-existing `pnpm type-check` failures on the fork base, so new
   breakage is distinguishable from old.
2. Tier 1 in batches by theme, with a type-check + test gate per batch.
3. Tier 2 one group at a time, confirming each collision.
4. Tier 3 by explicit priority, reimplemented against expo-sqlite.
