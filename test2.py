from pynput.keyboard import Listener, Key
from utils import clear_screen

def on_press(key):
    global search_string
    try:  # alphanumeric keys
        search_string += key.char
    except AttributeError:  # special keys
        if key == Key.backspace: 
            search_string = search_string[:-1]
    clear_screen()
    print(search_string)

def on_release(key):
    if key == Key.enter and search_string or key == Key.esc: 
        return False  # Stop listener

with Listener(on_press=on_press, on_release=on_release, suppress=True) as listener:
    global search_string
    search_string = ''
    listener.join()
