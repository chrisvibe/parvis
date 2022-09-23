from os import system, name
import signal
import sys
import numpy as np
from colorama import Fore, Back, Style
from datetime import datetime
import json
import matplotlib.pyplot as plt


def get_game_config():
    config = dict() 

    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    config['save_path'] = './parvis_{}.csv'.format(timestamp)
    prompt = 'enter number of rounds: '
    config['rounds'] = int(get_config_data(prompt))
    prompt = 'enter number of players: '
    config['players'] = int(get_config_data(prompt))
    return config

def get_config_data(prompt):
    resp = '' 
    while not resp:
        resp = input(prompt)
    return resp 

def parvis(config, players):
    bet_array = np.zeros(shape=(config['rounds'], config['players']), dtype=int)
    bet_mask = np.zeros(shape=(config['rounds'], config['players']), dtype=bool)
    data = bet_mask * (bet_array + 10)
    print_table(config, players, data, 0)
    fig = setup_plot()
    try:
        for i in range(config['rounds']):
            bet_array[i] = get_bets(config)
            bet_mask[i] = get_bet_status(config)
            data = bet_mask * (bet_array + 10)
            print_table(config, players, data, i + 1)
            update_plot(fig, players, data[:i+1])
        save_game(config, players, data)
    finally:
        plt.ioff()
        plt.close(fig)
    input('press any key to exit...')

def get_player_data(config, prompt, map_func):
    # input format: data per player separated by spaces
    data = []
    success = False
    while not success:
        try:
            resp = input(prompt)
        except KeyboardInterrupt:
            sys.exit(0)
        data = list(map(map_func, resp.strip().split(' ')))
        success = len(data) == config['players']
        if not success:
            print('entry count ({}) must match the number of players ({})'.format(len(data), config['players']))
    return data

def get_bets(config):
    prompt = 'enter bets (numbers separated by spaces): '
    data = get_player_data(config, prompt, int) 
    return np.array(data, dtype=int)

def get_players(config):
    prompt = 'enter players (names separated by spaces): '
    return get_player_data(config, prompt, str) 

def get_bet_status(config):
    prompt = 'enter bet status (1/0 separated by spaces): '
    data = get_player_data(config, prompt, str2bool) 
    return np.array(data, dtype=bool)

def str2bool(string):
    return string.lower() not in ['0', 'false', ' ', 'n']

def print_table(config, players, data, rows):
    col_width = max(map(len, players))
    players = [p.ljust(col_width, ' ') for p in players]
    priority = rows % len(players)
    players[priority] = Fore.RED + players[priority] + Fore.RESET
    table_width = (col_width + 3) * len(players) + 5
    clear_screen()
    print('round | ' + ' | '.join(players))
    print('-'*table_width)
    for i in range(rows):
        row = data[i]
        row = map(lambda s: str(s).ljust(col_width, ' '), row)
        row_str = str(i + 1).ljust(5, ' ') + ' | '
        row_str += ' | '.join(row)
        print(row_str)
        print('-'*table_width)

    total = np.sum(data, axis=0)
    total = map(lambda s: str(s).ljust(col_width, ' '), total)
    print('total | ' + ' | '.join(total))
    print('-'*table_width)
    print()

def clear_screen():
    if name == 'nt':
        system('cls')
    else:
        system('clear')

def save_game(config, players, data):
    with open(config['save_path'], 'w') as f:
        # save meta data
        json.dump(config, f, indent=2)
        f.write('\n')
        json.dump({'players': players}, f, indent=2)
        f.write('\n')
        f.write(np.array2string(data) + '\n')

def setup_plot():
    fig = plt.figure(1)
    plt.subplot(111)
    plt.tight_layout()
    plt.ion()
    plt.show(block=False)
    return fig

def update_plot(fig, players, data):
    ax = fig.gca()
    ax.clear()
    ax.plot(np.arange(1, len(data)+1), data)
    ax.legend(labels=players)
    ax.set_xlim([0, len(data)])
    fig.canvas.draw()
    fig.canvas.flush_events()
    plt.pause(1/1000)

from db_parvis import *
def add_new_player(con):
    # TODO
    alias = input('enter player alias: ').strip()
    if alias in  
    add_player()
    

if __name__ == '__main__':
    # allow keyboardinterrupt during user input
    signal.signal(signal.SIGINT, signal.SIG_DFL)
    config = get_game_config()
    players = get_players(config)
    parvis(config, players)
