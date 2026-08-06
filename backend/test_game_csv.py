"""
Reading and writing a game as a CSV.

The format exists so a game played on paper can be photographed, transcribed by
machine, and imported. That producer is the reason so many of these tests are
about files that are wrong: a vision model does not fail loudly, it returns a
tidy table describing a game nobody played, and everything here that refuses a
file is refusing one of those.

A square on the sheet holds the number standing in it — the score where the bid
was made, since making it earns a ten written in front, and the bare bid where
it was struck through. So `15` is a made bid of five and `5-` is a struck one.
"""

import pytest

from database import Game, GamePlayer, Player, Round
from game_csv import (
    Cell,
    CsvFormatError,
    format_game_csv,
    parse_game_csv,
)


def table(*lines: str) -> str:
    return "\n".join(lines) + "\n"


def problems_from(text: str):
    with pytest.raises(CsvFormatError) as raised:
        parse_game_csv(text)
    return raised.value.problems


class TestReadingATable:

    def test_a_square_holds_the_number_written_in_it(self):
        game = parse_game_csv(table(
            "Round,ana,ben",
            "1,11,0-",
            "2,2-,10",
        ))

        assert game.aliases == ["ana", "ben"]
        assert {(c.round_number, c.seat, c.bet, c.success) for c in game.cells} == {
            (1, 0, 1, True), (1, 1, 0, False),
            (2, 0, 2, False), (2, 1, 0, True),
        }

    def test_the_ten_in_front_of_a_made_bid_is_what_scores_it(self):
        game = parse_game_csv(table("Round,ana,ben", "3,13,3-"))

        assert game.totals == [13, 0]

    def test_an_empty_square_is_not_a_bid_of_nothing(self):
        """
        The distinction the format turns on. A bid of nothing that holds is
        worth ten; an empty square is a round nobody has filled in.
        """
        game = parse_game_csv(table("Round,ana,ben", "1,10,"))

        assert [(c.seat, c.bet, c.success) for c in game.cells] == [(0, 0, True)]
        assert game.totals == [10, 0]

    def test_a_lone_dash_is_also_an_empty_square(self):
        """It is how the app draws an unplayed round, so somebody copying off
        the screen will write it."""
        game = parse_game_csv(table("Round,ana,ben", "1,-,11"))

        assert [(c.seat, c.bet) for c in game.cells] == [(1, 1)]

    @pytest.mark.parametrize("marker", ["-", "x", "X", "*", "/", "✗"])
    def test_any_of_the_usual_crossings_out_means_the_bid_went_down(self, marker):
        game = parse_game_csv(table("Round,ana,ben", f"1,1{marker},10"))

        assert [c.success for c in game.cells] == [False, True]

    def test_a_row_that_stops_early_leaves_the_rest_blank(self):
        """Trailing empty fields get dropped by hand and by spreadsheets alike."""
        game = parse_game_csv(table("Round,ana,ben,cleo", "2,12"))

        assert [(c.seat, c.bet) for c in game.cells] == [(0, 2)]

    def test_rounds_may_be_skipped(self):
        """A half-filled sheet is a legitimate thing to import."""
        game = parse_game_csv(table("Round,ana,ben", "1,11,0-", "4,14,0-"))

        assert sorted({c.round_number for c in game.cells}) == [1, 4]
        assert game.total_rounds == 4


class TestTellingAScoreFromABid:
    """
    The number alone says which it is, nearly always: a made square holds
    10..10+N and a struck one holds 0..N, and for the first nine rounds those
    do not overlap.
    """

    def test_too_big_to_be_a_bid_means_the_bid_was_made(self):
        game = parse_game_csv(table("Round,ana,ben", "3,13,0-"))

        assert [(c.bet, c.success) for c in game.cells] == [(3, True), (0, False)]

    def test_too_small_to_be_a_score_means_the_bid_went_down(self):
        """Anything under ten is a bid standing on its own, struck or not."""
        game = parse_game_csv(table("Round,ana,ben", "5,4,0-"))

        assert [(c.bet, c.success) for c in game.cells] == [(4, False), (0, False)]

    def test_a_strike_over_something_too_big_to_be_a_bid_is_a_contradiction(self):
        """
        The number says made, the mark says struck. Nothing else would catch a
        strike hallucinated over a score.
        """
        problems = problems_from(table("Round,ana,ben", "5,15-,0-"))

        assert any("struck through" in p and "only deals 5" in p for p in problems)

    def test_a_number_that_can_be_neither_is_refused(self):
        problems = problems_from(table("Round,ana,ben", "3,25,0-"))

        assert any("cannot stand in round 3" in p for p in problems)

    def test_from_round_ten_a_bare_number_can_be_read_two_ways(self):
        """
        Ten in round ten is a made bid of nothing, or a bid of everything that
        went down. It is read as made, because bidding everything is rare and
        unstruck means made — and the reading is reported.
        """
        game = parse_game_csv(table("Round,ana,ben", "10,10,0-"))

        assert [(c.bet, c.success) for c in game.cells] == [(0, True), (0, False)]
        assert any("read as made" in w for w in game.warnings)

    def test_the_strike_settles_it(self):
        game = parse_game_csv(table("Round,ana,ben", "10,10-,0-"))

        assert [(c.bet, c.success) for c in game.cells] == [(10, False), (0, False)]
        assert game.warnings == []

    def test_bidding_everything_and_making_it_is_never_ambiguous(self):
        """Twenty is out of reach of any bid, so it can only be a score."""
        game = parse_game_csv(table("Round,ana,ben", "10,20,0-"))

        assert [(c.bet, c.success) for c in game.cells] == [(10, True), (0, False)]
        assert game.warnings == []


class TestSettingsAboveTheTable:

    def test_the_preamble_carries_what_a_table_cannot(self):
        game = parse_game_csv(table(
            "# parvis game",
            "#date: 2026-07-14",
            "#location: hytta",
            "#type: tournament",
            "#notes: read off a photograph",
            "Round,ana,ben",
            "1,11,0-",
        ))

        assert game.date.year == 2026 and game.date.month == 7 and game.date.day == 14
        assert game.location == "hytta"
        assert game.game_type == "tournament"
        assert game.notes == "read off a photograph"

    def test_a_comment_without_a_colon_is_just_a_comment(self):
        game = parse_game_csv(table("# parvis game", "Round,ana,ben", "1,11,0-"))

        assert game.location is None

    def test_a_spreadsheet_padding_the_preamble_out_changes_nothing(self):
        """
        Opening the file in a spreadsheet and saving it back pads every line to
        the width of the table.
        """
        game = parse_game_csv(table("#location: hytta,,", "Round,ana,ben", "1,11,0-"))

        assert game.location == "hytta"

    def test_the_file_may_say_the_game_is_longer_than_the_table(self):
        """Ten rounds planned, two played so far."""
        game = parse_game_csv(table("#rounds: 10", "Round,ana,ben",
                                    "1,11,0-", "2,12,0-"))

        assert game.total_rounds == 10

    def test_but_not_shorter_than_the_table(self):
        assert any("reaches round 4" in p for p in problems_from(
            table("#rounds: 2", "Round,ana,ben", "4,14,0-")
        ))

    def test_a_misspelt_setting_is_refused_rather_than_ignored(self):
        """Silently dropping `#dat:` would lose the date without saying so."""
        assert any("unknown setting 'dat'" in p for p in problems_from(
            table("#dat: 2026-07-14", "Round,ana,ben", "1,11,0-")
        ))

    def test_an_unreadable_date_says_what_a_date_looks_like(self):
        problems = problems_from(table("#date: last saturday", "Round,ana,ben",
                                       "1,11,0-"))

        assert any("2026-07-14" in p for p in problems)


class TestFilesThatAreWrong:

    def test_every_problem_is_reported_not_only_the_first(self):
        problems = problems_from(table("Round,ana,ben", "1,5,0-", "2,9,0-"))

        assert len(problems) == 2

    def test_a_problem_points_at_the_line_it_is_on(self):
        problems = problems_from(table("#date: 2026-07-14", "Round,ana,ben", "1,5,0-"))

        assert any("line 3" in p for p in problems)

    def test_an_unreadable_square_is_refused(self):
        assert any("cannot read 'O'" in p for p in problems_from(
            table("Round,ana,ben", "1,O,0-")
        ))

    def test_a_row_wider_than_the_header_is_refused(self):
        """
        The failure that looks like a working import: one extra field and every
        value in the row belongs to the wrong player.
        """
        problems = problems_from(table("Round,ana,ben", "1,11,11,11"))

        assert any("does not line up with the header" in p for p in problems)

    def test_the_same_round_twice_is_refused(self):
        assert any("round 1 appears twice" in p for p in problems_from(
            table("Round,ana,ben", "1,11,0-", "1,10,0-")
        ))

    def test_a_table_that_does_not_start_with_a_round_column_is_refused(self):
        assert any("start with a Round column" in p for p in problems_from(
            table("ana,ben", "1,11")
        ))

    def test_the_same_player_in_two_columns_is_refused(self):
        assert any("two columns" in p for p in problems_from(
            table("Round,ana,ana", "1,11,11")
        ))

    def test_a_row_label_that_is_neither_a_round_nor_a_total_is_refused(self):
        assert any("neither a round number" in p for p in problems_from(
            table("Round,ana,ben", "first,11,0-")
        ))

    def test_settings_with_no_table_under_them_are_refused(self):
        assert any("no table here" in p for p in problems_from("#location: hytta\n"))


class TestTheArithmeticChecks:

    def test_a_round_cannot_award_more_tricks_than_it_deals(self):
        """
        Round five deals five cards. Two players cannot both win five of them,
        so one of those squares was misread.
        """
        game = parse_game_csv(table("Round,ana,ben", "5,15,15"))

        assert len(game.warnings) == 1
        assert "round 5" in game.warnings[0]
        assert "10 tricks won" in game.warnings[0]

    def test_bids_that_went_down_do_not_count_towards_the_tricks(self):
        """A struck bid says nothing about how many tricks that player took."""
        game = parse_game_csv(table("Round,ana,ben", "5,15,5-"))

        assert game.warnings == []

    def test_a_totals_row_that_agrees_is_silent(self):
        game = parse_game_csv(table("Round,ana,ben", "1,11,0-", "Total,11,0"))

        assert game.warnings == []

    def test_a_totals_row_may_be_partly_written(self):
        game = parse_game_csv(table("Round,ana,ben", "1,11,0-", "Total,11,"))

        assert game.warnings == []

    def test_a_column_that_does_not_add_up_names_the_round_that_explains_it(self):
        """
        Somebody added this column by hand at the table. If reading one square
        the other way closes the gap exactly, that square is where to look.
        """
        game = parse_game_csv(table(
            "Round,ana,ben",
            "1,11,0-",
            "2,12,2-",
            "Total,23,10",
        ))

        assert len(game.warnings) == 1
        assert "ben: the sheet says 10 but the rounds add up to 0" in game.warnings[0]
        assert "round 1 accounts for it exactly" in game.warnings[0]

    def test_when_several_rounds_would_explain_it_they_are_all_named(self):
        game = parse_game_csv(table(
            "Round,ana,ben",
            "1,11,0-",
            "2,12,0-",
            "Total,23,10",
        ))

        assert "rounds 1, 2" in game.warnings[0]

    def test_a_gap_no_single_square_explains_says_to_check_the_digits(self):
        game = parse_game_csv(table("Round,ana,ben", "1,11,0-", "Total,11,99"))

        assert "no single square explains" in game.warnings[0]

    def test_the_totals_row_settles_a_square_that_could_be_read_two_ways(self):
        """
        Ten in round ten is ambiguous on its own, and not ambiguous at all once
        the column adds up. This is what the totals row is for.
        """
        game = parse_game_csv(table("Round,ana,ben", "10,10,0-", "Total,10,0"))

        assert game.warnings == []

    def test_and_says_so_when_it_settles_it_the_other_way(self):
        game = parse_game_csv(table("Round,ana,ben", "10,10,0-", "Total,0,0"))

        assert any("the total says it is a struck bid of 10" in w
                   for w in game.warnings)


class TestTheOlderPairedLayout:
    """
    `Name_bets,Name_mask` — what the first transcription prompt produced.
    Accepted on input so files that already exist do not have to be redone;
    never written.
    """

    def test_it_reads_the_same_game_as_the_paper_form(self):
        paired = parse_game_csv(table(
            "Round,ana_bets,ana_mask,ben_bets,ben_mask",
            "1,1,1,0,0",
        ))
        paper = parse_game_csv(table("Round,ana,ben", "1,11,0-"))

        assert paired.aliases == paper.aliases
        assert paired.cells == paper.cells

    def test_an_unwritten_mask_means_the_bid_was_made(self):
        """The paper only marks failures, so a blank is the common case."""
        game = parse_game_csv(table("Round,ana_bets,ana_mask,ben_bets,ben_mask",
                                    "1,1,,0,0"))

        assert [c.success for c in game.cells] == [True, False]

    def test_no_bid_means_no_square_whatever_the_mask_says(self):
        game = parse_game_csv(table("Round,ana_bets,ana_mask,ben_bets,ben_mask",
                                    "1,,1,0,1"))

        assert [(c.seat, c.bet) for c in game.cells] == [(1, 0)]

    def test_a_bid_larger_than_the_round_is_refused(self):
        assert any("bid of 4 in round 3" in p for p in problems_from(
            table("Round,ana_bets,ana_mask,ben_bets,ben_mask", "3,4,1,0,1")
        ))

    def test_nothing_in_this_layout_can_be_read_two_ways(self):
        """The bid and the outcome are in different columns, so the reading is
        never in doubt and the warning about it would be noise."""
        game = parse_game_csv(table("Round,ana_bets,ana_mask,ben_bets,ben_mask",
                                    "10,0,1,0,0"))

        assert game.paired_layout is True
        assert game.warnings == []

    def test_an_odd_number_of_columns_is_refused(self):
        assert any("must come in twos" in p for p in problems_from(
            table("Round,ana_bets,ana_mask,ben_bets", "1,1,1,0")
        ))

    def test_a_bets_column_without_its_mask_is_refused(self):
        assert any("not the same player" in p for p in problems_from(
            table("Round,ana_bets,ben_mask", "1,1,1")
        ))


class TestTheTranscriptionThatPromptedTheChecks:
    """
    A real sheet, transcribed by machine vision. Its own quality check — that
    each player's rounds add up to the total written on the paper — passes, and
    the game it describes is still impossible. That gap is why the per-round
    check exists.
    """

    SHEET = table(
        "Round,Carina_bets,Carina_mask,Rasmus_bets,Rasmus_mask,"
        "Elise_bets,Elise_mask,Rosanna_bets,Rosanna_mask",
        "1,0,1,1,0,0,1,0,0",
        "2,0,0,2,1,2,0,0,0",
        "3,0,0,0,1,0,1,0,0",
        "4,0,0,0,1,0,1,0,0",
        "5,5,1,0,0,1,1,5,1",
        "6,0,0,6,0,0,1,0,0",
        "7,0,0,0,0,0,1,7,0",
        "8,0,0,0,1,0,1,0,0",
        "9,0,0,0,0,0,0,0,0",
        "10,5,1,0,0,0,0,10,1",
    )

    def test_it_reads(self):
        game = parse_game_csv(self.SHEET)

        assert game.aliases == ["Carina", "Rasmus", "Elise", "Rosanna"]
        assert game.total_rounds == 10

    def test_the_totals_are_the_ones_written_on_the_paper(self):
        game = parse_game_csv(self.SHEET)

        assert game.totals == [40, 42, 71, 35]

    def test_the_totals_check_alone_would_have_passed_it(self):
        game = parse_game_csv(self.SHEET + "Total,40,42,71,35\n")

        assert not any("the sheet says" in w for w in game.warnings)

    def test_two_rounds_award_more_tricks_than_they_deal(self):
        """
        Round 5: Carina 5 and Rosanna 5 both made, in a round with five tricks
        in it. Round 10: Carina 5 and Rosanna 10. Both are transcription
        errors — most likely a strike-through that did not register.
        """
        game = parse_game_csv(self.SHEET)

        assert [w.split(":")[0] for w in game.warnings] == ["round 5", "round 10"]


class TestWritingATable:

    def test_it_writes_the_shape_of_the_game_not_the_shape_of_the_data(self):
        """
        Every round gets a row, played or not, so an exported game keeps its
        length when it is read back.
        """
        text = format_game_csv(
            aliases=["ana", "ben"],
            cells=[Cell(round_number=1, seat=0, bet=1, success=True)],
            total_rounds=3,
        )

        assert "1,11," in text
        assert "2,," in text
        assert "3,," in text

    def test_a_made_bid_is_written_the_way_the_square_would_read(self):
        text = format_game_csv(
            aliases=["ana"],
            cells=[Cell(round_number=5, seat=0, bet=5, success=True)],
            total_rounds=5,
        )

        assert "5,15" in text

    def test_a_bid_that_went_down_keeps_its_number_and_gets_the_strike(self):
        text = format_game_csv(
            aliases=["ana"],
            cells=[Cell(round_number=2, seat=0, bet=2, success=False)],
            total_rounds=2,
        )

        assert "2,2-" in text

    def test_it_writes_the_totals_row(self):
        text = format_game_csv(
            aliases=["ana", "ben"],
            cells=[Cell(round_number=1, seat=0, bet=1, success=True),
                   Cell(round_number=1, seat=1, bet=1, success=False)],
            total_rounds=1,
        )

        assert "Total,11,0" in text

    def test_a_note_containing_newlines_does_not_break_the_preamble(self):
        text = format_game_csv(
            aliases=["ana", "ben"], cells=[], total_rounds=1,
            notes="two lines\nof note",
        )

        assert "#notes: two lines of note" in text
        assert parse_game_csv(text).notes == "two lines of note"

    def test_what_it_writes_is_what_the_parser_reads(self):
        cells = [
            Cell(round_number=1, seat=0, bet=1, success=True),
            Cell(round_number=1, seat=1, bet=0, success=False),
            Cell(round_number=2, seat=1, bet=2, success=True),
        ]

        game = parse_game_csv(format_game_csv(
            aliases=["ana", "ben"], cells=cells, total_rounds=2,
            location="hytta", game_type="tournament",
        ))

        assert game.aliases == ["ana", "ben"]
        assert sorted(game.cells, key=lambda c: (c.round_number, c.seat)) == cells
        assert game.total_rounds == 2
        assert game.location == "hytta"
        assert game.game_type == "tournament"
        assert game.warnings == []

    def test_the_totals_row_it_writes_resolves_the_one_ambiguous_square(self):
        """
        A made bid of nothing in round ten is written `10`, which on its own
        could also be a struck bid of ten. The totals row written underneath it
        is what makes the file readable back without a guess.
        """
        cells = [
            Cell(round_number=10, seat=0, bet=10, success=True),
            Cell(round_number=10, seat=1, bet=0, success=True),
        ]

        game = parse_game_csv(format_game_csv(
            aliases=["ana", "ben"], cells=cells, total_rounds=10,
        ))

        assert sorted(game.cells, key=lambda c: c.seat) == cells
        assert game.warnings == []


# ---------------------------------------------------------------------------
# Through the API
# ---------------------------------------------------------------------------


@pytest.fixture
def roster(db):
    for player_id, alias in ((1, "ana"), (2, "ben"), (3, "cleo")):
        db.add(Player(id=player_id, alias=alias, email=f"{alias}@example.com"))
    db.commit()
    return db


def post(client, text, **params):
    return client.post("/games/import", content=text.encode("utf-8"), params=params)


class TestImportEndpoint:

    def test_a_file_becomes_a_game(self, roster, client):
        response = post(client, table(
            "#date: 2026-07-14",
            "#location: hytta",
            "Round,ana,ben",
            "1,11,0-",
            "2,12,2-",
        ))

        assert response.status_code == 200
        body = response.json()

        game = roster.query(Game).filter(Game.id == body["game_id"]).one()
        assert game.location == "hytta"
        assert game.date.year == 2026
        assert game.total_rounds == 2

        scores = {r.player_id: r.score for r in
                  roster.query(Round).filter(Round.round_number == 1).all()}
        assert scores == {1: 11, 2: 0}

    def test_the_column_order_is_the_seating(self, roster, client):
        """Which seat somebody sits in decides whose round it is, so the
        columns cannot be read as an unordered set."""
        body = post(client, table("Round,cleo,ana", "1,10,0-")).json()

        seats = {gp.player_id: gp.seat for gp in
                 roster.query(GamePlayer)
                 .filter(GamePlayer.game_id == body["game_id"]).all()}
        assert seats == {3: 0, 1: 1}

    def test_an_empty_square_creates_no_round(self, roster, client):
        body = post(client, table("Round,ana,ben", "1,11,")).json()

        rounds = roster.query(Round).filter(Round.game_id == body["game_id"]).all()
        assert [(r.player_id, r.bet) for r in rounds] == [(1, 1)]

    def test_the_matrix_opens_on_the_last_round_that_has_anything_in_it(
        self, roster, client
    ):
        """Left at one, everything imported would be drawn as not yet reached."""
        body = post(client, table("#rounds: 10", "Round,ana,ben",
                                  "1,11,0-", "3,13,0-")).json()

        game = roster.query(Game).filter(Game.id == body["game_id"]).one()
        assert game.current_round == 3
        assert game.total_rounds == 10

    def test_an_imported_game_is_not_finished(self, roster, client):
        """However complete the file, somebody compares it with the paper and
        presses FINISH. Until then it counts towards nothing."""
        body = post(client, table("Round,ana,ben", "1,11,0-")).json()

        game = roster.query(Game).filter(Game.id == body["game_id"]).one()
        assert game.is_active is True
        assert game.is_valid is False

    def test_names_are_matched_however_they_were_capitalised(self, roster, client):
        body = post(client, table("Round,Ana,BEN", "1,11,0-")).json()

        assert [p["player_id"] for p in body["players"]] == [1, 2]

    def test_a_name_that_is_not_on_the_roster_stops_the_import(self, roster, client):
        response = post(client, table("Round,ana,carina", "1,11,0-"))

        assert response.status_code == 400
        assert "carina" in response.json()["detail"]
        assert roster.query(Game).count() == 0

    def test_it_says_who_it_does_know(self, roster, client):
        """A misread name is the likeliest thing wrong with a transcribed file,
        so the reply carries the list to correct it against."""
        detail = post(client, table("Round,ana,carina", "1,11,0-")).json()["detail"]

        assert "ana, ben, cleo" in detail

    def test_a_misread_name_never_becomes_a_new_player(self, roster, client):
        """Inventing one is silent, permanent, and turns up in the hall of fame."""
        post(client, table("Round,ana,carina", "1,11,0-"))

        assert roster.query(Player).count() == 3

    def test_a_file_that_cannot_be_read_says_everything_wrong_with_it(
        self, roster, client
    ):
        response = post(client, table("Round,ana,ben", "1,5,0-", "2,9,0-"))

        assert response.status_code == 400
        detail = response.json()["detail"]
        assert "cannot stand in round 1" in detail
        assert "cannot stand in round 2" in detail

    def test_an_empty_body_is_a_400_not_a_500(self, roster, client):
        assert post(client, "").status_code == 400

    def test_a_one_player_file_is_refused(self, roster, client):
        response = post(client, table("Round,ana", "1,11"))

        assert response.status_code == 400
        assert "at least two players" in response.json()["detail"]


class TestWhatHappensToAFileThatDoesNotAddUp:
    """
    It gets imported. Refusing it was the first answer and the wrong one: a
    round that awards more tricks than it deals cannot be settled without the
    paper, and refusing leaves the person holding the paper with nothing to
    correct.
    """

    IMPOSSIBLE = table("Round,ana,ben", "5,15,15")

    def test_it_is_imported_anyway(self, roster, client):
        response = post(client, self.IMPOSSIBLE)

        assert response.status_code == 200
        assert len(response.json()["warnings"]) == 1
        assert roster.query(Game).count() == 1

    def test_the_game_carries_the_doubts_so_the_screen_can_show_them(
        self, roster, client
    ):
        """The person who can settle these is not the one who ran the import."""
        body = post(client, self.IMPOSSIBLE).json()

        game = roster.query(Game).filter(Game.id == body["game_id"]).one()
        assert "10 tricks won" in game.import_warnings

    def test_a_file_that_adds_up_carries_nothing(self, roster, client):
        body = post(client, table("Round,ana,ben", "1,11,0-")).json()

        game = roster.query(Game).filter(Game.id == body["game_id"]).one()
        assert game.import_warnings is None

    def test_the_warnings_reach_the_frontend(self, roster, client):
        """Carried on the game itself, not only in the import's own reply."""
        body = post(client, self.IMPOSSIBLE).json()

        game = client.get(f"/games/{body['game_id']}").json()
        assert "10 tricks won" in game["import_warnings"]

    def test_checking_it_against_the_paper_clears_them(self, roster, client):
        body = post(client, self.IMPOSSIBLE).json()

        cleared = client.post(f"/games/{body['game_id']}/acknowledge-import")

        assert cleared.status_code == 200
        assert cleared.json()["import_warnings"] is None
        assert roster.query(Game).filter(
            Game.id == body["game_id"]).one().import_warnings is None

    def test_acknowledging_a_game_that_is_not_there_is_a_404(self, roster, client):
        assert client.post("/games/99/acknowledge-import").status_code == 404

    def test_strict_refuses_instead_of_importing(self, roster, client):
        """For a caller that wants a pass/fail answer rather than a game."""
        response = post(client, self.IMPOSSIBLE, strict="true")

        assert response.status_code == 400
        assert "10 tricks won" in response.json()["detail"]
        assert roster.query(Game).count() == 0

    def test_a_file_that_cannot_be_read_is_still_refused(self, roster, client):
        """Unreadable is a different thing from doubtful."""
        response = post(client, table("Round,ana,ben", "1,O,0-"))

        assert response.status_code == 400
        assert roster.query(Game).count() == 0


class TestTheDryRunSwitch:

    def test_a_dry_run_reports_without_writing(self, roster, client):
        body = post(client, table("Round,ana,ben", "1,11,0-"), dry_run="true").json()

        assert body["game_id"] is None
        assert body["dry_run"] is True
        assert body["rounds_imported"] == 2
        assert body["totals"] == {"ana": 11, "ben": 0}
        assert roster.query(Game).count() == 0

    def test_a_dry_run_still_checks_the_names(self, roster, client):
        response = post(client, table("Round,ana,carina", "1,11,0-"), dry_run="true")

        assert response.status_code == 400


class TestExportEndpoint:

    @pytest.fixture
    def played(self, roster):
        roster.add(Game(id=1, total_rounds=2, current_round=2, location="hytta",
                        game_type="standard", is_active=True, is_valid=False))
        roster.add(GamePlayer(game_id=1, player_id=2, seat=0))
        roster.add(GamePlayer(game_id=1, player_id=1, seat=1))
        roster.add(Round(game_id=1, round_number=1, player_id=2,
                         bet=1, success=True, score=11))
        roster.add(Round(game_id=1, round_number=1, player_id=1,
                         bet=0, success=False, score=0))
        roster.commit()
        return roster

    def test_it_writes_the_seating_order_not_the_id_order(self, played, client):
        text = client.get("/games/1/export.csv").text

        assert "Round,ben,ana" in text

    def test_it_offers_a_filename(self, played, client):
        header = client.get("/games/1/export.csv").headers["content-disposition"]

        assert "parvis-game-1-" in header
        assert header.endswith('.csv"')

    def test_a_game_that_is_not_there_is_a_404(self, roster, client):
        assert client.get("/games/99/export.csv").status_code == 404

    def test_a_game_survives_the_round_trip(self, played, client):
        """
        Export, import, and the second game is the first one again. This is
        what keeps the two halves of the format honest about each other.
        """
        exported = client.get("/games/1/export.csv").text

        body = post(client, exported).json()

        again = played.query(Game).filter(Game.id == body["game_id"]).one()
        assert again.total_rounds == 2
        assert again.location == "hytta"

        seats = {gp.seat: gp.player_id for gp in
                 played.query(GamePlayer)
                 .filter(GamePlayer.game_id == again.id).all()}
        assert seats == {0: 2, 1: 1}

        rounds = {(r.player_id, r.round_number): (r.bet, r.success, r.score)
                  for r in played.query(Round).filter(Round.game_id == again.id).all()}
        assert rounds == {(2, 1): (1, True, 11), (1, 1): (0, False, 0)}

    def test_a_game_recorded_before_seating_existed_does_not_stack_up_in_one_column(
        self, roster, client
    ):
        """
        The seat column defaults to zero, so an old game has everybody in seat
        zero. Writing that out literally would put every player in the first
        column and lose the rest.
        """
        roster.add(Game(id=2, total_rounds=1, current_round=1))
        roster.add(GamePlayer(game_id=2, player_id=1, seat=0))
        roster.add(GamePlayer(game_id=2, player_id=2, seat=0))
        roster.add(Round(game_id=2, round_number=1, player_id=1,
                         bet=1, success=True, score=11))
        roster.add(Round(game_id=2, round_number=1, player_id=2,
                         bet=0, success=True, score=10))
        roster.commit()

        text = client.get("/games/2/export.csv").text

        assert "Round,ana,ben" in text
        assert parse_game_csv(text).totals == [11, 10]
