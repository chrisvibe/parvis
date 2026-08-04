"""
Player service layer for Parvis.

Handles player creation, updates, and statistics.
"""

from sqlalchemy import func, or_
from sqlalchemy.orm import Session
from typing import Dict, Iterable, List, Optional, Set
from fastapi import HTTPException

from database import Game, GamePlayer, Player, Round, player_partners
from models import PlayerCreate, PlayerStats
from utils import (
    get_player_or_404,
    get_player_by_alias,
    aggregate_rounds,
    bet_histogram,
    games_finished,
    lifetime_rounds
)


# Fields on PlayerCreate that are relationships rather than columns, and so
# must be kept away from the Player constructor and from setattr.
RELATIONSHIP_FIELDS = {'parent_ids', 'child_ids', 'partner_ids'}


class PlayerService:
    """Service for player-related operations."""
    
    def __init__(self, db: Session):
        self.db = db
    
    def get_all_players(self) -> List[Player]:
        """
        Get all players.

        Relationships come along with them: the response model reads
        `parent_ids`, `child_ids` and `partner_ids` straight off the ORM object.

        `games_played` is attached here rather than being a model property
        because it needs a session. One grouped query covers the whole roster —
        the alternative, a stats call per player, is what the family tree would
        otherwise have to do to label a node.

        Returns:
            List of Player instances
        """
        players = self.db.query(Player).all()

        counts = dict(
            self.db.query(GamePlayer.player_id, func.count(GamePlayer.game_id))
            .join(Game, GamePlayer.game_id == Game.id)
            .filter(Game.is_valid.is_(True))
            .group_by(GamePlayer.player_id)
            .all()
        )

        for player in players:
            player.games_played = counts.get(player.id, 0)

        return players
    
    def get_player(self, player_id: int) -> Player:
        """
        Get a specific player by ID.
        
        Args:
            player_id: ID of the player
            
        Returns:
            Player instance
        """
        return get_player_or_404(player_id, self.db)
    
    def create_player(self, player_data: PlayerCreate) -> Player:
        """
        Create a new player.
        
        Args:
            player_data: Player creation data
            
        Returns:
            Created Player instance
            
        Raises:
            HTTPException: If alias already exists
        """
        # Check if alias exists
        existing = get_player_by_alias(player_data.alias, self.db)
        if existing:
            raise HTTPException(status_code=400, detail="Alias already exists")
        
        # Create the player before wiring anything up: the relationships all
        # need an id to point at.
        player_dict = player_data.model_dump(exclude=RELATIONSHIP_FIELDS)
        db_player = Player(**player_dict)
        self.db.add(db_player)
        self.db.flush()  # Get the ID without committing

        self._apply_relationships(db_player, player_data)

        self.db.commit()
        self.db.refresh(db_player)
        return db_player
    
    def update_player(self, player_id: int, player_data: PlayerCreate) -> Player:
        """
        Update an existing player.
        
        Args:
            player_id: ID of the player to update
            player_data: New player data
            
        Returns:
            Updated Player instance
            
        Raises:
            HTTPException: If new alias conflicts with another player
        """
        db_player = get_player_or_404(player_id, self.db)
        
        # Check if new alias conflicts with another player
        if player_data.alias != db_player.alias:
            existing = get_player_by_alias(player_data.alias, self.db)
            if existing:
                raise HTTPException(status_code=400, detail="Alias already exists")
        
        # Update basic fields
        for key, value in player_data.model_dump(exclude=RELATIONSHIP_FIELDS).items():
            setattr(db_player, key, value)

        self._apply_relationships(db_player, player_data)

        self.db.commit()
        self.db.refresh(db_player)
        return db_player

    # ------------------------------------------------------------------
    # Relationships
    # ------------------------------------------------------------------

    def _apply_relationships(self, db_player: Player, player_data: PlayerCreate) -> None:
        """
        Replace this player's relationships with the ones given.

        Each of the three lists is the complete set for that relationship, not
        an addition, so removing someone means sending the list without them.
        A list that was not sent at all is left as it is — see PlayerCreate.

        Validation then runs against the state the request would produce, not
        against the fields it happened to mention: a contradiction between a new
        parent and an existing partner is still a contradiction.

        Everything is validated before anything is written: a request that is
        half legal must not leave the tree half rewired.
        """
        parent_ids = self._resolve(player_data.parent_ids, db_player.parent_ids)
        child_ids = self._resolve(player_data.child_ids, db_player.child_ids)
        partner_ids = self._resolve(player_data.partner_ids, db_player.partner_ids)

        self._reject_impossible_relationships(
            db_player.id, parent_ids, child_ids, partner_ids
        )

        self._set_parents(db_player, parent_ids)
        self._set_children(db_player, child_ids)
        self._set_partners(db_player, partner_ids)

    def _resolve(self, given: Optional[Iterable[int]], current: List[int]) -> List[int]:
        """What this relationship will be: the list given, or what it already is."""
        return list(current) if given is None else self._known_ids(given)

    def _known_ids(self, ids: Iterable[int]) -> List[int]:
        """
        The given ids that actually exist, de-duplicated, order preserved.

        Unknown ids are dropped rather than refused, which is what this has
        always done — a stale id from a page that was open while someone else
        deleted a player should not fail the whole save.
        """
        wanted = list(dict.fromkeys(ids or []))
        if not wanted:
            return []

        existing = {
            row.id for row in
            self.db.query(Player.id).filter(Player.id.in_(wanted)).all()
        }
        return [i for i in wanted if i in existing]

    def _set_parents(self, db_player: Player, parent_ids: List[int]) -> None:
        db_player.parents.clear()
        for parent_id in parent_ids:
            db_player.parents.append(
                self.db.query(Player).filter(Player.id == parent_id).first()
            )

    def _set_children(self, db_player: Player, child_ids: List[int]) -> None:
        """
        Set who has this player as a parent.

        The same table as _set_parents, written from the other side: "X is my
        child" and "I am X's parent" are one fact, so there is one place it
        lives.
        """
        db_player.children.clear()
        for child_id in child_ids:
            db_player.children.append(
                self.db.query(Player).filter(Player.id == child_id).first()
            )

    def _set_partners(self, db_player: Player, partner_ids: List[int]) -> None:
        """
        Set this player's partners.

        Written as plain inserts rather than through a relationship because the
        pair is stored canonically (lower id first) and only one row exists per
        couple — an ORM collection on one side would happily write the mirror
        row too.
        """
        self.db.execute(
            player_partners.delete().where(
                or_(
                    player_partners.c.player_a_id == db_player.id,
                    player_partners.c.player_b_id == db_player.id,
                )
            )
        )

        for partner_id in partner_ids:
            low, high = sorted((db_player.id, partner_id))
            self.db.execute(
                player_partners.insert().values(player_a_id=low, player_b_id=high)
            )

    def _reject_impossible_relationships(
        self,
        player_id: int,
        parent_ids: List[int],
        child_ids: List[int],
        partner_ids: List[int],
    ) -> None:
        """
        Refuse relationships that cannot be true, before any of them are stored.

        Three kinds of nonsense:

        1. A player related to themselves.
        2. The same person as both parent and child, or a partner who is also a
           parent or child. These are contradictions rather than unusual
           families, and storing one gives the tree two incompatible places to
           draw the same person.
        3. A cycle. The API used to accept A as a parent of B *and* B as a
           parent of A; the tree renderer then recursed until the tab died — a
           white page with no way back, from data the API had happily stored.
           The frontend only ever blocked the one-step case.

        Raises:
            HTTPException: 400, naming which rule was broken
        """
        for label, ids in (
            ("parent", parent_ids), ("child", child_ids), ("partner", partner_ids)
        ):
            if player_id in ids:
                raise HTTPException(
                    status_code=400,
                    detail=f"A player cannot be their own {label}.",
                )

        both = set(parent_ids) & set(child_ids)
        if both:
            raise HTTPException(
                status_code=400,
                detail="The same player cannot be both a parent and a child.",
            )

        blood = set(parent_ids) | set(child_ids)
        if set(partner_ids) & blood:
            raise HTTPException(
                status_code=400,
                detail="A partner cannot also be a parent or a child.",
            )

        self._reject_parent_cycles(player_id, parent_ids, child_ids)

    def _reject_parent_cycles(
        self, player_id: int, parent_ids: List[int], child_ids: List[int]
    ) -> None:
        """
        Refuse an assignment that would make the family tree circular.

        Every edge points from a child up to a parent, so a loop through this
        player is exactly: walk up from one of the proposed parents and arrive
        back at the player. Nothing else can close a ring, because this request
        only changes edges that touch this player.

        The walk uses the *proposed* edges where they differ from what is
        stored, so rewiring a parent and a child in one request is judged on
        what the tree would become, not on what it currently is. Judging it on
        the stored edges would refuse legal rearrangements.

        Raises:
            HTTPException: 400 if the assignment would close a loop
        """
        pending = list(parent_ids)
        seen: Set[int] = set()

        while pending:
            node_id = pending.pop()
            if node_id == player_id:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "That would make the family tree circular — the player "
                        "is already an ancestor of one of these parents."
                    ),
                )
            if node_id in seen:
                continue
            seen.add(node_id)

            pending.extend(
                self._effective_parents(node_id, player_id, child_ids)
            )

    def _effective_parents(
        self, node_id: int, player_id: int, child_ids: List[int]
    ) -> Set[int]:
        """
        Who `node_id`'s parents would be once this request is applied.

        Only edges into `player_id` can differ from what is stored: the request
        replaces the whole set of this player's children, so a stored child not
        in the new list loses that edge, and a new one gains it.
        """
        node = self.db.query(Player).filter(Player.id == node_id).first()
        parents = {p.id for p in node.parents} if node else set()

        parents.discard(player_id)
        if node_id in child_ids:
            parents.add(player_id)

        return parents

    def delete_player(self, player_id: int) -> None:
        """
        Delete a player who has no game history.

        rounds.player_id is NOT NULL, so SQLAlchemy's default "null out the
        child rows" on delete raises an IntegrityError and the request dies as a
        500 with nothing useful in it. A player who has played is not deletable,
        which is a conflict with the current state, not a server fault — so say
        so, and say which games are in the way.

        Args:
            player_id: ID of the player to delete

        Raises:
            HTTPException: 409 if the player has game history
        """
        player = get_player_or_404(player_id, self.db)

        game_ids = sorted({
            r.game_id for r in self.db.query(Round.game_id)
            .filter(Round.player_id == player_id).distinct()
        } | {
            gp.game_id for gp in self.db.query(GamePlayer.game_id)
            .filter(GamePlayer.player_id == player_id).distinct()
        })

        if game_ids:
            shown = ", ".join(str(g) for g in game_ids[:5])
            more = f" and {len(game_ids) - 5} more" if len(game_ids) > 5 else ""
            raise HTTPException(
                status_code=409,
                detail=(
                    f"{player.alias} has played in {len(game_ids)} game(s) "
                    f"({shown}{more}) and cannot be deleted. Delete those games "
                    f"first if this player really should be removed."
                ),
            )

        # The partner rows are viewonly to the ORM, so nothing removes them on
        # delete and the foreign key stops the delete dead. Parent and child
        # rows are managed relationships and go on their own.
        self.db.execute(
            player_partners.delete().where(
                or_(
                    player_partners.c.player_a_id == player_id,
                    player_partners.c.player_b_id == player_id,
                )
            )
        )

        self.db.delete(player)
        self.db.commit()
    
    def get_player_family(self, player_id: int) -> Dict:
        """
        Get player with parent and child relationships.
        
        Args:
            player_id: ID of the player
            
        Returns:
            Dictionary with player family structure
        """
        player = get_player_or_404(player_id, self.db)
        
        return {
            "id": player.id,
            "alias": player.alias,
            "parent_ids": player.parent_ids,
            "child_ids": player.child_ids,
            "partner_ids": player.partner_ids,
        }
    
    def get_player_stats(self, player_id: int) -> PlayerStats:
        """
        Get lifetime statistics for a player across their finished games.

        Counts finished games only, and only rounds within each game's declared
        length — see utils/stats.py for the rules. These totals are the sum of
        the player's per-game figures, so the two pages agree.

        Args:
            player_id: ID of the player

        Returns:
            PlayerStats with aggregated statistics
        """
        player = get_player_or_404(player_id, self.db)

        totals = aggregate_rounds(lifetime_rounds(self.db, player_id).all())

        return PlayerStats(
            player_id=player_id,
            player_alias=player.alias,
            games_played=games_finished(self.db, player_id),
            total_rounds=totals.rounds_played,
            total_score=totals.total_score,
            successful_bets=totals.successful_bets,
            failed_bets=totals.failed_bets,
            average_bet=totals.average_bet,
            win_rate=totals.win_rate
        )

    def get_bet_distribution(self, player_id: int) -> List[Dict]:
        """
        Get histogram data of player's bets.

        Drawn from the same rounds as get_player_stats, so the histogram adds
        up to the player's total_rounds.

        Args:
            player_id: ID of the player

        Returns:
            List of dictionaries with bet amounts and counts
        """
        return bet_histogram(lifetime_rounds(self.db, player_id).all())
