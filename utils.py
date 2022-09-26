from os import system, name
from pynput.keyboard import Listener, Key

def clear_screen():
    if name == 'nt':
        system('cls')
    else:
        system('clear')

def test_on_press(key):
    try:  # alphanumeric keys
        global user_input
        user_input += key.char
    except AttributeError:  # special keys
        if key == Key.backspace: 
            user_input = user_input[:-1]
    clear_screen()
    print(user_input)

def test_on_release(key):
    if key == Key.enter and user_input or key == Key.esc: 
        return False  # Stop listener

def handle_live_alphanumeric_input(on_press, on_release):
    with Listener(on_press=on_press, on_release=on_release, suppress=True) as listener:
        global user_input
        user_input = ''
        listener.join()
    return user_input


if __name__ == "__main__":
    print(handle_live_alphanumeric_input(test_on_press, test_on_release))
