import sqlite3
from sqlite3 import Error
import datetime

def sql_connection(db_path):
    try:
        con = sqlite3.connect(db_path)
        return con
    except Error:
        print(Error)

def make_tables(con):
    cursor = con.cursor()
    cursor.execute( \
        'CREATE TABLE Players( \
            alias text, \
            first text, \
            middle text, \
            last text, \
            birthday date, \
            registrationDate date, \
            PRIMARY KEY (alias) \
        );')
    cursor.execute( \
        'CREATE TABLE Games( \
            id integer, \
            type text, \
            date date, \
            notes text, \
            hosts text, \
            location text, \
            PRIMARY KEY (id) \
        );')
    cursor.execute( \
        'CREATE TABLE GamePlayers( \
            gameId integer, \
            playerAlias integer, \
            FOREIGN KEY (gameId) REFERENCES Games(id), \
            FOREIGN KEY (playerAlias) REFERENCES Players(alias), \
            PRIMARY KEY (gameId, playerAlias) \
        );')
    cursor.execute( \
        'CREATE TABLE Rounds( \
            gameId integer, \
            round integer,  \
            playerAlias integer, \
            bet integer, \
            success boolean, \
            FOREIGN KEY (gameId) REFERENCES Games(id), \
            FOREIGN KEY (playerAlias) REFERENCES Players(alias), \
            PRIMARY KEY (gameId, playerAlias) \
        );')
    cursor.execute( \
        'CREATE TABLE TournamentGames( \
            id integer, \
            gameId integer, \
            type text, \
            date date, \
            notes text, \
            hosts text, \
            location text, \
            FOREIGN KEY (gameId) REFERENCES Games(id), \
            PRIMARY KEY (id, gameId) \
        );')
    con.commit()

def sql_update(con):
    cursor = con.cursor()
    cursor.execute('UPDATE employees SET name = "Rogers" where id = 2')
    con.commit()

def strip_lower(s):
    return s.strip().lower() if s else None

def add_player(con, values):
    cursor = con.cursor()
    registration_date = datetime.datetime.now().date()
    alias, (first, middle, last), birthday = values
    alias = alias.strip() 
    first, middle, last = map(strip_lower, [first, middle, last])
    birthday = datetime.datetime(*birthday).date()
    values = alias, first, middle, last, birthday, registration_date
    cursor.execute( \
        'INSERT INTO Players( \
            alias, first, middle, last, birthday, registrationDate) \
            VALUES(?, ?, ?, ?, ?, ?) \
        ;', values)

def add_game(con, player_ids):
    cursor = con.cursor()
    game_date = datetime.datetime.now().date()
    values = None, 'test type', game_date, 'some notes', 'todo how to log hosts', 'an adress'
    cursor.execute( \
        'INSERT INTO Games( \
            id, type, date, notes, hosts, location) \
            VALUES(?, ?, ?, ?, ?, ?) \
        ;', values)
    current_game = cursor.lastrowid
    for player_id in player_ids:
        values = current_game, player_id
        cursor.execute( \
            'INSERT INTO GamePlayers( \
                gameId, playerAlias) \
                VALUES(?, ?) \
            ;', values)

def get_all_player_aliases(con):
    cursor = con.cursor()
    cursor.row_factory = lambda cursor, row: row[0]
    cursor.execute('SELECT alias FROM Players')
    rows = cursor.fetchall()
    return rows

def check_alias_is_unique(con, alias):
    # TODO this.


def get_games(con):
    cursor = con.cursor()
    cursor.execute('SELECT * FROM Games')
    rows = cursor.fetchall()
    return rows

def get_players_in_game(con, game_id):
    cursor = con.cursor()
    cursor.row_factory = lambda cursor, row: row[1]
    cursor.execute('SELECT * FROM GamePlayers where gameId = ?', str(game_id))
    rows = cursor.fetchall()
    return rows


if __name__ == '__main__':
    db_path = 'mydatabase.db'
    db_path = ':memory:'
    con = sql_connection(db_path)
    make_tables(con)

    values = 'katt', ('Christopher', 'Michael', 'Vibe'), (1993, 12, 4)
    add_player(con, values)
    values = 'rabb', ('Michael', 'Olav', 'Vibe'), (2000, 2, 23)
    add_player(con, values)
    values = 'anonymous', ('Person', None, 'Unknown'), (1990, 3, 19)
    add_player(con, values)
    print('all players:')
    print(get_all_player_aliases(con))

    players = 'katt', 'rabb'
    add_game(con, players)
    players = 'katt', 'ananonymous'
    add_game(con, players)
    print('all games:')
    print(get_games(con))
    print('all players in game 1:')
    print(get_players_in_game(con, 1))

