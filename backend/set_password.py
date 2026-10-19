"""
Set or change the password for the InstaStudio AI web app.

    python set_password.py

The password is stored as a salted hash in auth.json (never in plain text). Run this on the server before
putting the app online. Setting a new password signs out every browser that was signed in.
"""
import getpass
import sys

import auth


def main():
    print("Set the InstaStudio AI password (at least %d characters)." % auth.MIN_PASSWORD_LENGTH)
    first = getpass.getpass("New password: ")
    if len(first) < auth.MIN_PASSWORD_LENGTH:
        sys.exit("Too short. Use at least %d characters." % auth.MIN_PASSWORD_LENGTH)
    if getpass.getpass("Repeat it:    ") != first:
        sys.exit("The two passwords do not match. Nothing was changed.")
    auth.set_password(first)
    print("Done. Saved to", auth.AUTH_FILE)


if __name__ == "__main__":
    main()
