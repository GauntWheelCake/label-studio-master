import os
import sys
import colorama
import logging
import urllib.request


logger = logging.getLogger('main')


def start_fix():
    # Disabled for intranet deployment — SQLite DLL must be pre-installed
    print(colorama.Fore.LIGHTRED_EX + "SQLite version too old. Please upgrade Python or install sqlite3.dll manually.")
    print(colorama.Fore.WHITE)
    exit()


def windows_dll_fix():
    """ Copy sqlite.dll to the current directory and use it """
    auto_agree = any([a == '--agree-fix-sqlite' for a in sys.argv])
    force_fix = any([a == '--force-fix-sqlite' for a in sys.argv])

    # check if it is not on windows
    if sys.platform != 'win32':
        return
    print(f'Current platform is {sys.platform}, apply sqlite fix')

    # set env
    import ctypes
    path_to_dll = os.path.abspath('.')
    os.environ['PATH'] = path_to_dll + os.pathsep + os.environ['PATH']
    try:
        ctypes.CDLL(os.path.join(path_to_dll, 'sqlite3.dll'))
        print('Add current directory to PATH for DLL search: ' + path_to_dll)
    except OSError:
        print("Can't load sqlite3.dll from current directory")

    # check sqlite version
    import sqlite3
    v = sqlite3.sqlite_version_info
    if v[0] >= 3 and v[1] >= 35 and not force_fix:
        return

    # check python version and warn
    print(f'python version: {sys.version_info.major} sqlite minor version: {sys.version_info.minor}')
    if sys.version_info.major == 3 and sys.version_info.minor in [6, 7, 8]:
        print('\n' + colorama.Fore.LIGHTYELLOW_EX +
              'You are on ' +
              colorama.Fore.LIGHTRED_EX +
              f'Windows Python {sys.version_info.major}.{sys.version_info.minor}.\n' +
              colorama.Fore.LIGHTYELLOW_EX +
              f"This Python version uses SQLite "
              f"{colorama.Fore.LIGHTRED_EX}{v[0]}.{v[1]}.{v[2]} " +
              colorama.Fore.LIGHTYELLOW_EX +
              f"which does not support JSON Field.\n" +
              'Please upgrade Python to 3.9+ or manually install sqlite3.dll >= 3.35.0.')

    print(colorama.Fore.WHITE)
