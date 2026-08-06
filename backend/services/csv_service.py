"""
Moving a whole game in and out of the database as a CSV file.

game_csv.py owns the file format and knows nothing about the database; this
knows about the database and nothing about the format. The join between them is
narrow on purpose — a seat number and an alias — because the interesting
failure is a file that reads perfectly and describes the wrong people.
"""

from typing import Dict, List, Optional, Tuple

from fastapi import HTTPException
from sqlalchemy.orm import Session

from database import GamePlayer, Player, Round
from game_csv import Cell, CsvFormatError, format_game_csv, parse_game_csv
from models import GameCreate
from utils import calculate_score, get_game_or_404

from .game_service import GameService


class GameCsvService:
    """Reading and writing games as the table they were played on."""

    def __init__(self, db: Session):
        self.db = db

    # -- out ---------------------------------------------------------------

    def export_game(self, game_id: int) -> Tuple[str, str]:
        """
        Write a game out as CSV.

        Returns:
            The file's contents and a filename to offer it under.
        """
        game = get_game_or_404(game_id, self.db)

        seated = self.db.query(GamePlayer)\
            .filter(GamePlayer.game_id == game_id)\
            .order_by(GamePlayer.seat, GamePlayer.player_id).all()

        aliases = []
        seat_of: Dict[int, int] = {}
        for seat, gp in enumerate(seated):
            player = self.db.query(Player).filter(Player.id == gp.player_id).first()
            # Seats are renumbered from the query order rather than trusted:
            # the column carries a default of 0, so a game recorded before
            # seating existed has every player in seat 0, and writing that out
            # would put them all in one column.
            seat_of[gp.player_id] = seat
            aliases.append(player.alias if player else f"player-{gp.player_id}")

        cells = [
            Cell(round_number=r.round_number, seat=seat_of[r.player_id],
                 bet=r.bet, success=bool(r.success))
            for r in self.db.query(Round).filter(Round.game_id == game_id)
                         .order_by(Round.round_number).all()
            if r.player_id in seat_of
        ]

        text = format_game_csv(
            aliases=aliases,
            cells=cells,
            total_rounds=game.total_rounds or max((c.round_number for c in cells),
                                                  default=1),
            date=game.date,
            location=game.location,
            game_type=game.game_type,
            notes=game.notes,
        )

        stamp = game.date.strftime("%Y-%m-%d") if game.date else "undated"
        return text, f"parvis-game-{game.id}-{stamp}.csv"

    # -- in ----------------------------------------------------------------

    def import_game(self, text: str, *, strict: bool = False,
                    dry_run: bool = False) -> dict:
        """
        Read a CSV file in as a new game.

        Always a new game, never an edit of an existing one: a file describes a
        night that was played, and the way to correct a game already in the
        database is the matrix, where you can see what you are changing.

        The game arrives unfinished — active, not yet valid — however complete
        the file is. Somebody has to look at the imported table beside the
        paper before it counts towards anybody's record, and pressing FINISH is
        that acknowledgement.

        A file that cannot be read is refused. A file that reads but does not
        add up is imported anyway, carrying its doubts on the game itself, and
        the game screen puts them over the matrix. Refusing those was the first
        answer and the wrong one: a round that awards more tricks than it deals
        cannot be settled without the paper, and refusing leaves the person
        holding the paper with nothing to correct.

        Args:
            text: the file's contents
            strict: refuse rather than import when the arithmetic checks find
                something. Off by default — the point of the checks is to reach
                somebody who can fix the game, and that means the game has to
                exist. On for a caller that wants a pass/fail answer.
            dry_run: parse, check, report — and write nothing.

        Returns:
            A report of what was read, including any warnings.

        Raises:
            HTTPException: 400 for a file that cannot be read, or that names a
                player who is not on the roster — and, under strict, for one
                whose arithmetic does not hold.
        """
        try:
            parsed = parse_game_csv(text)
        except CsvFormatError as error:
            raise HTTPException(
                status_code=400,
                detail=_listing("This file could not be read as a game:",
                                error.problems),
            )

        players = self._resolve(parsed.aliases)

        if parsed.warnings and strict:
            raise HTTPException(
                status_code=400,
                detail=_listing(
                    "The numbers in this file do not add up:",
                    parsed.warnings,
                    "Import without strict=true to bring it in anyway and "
                    "correct it against the sheet in the game screen.",
                ),
            )

        report = {
            "game_id": None,
            "dry_run": dry_run,
            "players": [
                {"seat": seat, "alias": player.alias, "player_id": player.id}
                for seat, player in enumerate(players)
            ],
            "rounds_imported": len(parsed.cells),
            "total_rounds": parsed.total_rounds,
            "totals": dict(zip(parsed.aliases, parsed.totals)),
            "warnings": parsed.warnings,
        }

        if dry_run:
            return report

        game = GameService(self.db).create_game(GameCreate(
            player_ids=[p.id for p in players],
            total_rounds=parsed.total_rounds,
            game_type=parsed.game_type,
            notes=parsed.notes,
            location=parsed.location,
            date=parsed.date,
        ))

        self.db.add_all([
            Round(
                game_id=game.id,
                round_number=cell.round_number,
                player_id=players[cell.seat].id,
                bet=cell.bet,
                success=cell.success,
                score=calculate_score(cell.bet, cell.success),
            )
            for cell in parsed.cells
        ])

        # Where the matrix opens. The rounds after this one are drawn as not
        # yet reached, so leaving it at 1 would hide everything just imported.
        game.current_round = min(parsed.last_round_with_data, game.total_rounds)

        # The doubts travel with the game, because the person who can settle
        # them is not the one who ran the import.
        game.import_warnings = "\n".join(parsed.warnings) or None

        self.db.commit()

        report["game_id"] = game.id
        return report

    def _resolve(self, aliases: List[str]) -> List[Player]:
        """
        Match the names in the header against the roster.

        Never creates anybody. A misread name is the most likely thing to be
        wrong with a transcribed file, and a player invented from one is
        permanent, silent, and turns up in the hall of fame — far worse than an
        import that stops and asks. Registering the player first, by hand, is
        the fix.

        Case is ignored, since the header is copied off handwriting.
        """
        roster = self.db.query(Player).all()
        exact = {p.alias: p for p in roster}

        folded: Dict[str, List[Player]] = {}
        for player in roster:
            folded.setdefault(player.alias.lower(), []).append(player)

        found: List[Player] = []
        unknown: List[str] = []
        ambiguous: List[str] = []

        for alias in aliases:
            player = exact.get(alias)
            if player is None:
                candidates = folded.get(alias.strip().lower(), [])
                if len(candidates) > 1:
                    ambiguous.append(alias)
                    continue
                player = candidates[0] if candidates else None

            if player is None:
                unknown.append(alias)
            else:
                found.append(player)

        if ambiguous:
            raise HTTPException(
                status_code=400,
                detail=_listing(
                    "More than one player answers to these names:", ambiguous,
                    "Spell them exactly as they are registered.",
                ),
            )

        if unknown:
            raise HTTPException(
                status_code=400,
                detail=_listing(
                    "These names are not on the player list:", unknown,
                    "Register them first, or correct the spelling in the file. "
                    "Known players: " + ", ".join(sorted(p.alias for p in roster)),
                ),
            )

        if len({p.id for p in found}) != len(found):
            raise HTTPException(
                status_code=400,
                detail="The same player has two columns in this file.",
            )

        if len(found) < 2:
            raise HTTPException(
                status_code=400, detail="A game needs at least two players.",
            )

        return found


def _listing(heading: str, items: List[str], footer: Optional[str] = None) -> str:
    """
    One error message with a line per problem.

    A plain string rather than a structured body because this reaches people
    through curl and through the frontend's alert(), and both show a string
    better than they show a list.
    """
    lines = [heading, *(f"  - {item}" for item in items)]
    if footer:
        lines.append(footer)
    return "\n".join(lines)
