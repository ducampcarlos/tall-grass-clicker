#!/usr/bin/env bash
# Downloads the Gen 1-5 sprites into docs/assets/sprites/ from the PokeAPI sprites repository
# (a mirror of the Black & White animated sprites that pokemondb.net archives too).
# One request per file, a few at a time, skipping what is already there.
set -u
cd "$(dirname "$0")/.."
BASE=https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions
fetch() {
  kind=$1; id=$2
  case $kind in
    normal) url=$BASE/generation-v/black-white/animated/$id.gif; out=docs/assets/sprites/normal/$id.gif ;;
    shiny)  url=$BASE/generation-v/black-white/animated/shiny/$id.gif; out=docs/assets/sprites/shiny/$id.gif ;;
    icon)   url=$BASE/generation-vii/icons/$id.png; out=docs/assets/sprites/icon/$id.png ;;
  esac
  [ -s "$out" ] && return 0
  for try in 1 2 3 4; do
    code=$(curl -s -m 40 -o "$out.part" -w "%{http_code}" "$url")
    if [ "$code" = 200 ] && [ -s "$out.part" ]; then mv "$out.part" "$out"; return 0; fi
    rm -f "$out.part"; sleep $((try * 2))
  done
  echo "FAILED $kind $id" >&2
}
export -f fetch; export BASE
for kind in icon normal shiny; do seq 1 649 | xargs -P 6 -I{} bash -c "fetch $kind {}"; done
echo done
