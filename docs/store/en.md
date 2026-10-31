# Étagère — store listing (English)

## App name (30)

Étagère: home book library

## Subtitle (App Store, 30)

Your household's shared shelf

## Short description (Google Play, 80)

The books of your home, shared by every phone of the household. No account.

## Promotional text (App Store, 170)

Scan a book to add it, see who is reading what, read what the household thought of it. Your
library stays at home: no account, no cloud.

## Keywords (App Store, 100)

books,library,bookshelf,household,family,reading,isbn,scanner,catalog,lend,reviews,home,offline

## Description (4000)

Étagère is the book library of your home, shared between every phone of the household.

SCAN TO ADD
Point the camera at the barcode on the back of a book: title, authors and cover are found for
you, and one tap adds it to the shelf. No barcode? Type it in.

WHO HAS IT?
Every book shows at a glance whether it is free, being read, and by whom, or lent to a friend.
Start a book and it is yours until you finish it or put it down: nobody looks for it in vain.

THE HOUSEHOLD'S REVIEWS
Say what you thought of a book; the others read it on the book page before they start it.

MY READINGS
What you are reading now and every book you have finished.

FOR YOU
Books already on your shelf that match what you liked, explained ("same author", "a favourite of
the household"), and ideas of books to buy.

IT STAYS AT HOME
Étagère runs on a small free server on a computer of your house (Docker or Node.js, a few
minutes to install, instructions on GitHub). Phones talk to it over the home Wi-Fi only. No
account, no password, no cloud, no ads, no tracking. The only requests that leave your home are
the book lookups on Open Library.

FREE AND OPEN SOURCE
Étagère is free software (AGPL-3.0). The code, the server and the documentation are on
GitHub: github.com/bibear/etagere

Requires the Étagère server on your home network.

## What's new

First release: scan and add books, availability and reading lock, loans, household reviews, my
readings, recommendations, French and English.

## Category

Books & Reference (App Store: Books; Google Play: Books & Reference).

## Contact and links

- Support URL: https://github.com/bibear/etagere/issues
- Marketing URL: https://github.com/bibear/etagere
- Privacy policy URL: https://github.com/bibear/etagere/blob/main/docs/store/privacy.md

## Privacy answers

- App Store "App Privacy": Data Not Collected.
- Google Play "Data safety": no data collected, no data shared. Data stays on the household's own
  server; traffic is local (plain HTTP on the home network, never over the Internet).
- Camera: used only to read book barcodes and the server QR code; no picture is stored or sent.
- Age rating: 4+ / Everyone (no user-generated content leaves the household).

## Review notes

The app connects to an Étagère server on the local network (`npx etagere-server` or Docker,
see github.com/bibear/etagere). Without a server the first screen says "No library found" and
offers to type the server address.
