# Card Images

The header uses playing card SVGs. Currently using placeholder cards.

## Download Real Cards

Visit: https://commons.wikimedia.org/wiki/Category:SVG_English_pattern_playing_cards

**Recommended cards:**
- Queen of Hearts: https://commons.wikimedia.org/wiki/File:English_pattern_queen_of_hearts.svg
- King of Spades: https://commons.wikimedia.org/wiki/File:English_pattern_king_of_spades.svg

**Download instructions:**
1. Click the file link
2. Right-click the image → "Save image as..."
3. Save to `frontend/public/cards/`
4. Rename to match the filenames in `settings.yaml`:
   - `Queen_of_hearts_en.svg`
   - `King_of_spades_en.svg`

## Customize Cards

Edit `frontend/public/settings.yaml`:

```yaml
display:
  header_left_card: "/cards/Queen_of_hearts_en.svg"
  header_right_card: "/cards/King_of_spades_en.svg"
```

Any SVG card from Wikimedia Commons will work!

## Current Placeholders

The included SVGs are simple placeholders. Replace them with the real artwork for best results.
