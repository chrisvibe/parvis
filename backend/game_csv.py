"""
A game as the table people draw on paper.

Some games are played away from the app, on a sheet of paper, and typing the
sheet back in by hand is the part nobody wants to do. This module is the file
format that sits between the two: a grid with one row per round and one column
per player, which is the shape of the paper, so a transcription — by a person
or by machine vision reading a photograph — is a straight copy rather than a
translation.

    # parvis game
    #date: 2026-07-14
    #location: hytta
    Round,Carina,Rasmus,Elise,Rosanna
    1,10,1-,10,0-
    2,0-,12,2-,0-
    Total,40,42,71,35

A cell is the number as it stands in that square on the paper, which is not
quite the bid. A bid that is made gets a 1 written in front of it — bid 5
becomes 15 — so the square ends up holding the score, ten and the bid. A bid
that goes down is struck through and keeps its original number, which scores
nothing. So:

    15      bid five, made it            (15 points)
    5-      bid five, went down          (0 points)
    10      bid nothing, made it         (10 points)
    (empty) nothing recorded             (no round row at all)

Writing what is in the square rather than what it means is the whole point.
Transcribing this sheet is then copying digits, with no step where anybody has
to decide what a mark meant, and the totals row along the bottom becomes a
plain sum of the column — the same addition the players did by hand, checkable
against the same numbers.

The strike-through is carried as a trailing marker (`-`, `x`, `/`, `*`) and is
mostly redundant, which is exactly what makes it useful: a struck square should
hold a bare bid and an unstruck one should hold a score, so the two disagreeing
is a transcription error nothing else would have caught.

Redundant, but not always. Made squares hold 10..10+N and struck squares hold
0..N, so from round ten onwards the two ranges overlap and a bare number in
10..N could be either — in a ten-round game exactly one value, a square reading
10, which is a made bid of nothing or a struck bid of ten. The marker settles
it; without one the square is read as made, since that is what unstruck means,
and the reading is reported.

Blank is not zero. Zero is a real bid, worth ten points if it holds; blank is a
round nobody has filled in yet. A format that wrote both as `0` could not carry
a half-finished sheet, and could not tell a round the camera failed to read
from a round of four players all bidding nothing.

Three checks run over whatever is parsed, because the expected producer of
these files is a vision model and its mistakes are quiet ones — a digit
misread, a strike-through missed, a row shifted by one column all yield a file
that parses perfectly and describes a game that never happened:

  * a square's number and its strike-through have to agree;
  * the bids that succeeded in round N cannot add up to more than N, since
    round N deals N cards and there are only N tricks to win;
  * the totals row, if the sheet has one, has to match what the rounds add up
    to — and when it does not, the round whose square would account for the
    difference is named, since that is usually the one that was misread.

None of these can be checked by whatever produced the file, which is exactly
why they belong here.

The module is deliberately free of database and HTTP: text in, a description of
a game out, and the service layer decides what to do about it.
"""

from __future__ import annotations

import csv
import io
import re
from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, List, Optional, Sequence

from constants import SUCCESSFUL_BET_BASE_SCORE as BASE_SCORE
from utils.scoring import calculate_score

# What a struck-through bet looks like once it is typed. Several, because on
# the paper it is a cross or a slash drawn over the number and a transcriber
# reaches for whichever of these is nearest; rejecting the file over the choice
# would be pedantry.
MISS_MARKERS = "-xX*/✗✘"

# What this module writes. One of the above, chosen for surviving a round trip
# through a spreadsheet without being turned into anything else.
MISS_MARKER = "-"

# The label in the first column that means "this row is the running totals
# written along the bottom of the sheet", rather than a round.
TOTAL_LABELS = {"total", "totals", "sum", "score", "scores"}

# Preamble keys, and the field each one sets. `type` and `game_type` are both
# accepted because the API calls it one thing and a person writing the file by
# hand will reach for the other.
META_KEYS = {
    "date": "date",
    "location": "location",
    "place": "location",
    "type": "game_type",
    "game_type": "game_type",
    "notes": "notes",
    "rounds": "total_rounds",
    "total_rounds": "total_rounds",
}

_CELL = re.compile(rf"^(\d+)\s*([{re.escape(MISS_MARKERS)}]?)$")


class CsvFormatError(ValueError):
    """
    A file that cannot be read as a game.

    Carries every problem found rather than only the first, because the caller
    is usually looking at machine output and wants to know everything that is
    wrong with it in one pass.
    """

    def __init__(self, problems: Sequence[str]):
        self.problems = list(problems)
        super().__init__("; ".join(self.problems))


@dataclass(frozen=True)
class Cell:
    """One player's bid in one round, and whether it held."""

    round_number: int
    seat: int
    bet: int
    success: bool

    @property
    def score(self) -> int:
        return calculate_score(self.bet, self.success)


@dataclass
class ParsedGame:
    """Everything a file says, before anyone checks it against the database."""

    aliases: List[str] = field(default_factory=list)
    cells: List[Cell] = field(default_factory=list)
    total_rounds: int = 0
    date: Optional[datetime] = None
    location: Optional[str] = None
    game_type: Optional[str] = None
    notes: Optional[str] = None
    # The totals row as written on the sheet, if it had one. Kept separately
    # from the computed totals on purpose — the whole value of the row is in
    # the two disagreeing.
    stated_totals: Optional[List[int]] = None
    # True when the file used the older `Name_bets`/`Name_mask` columns, where
    # the bid and the outcome are written separately and so no square can be
    # read two ways. Worth knowing, because the check for squares that could be
    # is meaningless against a file in that layout.
    paired_layout: bool = False
    warnings: List[str] = field(default_factory=list)

    @property
    def totals(self) -> List[int]:
        """What the rounds actually add up to, per seat."""
        running = [0] * len(self.aliases)
        for cell in self.cells:
            running[cell.seat] += cell.score
        return running

    @property
    def last_round_with_data(self) -> int:
        return max((c.round_number for c in self.cells), default=1)


# ---------------------------------------------------------------------------
# Reading
# ---------------------------------------------------------------------------


def parse_game_csv(text: str) -> ParsedGame:
    """
    Read a game out of the CSV described at the top of this module.

    Raises:
        CsvFormatError: listing everything wrong with the file. Problems that
            make the file unreadable at all (no header, a row longer than the
            header) stop the parse; problems within a cell that parsed (a bid
            larger than the round) are collected so the whole file is reported
            on at once.
    """
    problems: List[str] = []
    meta, body = _split_preamble(text, problems)

    header_line, header = _find_header(body, problems)
    aliases, read_row, paired = _read_header(header, header_line, problems)

    cells: List[Cell] = []
    stated_totals: Optional[List[int]] = None
    seen_rounds: Dict[int, int] = {}

    for line_number, row in body:
        if line_number <= header_line or not any(value.strip() for value in row):
            continue

        label = row[0].strip()

        if label.lower() in TOTAL_LABELS:
            stated_totals = _read_totals(row, aliases, line_number, problems)
            continue

        round_number = _read_round_number(label, line_number, problems)
        if round_number is None:
            continue

        if round_number in seen_rounds:
            problems.append(
                f"line {line_number}: round {round_number} appears twice "
                f"(already on line {seen_rounds[round_number]})"
            )
            continue
        seen_rounds[round_number] = line_number

        cells.extend(read_row(row, round_number, line_number, problems))

    if problems:
        raise CsvFormatError(problems)

    game = ParsedGame(
        aliases=aliases,
        cells=cells,
        stated_totals=stated_totals,
        paired_layout=paired,
        date=meta.get("date"),
        location=meta.get("location"),
        game_type=meta.get("game_type"),
        notes=meta.get("notes"),
    )
    game.total_rounds = _settle_total_rounds(game, meta.get("total_rounds"), problems)

    if problems:
        raise CsvFormatError(problems)

    game.warnings = _arithmetic_warnings(game)
    return game


def _split_preamble(text: str, problems: List[str]):
    """
    Separate the `#key: value` lines at the top from the table below them.

    Returns the metadata and the remaining lines paired with their line numbers,
    so anything reported later can point at a line of the original file.

    A `#` line that is not `key: value` is a comment and ignored, which is what
    makes the `# parvis game` banner legal. Trailing commas are stripped first:
    a file that has been opened and saved by a spreadsheet comes back with the
    preamble padded out to the width of the table.
    """
    meta: Dict[str, object] = {}
    body = []

    for line_number, raw in enumerate(text.splitlines(), start=1):
        line = raw.strip()
        if not line:
            continue

        if not line.startswith("#"):
            body.append((line_number, raw))
            continue

        entry = line.lstrip("#").rstrip(",").strip()
        if ":" not in entry:
            continue

        key, _, value = entry.partition(":")
        key = key.strip().lower()
        value = value.strip().rstrip(",").strip()

        if key not in META_KEYS:
            problems.append(f"line {line_number}: unknown setting '{key}'")
            continue
        if not value:
            continue

        field_name = META_KEYS[key]
        if field_name == "date":
            meta["date"] = _read_date(value, line_number, problems)
        elif field_name == "total_rounds":
            meta["total_rounds"] = _read_positive_int(value, line_number, problems)
        else:
            meta[field_name] = value

    # csv.reader over a list of lines, not the whole text, so line numbers stay
    # attached. A quoted field containing a newline would defeat that, but the
    # table is numbers and the preamble is not CSV at all.
    rows = []
    for (line_number, raw), row in zip(body, csv.reader(line for _, line in body)):
        rows.append((line_number, row))
    return meta, rows


def _read_date(value: str, line_number: int, problems: List[str]) -> Optional[datetime]:
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        problems.append(
            f"line {line_number}: '{value}' is not a date. "
            f"Write it as 2026-07-14, or 2026-07-14T20:30 to include the time."
        )
        return None


def _read_positive_int(value: str, line_number: int, problems: List[str]) -> Optional[int]:
    if value.isdigit() and int(value) > 0:
        return int(value)
    problems.append(f"line {line_number}: '{value}' is not a number of rounds")
    return None


def _find_header(body, problems: List[str]):
    """The first row of the table, which names the players."""
    for line_number, row in body:
        if any(value.strip() for value in row):
            return line_number, row

    raise CsvFormatError(problems + ["there is no table here, only settings"])


def _read_header(header, line_number: int, problems: List[str]):
    """
    Work out who the columns belong to, and how to read a row of them.

    Two layouts are understood. The one this module writes has a column per
    player; the other has a pair per player, `Name_bets` and `Name_mask`, which
    is what an earlier transcription prompt produced. Accepting both costs
    little and means a file that already exists does not have to be redone.
    """
    if not header or header[0].strip().lower() != "round":
        problems.append(
            f"line {line_number}: the table has to start with a Round column, "
            f"not '{header[0].strip() if header else ''}'"
        )
        raise CsvFormatError(problems)

    columns = [value.strip() for value in header[1:]]
    while columns and not columns[-1]:
        columns.pop()

    if not columns:
        problems.append(f"line {line_number}: no players in the header row")
        raise CsvFormatError(problems)

    paired = any(c.lower().endswith("_bets") for c in columns)
    aliases, reader = (
        _read_paired_header(columns, line_number, problems)
        if paired
        else (columns, _row_reader_single(len(columns)))
    )

    duplicates = {a.lower() for a in aliases if
                  sum(1 for b in aliases if b.lower() == a.lower()) > 1}
    if duplicates:
        problems.append(
            f"line {line_number}: the same player has two columns: "
            + ", ".join(sorted(duplicates))
        )
    if any(not a for a in aliases):
        problems.append(f"line {line_number}: a player column has no name")

    if problems:
        raise CsvFormatError(problems)

    return aliases, reader, paired


def _read_paired_header(columns, line_number: int, problems: List[str]):
    """`Name_bets,Name_mask` pairs — the older transcription layout."""
    if len(columns) % 2:
        problems.append(
            f"line {line_number}: paired columns must come in twos "
            f"(Name_bets then Name_mask), but there are {len(columns)}"
        )
        raise CsvFormatError(problems)

    aliases = []
    for index in range(0, len(columns), 2):
        bets, mask = columns[index], columns[index + 1]
        if not bets.lower().endswith("_bets") or not mask.lower().endswith("_mask"):
            problems.append(
                f"line {line_number}: expected a '_bets' and a '_mask' column, "
                f"found '{bets}' and '{mask}'"
            )
            raise CsvFormatError(problems)

        alias, other = bets[: -len("_bets")], mask[: -len("_mask")]
        if alias.lower() != other.lower():
            problems.append(
                f"line {line_number}: '{bets}' and '{mask}' are not the same player"
            )
        aliases.append(alias)

    return aliases, _row_reader_paired(len(columns))


def _row_reader_single(width: int):
    """Read a row of one-cell-per-player, e.g. `5,0-,,3`."""

    def read(row, round_number, line_number, problems):
        cells = []
        for seat, raw in enumerate(_align(row, width, line_number, problems)):
            parsed = _read_cell(raw, round_number, seat, line_number, problems)
            if parsed:
                cells.append(parsed)
        return cells

    return read


def _row_reader_paired(width: int):
    """Read a row of bet/mask pairs, e.g. `5,1,0,0,,,3,1`."""

    def read(row, round_number, line_number, problems):
        fields = _align(row, width, line_number, problems)
        cells = []
        for seat, index in enumerate(range(0, width, 2)):
            bet_field, mask_field = fields[index].strip(), fields[index + 1].strip()
            if not bet_field:
                # No bid means no cell, whatever the mask column says. A mask
                # beside an empty bet is a transcription artefact, not a round
                # somebody played.
                continue

            parsed = _read_pair(bet_field, mask_field, round_number, seat,
                                line_number, problems)
            if parsed:
                cells.append(parsed)
        return cells

    return read


def _mask_means_success(mask: str) -> bool:
    """
    An unwritten mask is a made bet.

    The paper only marks failure, so a blank is the common case rather than
    missing information.
    """
    return mask.strip().lower() not in {"0", "false", "no", "n", "f"}


def _align(row, width: int, line_number: int, problems: List[str]) -> List[str]:
    """
    Line a row up with the header.

    Short rows are padded — trailing blanks are routinely dropped, by hand and
    by spreadsheets alike, and a round nobody has filled in from the third
    player on is legal. Long rows are refused, because an extra field means the
    row is offset from the header and every value in it belongs to the wrong
    person. That is the failure that looks like a working import.
    """
    fields = row[1:]
    while len(fields) > width and not fields[-1].strip():
        fields.pop()

    if len(fields) > width:
        problems.append(
            f"line {line_number}: {len(fields)} values for {width} columns — "
            f"the row does not line up with the header"
        )
        return (fields + [""] * width)[:width]

    return fields + [""] * (width - len(fields))


def _read_cell(raw: str, round_number: int, seat: int, line_number: int,
               problems: List[str]) -> Optional[Cell]:
    """
    One square of the sheet: the number standing in it, and any strike.

    The number is the score where the bid was made and the bid itself where it
    was not, so reading it back is a question of which of the two a number
    could be in this round. Usually only one. Where both are possible — a bare
    number in 10..N, from round ten onwards — an unstruck square is read as
    made, because that is what unstruck means, and _arithmetic_warnings reports
    that it had to choose.

    A lone marker is an empty square rather than an error: it is how the app
    itself draws a round nobody has entered, so anybody copying from the screen
    will write it.
    """
    value = raw.strip()
    if not value or (len(value) == 1 and value in MISS_MARKERS):
        return None

    match = _CELL.match(value)
    if not match:
        problems.append(
            f"line {line_number}, column {seat + 2}: cannot read '{value}'. "
            f"A square holds the number written in it, with {MISS_MARKER} after "
            f"it if the bid was struck through."
        )
        return None

    written, struck = int(match.group(1)), bool(match.group(2))

    could_be_a_bid = written <= round_number
    could_be_a_score = (written >= BASE_SCORE
                        and written - BASE_SCORE <= round_number)

    if struck:
        # The strike says this is a bid that went down, so the number has to be
        # one the round could hold. When it is not, the square and the mark
        # over it disagree, and that is worth stopping for.
        if not could_be_a_bid:
            problems.append(
                f"line {line_number}, column {seat + 2}: '{value}' is struck "
                f"through, so {written} should be a bid — but round "
                f"{round_number} only deals {round_number}"
            )
            return None
        return Cell(round_number=round_number, seat=seat, bet=written,
                    success=False)

    if could_be_a_score:
        return Cell(round_number=round_number, seat=seat,
                    bet=written - BASE_SCORE, success=True)

    if could_be_a_bid:
        # Standing alone with no ten in front of it, so it went down — whether
        # or not the strike over it made it into the transcription.
        return Cell(round_number=round_number, seat=seat, bet=written,
                    success=False)

    problems.append(
        f"line {line_number}, column {seat + 2}: {written} cannot stand in "
        f"round {round_number} — too big for a bid (at most {round_number}) "
        f"and too big for a score (at most {BASE_SCORE + round_number})"
    )
    return None


def _read_pair(bet_field: str, mask_field: str, round_number: int, seat: int,
               line_number: int, problems: List[str]) -> Optional[Cell]:
    """
    One player's bid and outcome from the older two-column layout.

    Kept apart from _read_cell because the two mean different things by the
    same digits: here the number is always the bid, never the score.
    """
    if not bet_field.isdigit():
        problems.append(
            f"line {line_number}, column {seat * 2 + 2}: "
            f"cannot read '{bet_field}' as a bid"
        )
        return None

    bet = int(bet_field)
    if bet > round_number:
        problems.append(
            f"line {line_number}, column {seat * 2 + 2}: a bid of {bet} in "
            f"round {round_number}, which only deals {round_number}"
        )
        return None

    return Cell(round_number=round_number, seat=seat, bet=bet,
                success=_mask_means_success(mask_field))


def _read_round_number(label: str, line_number: int, problems: List[str]) -> Optional[int]:
    if label.isdigit() and int(label) > 0:
        return int(label)
    problems.append(
        f"line {line_number}: '{label}' is neither a round number nor a totals row"
    )
    return None


def _read_totals(row, aliases, line_number: int, problems: List[str]) -> Optional[List[int]]:
    fields = _align(row, len(aliases), line_number, problems)
    totals = []
    for seat, raw in enumerate(fields):
        value = raw.strip()
        if not value:
            # A sheet with the totals only partly written is still worth
            # checking as far as it goes.
            totals.append(None)
        elif value.lstrip("-").isdigit():
            totals.append(int(value))
        else:
            problems.append(
                f"line {line_number}, column {seat + 2}: '{value}' is not a total"
            )
            totals.append(None)
    return totals


def _settle_total_rounds(game: ParsedGame, stated: Optional[int],
                         problems: List[str]) -> int:
    """
    How long the game was.

    Taken from the table unless the file says otherwise, which it needs to when
    a sheet is half filled in: ten rounds were planned, four have been played,
    and the table only reaches four.
    """
    played = game.last_round_with_data
    if stated is None:
        return played
    if stated < played:
        problems.append(
            f"the file says {stated} rounds but the table reaches round {played}"
        )
    return stated


def _arithmetic_warnings(game: ParsedGame) -> List[str]:
    """
    What the numbers say about each other.

    None of this can be checked by whoever transcribed the sheet — the first
    needs the rules of the game, and the rest need the arithmetic done
    independently of the hand that wrote it — so a file can be perfectly formed
    and still fail all of them.
    """
    warnings: List[str] = []
    computed = game.totals
    stated = list(game.stated_totals or []) + [None] * len(game.aliases)

    by_round: Dict[int, List[Cell]] = {}
    for cell in game.cells:
        by_round.setdefault(cell.round_number, []).append(cell)

    for round_number in sorted(by_round):
        won = [c for c in by_round[round_number] if c.success]
        claimed = sum(c.bet for c in won)
        if claimed > round_number:
            who = ", ".join(
                f"{game.aliases[c.seat]} {c.bet}" for c in sorted(won, key=lambda c: c.seat)
            )
            warnings.append(
                f"round {round_number}: {claimed} tricks won ({who}) but the round "
                f"only deals {round_number} — a mark or a digit was probably misread"
            )

    for seat, alias in enumerate(game.aliases):
        # A column whose total comes out right is a column that was read right,
        # which is the answer to any square in it that could have been read two
        # ways. This is what the totals row is for, and it is why an unmarked
        # square in round ten is usually not worth mentioning.
        confirmed = stated[seat] is not None and stated[seat] == computed[seat]

        if not confirmed and not game.paired_layout:
            for cell in sorted((c for c in game.cells if c.seat == seat),
                               key=lambda c: c.round_number):
                if cell.success and BASE_SCORE + cell.bet <= cell.round_number:
                    written = BASE_SCORE + cell.bet
                    warnings.append(
                        f"round {cell.round_number}, {alias}: {written} is a made "
                        f"bid of {cell.bet} or a struck bid of {written}, and "
                        f"nothing marks which — read as made"
                    )

        if stated[seat] is not None and not confirmed:
            warnings.append(_disagreeing_total(game, seat, stated[seat],
                                               computed[seat]))

    return warnings


def _disagreeing_total(game: ParsedGame, seat: int, stated: int,
                       computed: int) -> str:
    """
    A column that does not add up, and where to look.

    Somebody added this column by hand at the table and got a different answer,
    so one of the squares above it was read wrongly. Usually exactly one, and
    usually its outcome rather than its digits — which makes it findable: if
    reading a single square the other way closes the gap exactly, that is the
    square.
    """
    difference = stated - computed
    culprits = [
        cell for cell in game.cells
        if cell.seat == seat
        and (-cell.score if cell.success else BASE_SCORE + cell.bet) == difference
    ]

    opening = (f"{game.aliases[seat]}: the sheet says {stated} but the rounds "
               f"add up to {computed}")

    if len(culprits) == 1:
        cell = culprits[0]
        written = BASE_SCORE + cell.bet

        # The square that could have been read two ways, read the other way.
        # Bidding everything is rare, so a bare 10 in round ten is taken as a
        # made bid of nothing; when the column says otherwise, this is what it
        # is saying.
        if cell.success and written <= cell.round_number:
            return (f"{opening} — round {cell.round_number} accounts for it "
                    f"exactly: {written} was read as a made bid of {cell.bet}, "
                    f"and the total says it is a struck bid of {written}")

        read_as = "made" if cell.success else "struck"
        really = "went down" if cell.success else "was made"
        return (f"{opening} — round {cell.round_number} accounts for it exactly: "
                f"that square was read as a {read_as} bid of {cell.bet}, and the "
                f"total says it {really}")

    if culprits:
        rounds = ", ".join(str(c.round_number) for c in
                           sorted(culprits, key=lambda c: c.round_number))
        return (f"{opening} — reading any one of rounds {rounds} the other way "
                f"would account for it")

    return (f"{opening}, a difference of {difference} that no single square "
            f"explains — check the digits, not just the marks")


# ---------------------------------------------------------------------------
# Writing
# ---------------------------------------------------------------------------


def format_game_csv(
    *,
    aliases: Sequence[str],
    cells: Sequence[Cell],
    total_rounds: int,
    date: Optional[datetime] = None,
    location: Optional[str] = None,
    game_type: Optional[str] = None,
    notes: Optional[str] = None,
) -> str:
    """
    Write a game out in the format above.

    Every round up to total_rounds gets a row, including the ones nobody has
    played yet, so the file is the same shape as the game rather than the same
    shape as the data — and so a game exported, edited and read back keeps its
    length. The totals row is written because it is the file's own checksum: an
    export that is read back in verifies itself.
    """
    lines = ["# parvis game"]
    if date:
        lines.append(f"#date: {date.isoformat()}")
    if location:
        lines.append(f"#location: {location}")
    if game_type:
        lines.append(f"#type: {game_type}")
    if notes:
        # Newlines would end the preamble halfway through the note.
        lines.append("#notes: " + " ".join(notes.split()))
    lines.append(f"#rounds: {total_rounds}")

    by_position = {(c.round_number, c.seat): c for c in cells}
    width = len(aliases)

    rows = [["Round", *aliases]]
    for round_number in range(1, total_rounds + 1):
        row = [str(round_number)]
        for seat in range(width):
            cell = by_position.get((round_number, seat))
            if cell is None:
                row.append("")
            elif cell.success:
                # What the square would hold: the ten written in front of the
                # bid.
                row.append(str(BASE_SCORE + cell.bet))
            else:
                # The bare bid, and the strike over it. Marked even where the
                # number alone would be unambiguous, so that what this writes
                # can be read back without ever having to guess.
                row.append(f"{cell.bet}{MISS_MARKER}")
        rows.append(row)

    totals = [0] * width
    for cell in cells:
        if cell.seat < width:
            totals[cell.seat] += cell.score
    rows.append(["Total", *(str(t) for t in totals)])

    # csv.writer only to get the quoting right on an alias containing a comma;
    # the rest of the file is numbers.
    table = io.StringIO()
    csv.writer(table, lineterminator="\n").writerows(rows)

    return "\n".join(lines) + "\n" + table.getvalue()
