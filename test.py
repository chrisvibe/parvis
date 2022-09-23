import sys
import numpy as np
import matplotlib.pyplot as plt
import signal

def test():
    def handle_key(event):
        if event.key in "eEqQ":
        #if event.key in "ctrl+c":
            nonlocal show
            show = False
            print("Stop on key press")
            return False

    def handle_close(event):
        nonlocal show
        show = False
        print("Stop on close")

    show = True
    t = np.linspace(0, np.pi, 100)
    fig, ax = plt.subplots()
    fig.canvas.mpl_connect("key_release_event", handle_key)
    fig.canvas.mpl_connect("close_event", handle_close)
    for i in np.linspace(1,10,101):
        if show:
            try:
                ax.clear()
                ax.plot(t, np.sin(i*t))
                # Return values of waitforbuttonpress():
                #   - True if key was pressed
                #   - False if mouse button was pressed
                #   - (None if timeout was reached without event)
                fig.canvas.draw()
                while not fig.waitforbuttonpress() and show:
                    pass
                fig.canvas.flush_events()
            except KeyboardInterrupt:
                print("Stop on interrupt")
                show = False
    plt.close(fig)
    print("Exit normally")

def test2():
    show = True
    t = np.linspace(0, np.pi, 100)
    fig, ax = plt.subplots()
    plt.show(block=False)
    for i in np.linspace(1,10,101):
        if show:
            try:
                ax.clear()
                ax.plot(t, np.sin(i*t))
                fig.canvas.draw()
                fig.canvas.flush_events()
            except KeyboardInterrupt:
                print("Stop on interrupt")
                plt.close(fig)
                # show = False
    plt.close(fig)
    print("Exit normally")


def signal_term_handler(signal, frame):
  '''Handles KeyboardInterrupts to ensure smooth exit'''
  print('User Keyboard interrupt')
  sys.exit(0)

signal.signal(signal.SIGINT, signal_term_handler)
# signal.signal(signal.SIGINT, signal.SIG_DFL)
test2()
