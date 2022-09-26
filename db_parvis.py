import sqlite3
from sqlite3 import Error
import datetime
from utils import clear_screen, handle_live_alphanumeric_input
from pynput.keyboard import Listener, Key
import os
import re

class SQLite():
    def __init__(self, file=':memory:', check_same_thread=True):
        self.file=file
        self.check_same_thread=check_same_thread
    def __enter__(self):
        self.conn = sqlite3.connect(self.file, check_same_thread=self.check_same_thread)
        self.conn.row_factory = sqlite3.Row
        return self.conn.cursor()
    def __exit__(self, type, value, traceback):
        self.conn.commit()
        self.conn.close()

def make_tables(db_path):
    with SQLite(db_path) as cursor:
        cursor.execute( \
            'CREATE TABLE Players( \
                alias text, \
                first text, \
                middle text, \
                last text, \
                birthdate date, \
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

def sql_update(db_path):
    with SQLite(db_path) as cursor:
        cursor.execute('UPDATE employees SET name = "Rogers" where id = 2')

def strip_lower(s):
    return s.strip().lower() if s else None

def remove_extra_spaces(old_string, sentence_enders='.!?\n'):
    if old_string:
        s = old_string
        s = re.sub(r'[ \t][ \t]+', ' ', s)  # remove repeated spaces
        s = re.sub(r'([{0}]+)[ \t]+([{0}]+)'.format(sentence_enders), r'\1\2', s)  # remove spaces between sentence enders
        s = re.sub(r'[ \t]*\n[ \t]*', '\n', s)  # remove spaces before and after new lines
        if s == old_string:
            return s.strip()
        else:
            return remove_extra_spaces(s, sentence_enders)
    else:
        return old_string

def add_player(cursor, player_info):
    registration_date = datetime.datetime.now().date()
    alias = player_info['alias']
    (first, middle, last) = player_info['names']
    birthdate = player_info['birthdate']
    alias = remove_extra_spaces(alias)
    first, middle, last = map(strip_lower, [first, middle, last])
    birthdate = datetime.datetime(*birthdate).date()
    player_tuple = alias, first, middle, last, birthdate, registration_date

    try:
        cursor.execute( \
            'INSERT INTO Players( \
                alias, first, middle, last, birthdate, registrationDate) \
                VALUES(?, ?, ?, ?, ?, ?) \
            ;', player_tuple)
    except sqlite3.IntegrityError as e:
        print('database integity error!')
        if alias_exists(cursor, alias):
            print('the alias is taken!')
            print('taken aliases:')
            print(get_all_player_aliases(cursor))
        raise e
        
def add_game(db_path, player_ids):
    game_date = datetime.datetime.now().date()
    # TODO accept values other than player_ids
    values = None, 'test type', game_date, 'some notes', 'todo how to log hosts', 'an adress'
    with SQLite(db_path) as cursor:
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
    return current_game 

def get_all_player_aliases(cursor):
    cursor.row_factory = lambda cursor, row: row[0]
    cursor.execute('SELECT alias FROM Players')
    rows = cursor.fetchall()
    return rows

def alias_exists(cursor, alias):
    cursor.execute('SELECT EXISTS(SELECT 1 FROM Players WHERE alias = ?)', [alias])
    [exists] = cursor.fetchone()
    return exists 

def get_games(cursor):
    cursor.execute('SELECT * FROM Games')
    rows = cursor.fetchall()
    return rows

def get_players_in_game(cursor, game_id):
    cursor.row_factory = lambda cursor, row: row[1]
    cursor.execute('SELECT * FROM GamePlayers where gameId = ?', str(game_id))
    rows = cursor.fetchall()
    return rows

def alias_helper(db_path):
    global user_input
    user_input = ''
    with SQLite(db_path, check_same_thread=False) as cursor:
        on_press = lambda event: alias_helper_on_press(event, cursor)
        with Listener(on_press=on_press, on_release=alias_helper_on_release, suppress=True) as listener:
            alias_helper_on_press_msg(user_input)
            listener.join()
    # TODO check validity of search_string as alias
    return user_input

def alias_helper_on_press(key, cursor):
    clear_screen()
    try:  # alphanumeric keys
        global user_input
        user_input += key.char
    except AttributeError:  # special keys
        if key == Key.backspace: 
            user_input = user_input[:-1]
    alias_helper_on_press_msg(user_input)
    cursor.execute('SELECT alias FROM Players WHERE alias LIKE ? LIMIT 10', ['%' + user_input + '%'])
    rows = cursor.fetchall()
    for row in rows:
        print(row[0])

def alias_helper_on_press_msg(user_input):
    print('Enter a unique alias: {}'.format(user_input))

def alias_helper_on_release(key):
    if key == Key.enter and user_input: 
        return False  # Stop listener

def add_player_walkthrough(db_path):
    global success
    success = False
    while not success:
        alias = alias_helper(db_path)
        names = remove_extra_spaces(input('enter full name: ')).split(' ')
        first = middle = last = ''
        if len(names) == 3:
            first, middle, last = names
        elif len(names) == 2:
            first, last = names
        elif len(names) == 1:
            first = names
        birthdate = input('enter birthdate DD/MM/YYYY: ')
        day, month, year = map(int, birthdate.split('/'))
        player_info = {
                'alias': alias,
                'names': (first, middle, last),
                'birthdate': (year, month, day),
                }
        on_press = lambda key: add_player_walkthrough_on_press(key, player_info)
        with Listener(on_press=on_press, suppress=True) as listener:
            listener.join()
    with SQLite(db_path, check_same_thread=False) as cursor:
        add_player(cursor, player_info)

def add_player_walkthrough_on_press(key, player_info):
    print('alias: {}'.format(player_info['alias']))
    print('full name: {}'.format(' '.join(filter(lambda x: bool(x), player_info['names']))))
    print('birthdate DD/MM/YYYY: {}'.format('/'.join(map(str, player_info['birthdate']))))
    print('press "enter" if info is correct, press "esc" to try egain')
    if key == Key.enter:
        global success
        success = True
        return False

def test_db():
    db_path = 'test.db'
    try:
        os.remove(db_path)
    except OSError:
        pass
    make_tables(db_path)
    players = test_add_players(db_path)
    test_add_player_walkthrough(db_path)
    test_add_game(db_path, players)

def test_add_players(db_path):
    players = [
        {
        'alias': 'katt',
        'names': ('Christopher', 'Michael', 'Vibe'),
        'birthdate': (1993, 12, 4),
        },
        {
        'alias': 'rabb',
        'names': ('Michael', 'Olav', 'Vibe'),
        'birthdate': (2000, 2, 23),
        },
        {
        'alias': 'snail',
        'names': ('Person', None, 'Unknown'),
        'birthdate': (1990, 3, 19),
        },
        ]

    with SQLite(db_path) as cursor:
        for player in players:
            assert not alias_exists(cursor, player['alias'])
            add_player(cursor, player)

        for player in players:
            assert alias_exists(cursor, player['alias'])

    return list(map(lambda p: p['alias'], players))

def test_add_player_walkthrough(db_path):
    add_player_walkthrough(db_path)

def test_add_game(db_path, players):
    players_game0 = players[:-1]
    players_game1 = players[1:]
    game0_id = add_game(db_path, players_game0)
    game1_id = add_game(db_path, players_game1)
    games = [1, 2]

    with SQLite(db_path) as cursor:
        assert set(get_all_player_aliases(cursor)) == set(players)
        assert set(get_games(cursor)) == set(games)
        assert set(get_players_in_game(cursor, game0_id)) == set(players_game0)
        assert set(get_players_in_game(cursor, game1_id)) == set(players_game1)

def test_change_player_alias():
    # TODO implement
    pass

def test_delete_player():
    # TODO implement
    pass

if __name__ == '__main__':
    test_db()
