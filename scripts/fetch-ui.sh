#!/usr/bin/env bash
# Downloads the small item icons and gym badges the interface uses into docs/assets/items/ and
# docs/assets/badges/, from the PokeAPI sprites repository (see docs/assets/sprites/NOTICE.md).
set -u
cd "$(dirname "$0")/.."
BASE=https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites
ITEMS="poke-ball great-ball ultra-ball master-ball rare-candy mystery-egg shiny-charm oval-charm exp-share lucky-egg amulet-coin nugget
potion super-potion scope-lens muscle-band power-weight honey max-repel town-map coin-case old-rod revive magnet fire-stone moon-stone
poke-doll escape-rope protein hp-up focus-band choice-band macho-brace lucky-punch soothe-bell bicycle leftovers pp-up everstone dragon-fang
silk-scarf bottle-cap gold-bottle-cap net-ball luxury-ball lure-ball old-amber
stardust star-piece comet-shard relic-gold tiny-mushroom big-mushroom balm-mushroom oran-berry sitrus-berry lum-berry
x-attack x-sp-atk dire-hit bright-powder silver-powder zoom-lens charcoal heat-rock flame-orb premier-ball silph-scope poke-flute berry-pouch big-nugget hard-stone"
BADGES="1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 32 33 34 35 36 37 38 39 40"
get() { url=$1; out=$2; [ -s "$out" ] && return 0
  code=$(curl -s -m 40 -o "$out.part" -w "%{http_code}" "$url")
  if [ "$code" = 200 ] && [ -s "$out.part" ]; then mv "$out.part" "$out"; else rm -f "$out.part"; echo "FAILED $url" >&2; fi; }
for i in $ITEMS; do get "$BASE/items/$i.png" "docs/assets/items/$i.png"; done
for i in $BADGES; do get "$BASE/badges/$i.png" "docs/assets/badges/$i.png"; done
echo done
