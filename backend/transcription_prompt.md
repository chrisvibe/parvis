# Transcribing a photographed grid

Give this to whatever reads the photograph. It describes the grid as arithmetic
and nothing else — no game, no cards, no scoring — because everything the
transcriber has to decide can be decided from the numbers, and a narrative about
what the numbers are for only invites it to reason about the subject instead of
reading the digits.

The output it produces is what `POST /games/import` accepts. The format is
specified in `game_csv.py`; this file is the instruction, and the two have to be
changed together.

---

You are transcribing a photograph of a hand-filled grid into CSV. Output the CSV
and nothing else, optionally followed by a `Notes:` section.

## The grid

Rows are numbered 1, 2, 3 … down the left-hand side. Each column has a name
written at the top. Every square holds a small whole number written by hand, or
is empty. Along the bottom there is one more row holding a single number per
column.

Some numbers have a line or a cross drawn through the digits. That mark is part
of the reading and must be transcribed.

## What to write

    # parvis game
    #date: 2026-07-14
    #location: hytta
    Round,Carina,Rasmus,Elise,Rosanna
    1,10,1-,10,0-
    2,0-,12,2-,0-
    Total,40,42,71,35

1. One CSV column per column of the grid, left to right, in that order. Never
   sort or rearrange them — the order carries meaning.
2. In each square, write the number exactly as it appears. If a line or cross is
   drawn through the digits, put a `-` immediately after the number: `12` is a
   plain twelve, `12-` is a twelve with a line through it.
3. If a square is empty, or you cannot read what is in it, leave it empty. Never
   write `0` for a square you could not read. `0` is a value that occurs in this
   grid and means something specific, so guessing it destroys information.
4. A dot or a small mark in the **top left corner** of a square is not part of
   the number and is not a strike. Ignore it entirely. A strike is drawn across
   the digits themselves.
5. Copy the bottom row as `Total,` followed by its numbers. Transcribe what is
   written there. Do not compute it, and do not change it to agree with the
   columns above it.
6. Write `#date:`, `#location:` or `#notes:` lines only for information actually
   written on the sheet. Leave out what is not there. If the grid is ruled for
   more rows than are filled in, add `#rounds: N` with the number it is ruled
   for.
7. Do not invent a column name. If a heading is unreadable, write your best
   reading of it and say so under `Notes:`.

## Arithmetic you can check your reading against

Write `r` for the row number. These hold for every correctly-read grid, so a
reading that breaks one is a reading to look at again — but **report it, do not
repair it**. Leave the squares as you actually see them and list what does not
add up under `Notes:`.

1. **Range.** A number in row `r` is either at most `r`, or between 10 and
   `10 + r`. Nothing else can appear. A number over `10 + r` is a misread digit.
2. **Strikes.** A struck number is always at most `r`. A number of 10 or more is
   never struck. If you read a struck 15 in row 5, either the strike is not
   really there or the digits are wrong.
3. **Column totals.** A square counts towards its column's total only if it is
   10 or more and not struck through, and then it counts its own full value.
   Everything else counts zero. Each column must add up to the number written at
   the bottom of it. A column that is out by exactly one square's value tells you
   which square to look at again.
4. **Row limit.** In row `r`, take every square that counts towards its total,
   subtract 10 from each, and add those up. The result cannot exceed `r`. This
   catches a strike that failed to register, which the column totals will not.

## What to do when the checks fail

Nothing, except say so. The importer runs all four of these again on the other
side and reports them to a person who has the paper in front of them. A
transcription that is honestly wrong is fixable; one that has been quietly
adjusted until the arithmetic works is not.
