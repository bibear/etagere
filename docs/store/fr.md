# Étagère — fiche store (français)

## App name (30)

Étagère : livres de la maison

## Subtitle (App Store, 30)

La bibliothèque du foyer

## Short description (Google Play, 80)

Les livres de la maison, partagés par tous les téléphones du foyer. Sans compte.

## Promotional text (App Store, 170)

Scanne un livre pour l'ajouter, vois qui lit quoi, lis ce que la famille en a pensé. Ta
bibliothèque reste à la maison : pas de compte, pas de cloud.

## Keywords (App Store, 100)

livres,bibliothèque,étagère,famille,foyer,lecture,isbn,scanner,catalogue,prêt,avis,maison

## Description (4000)

Étagère, c'est la bibliothèque de la maison, partagée entre tous les téléphones du foyer.

SCANNE POUR AJOUTER
Vise le code-barres au dos d'un livre : titre, auteurs et couverture sont trouvés pour toi, un
geste suffit pour le ranger sur l'étagère. Pas de code-barres ? Saisis-le à la main.

QUI L'A ?
Chaque livre indique d'un coup d'œil s'il est libre, en cours de lecture et par qui, ou prêté à
un ami. Commence un livre et il est à toi jusqu'à ce que tu le finisses ou le reposes : personne
ne le cherche pour rien.

LES AVIS DE LA MAISON
Dis ce que tu as pensé d'un livre ; les autres le lisent sur sa fiche avant de se lancer.

MES LECTURES
Ce que tu lis en ce moment et tous les livres que tu as terminés.

POUR TOI
Des livres déjà sur l'étagère qui ressemblent à ce que tu as aimé, avec la raison (« même
auteur », « un coup de cœur de la maison »), et des idées de livres à acheter.

TOUT RESTE À LA MAISON
Étagère fonctionne avec un petit serveur gratuit installé sur un ordinateur de la maison (Docker
ou Node.js, quelques minutes, mode d'emploi sur GitHub). Les téléphones lui parlent uniquement
par le Wi-Fi de la maison. Pas de compte, pas de mot de passe, pas de cloud, pas de publicité,
aucun pistage. Les seules requêtes qui sortent de chez toi sont les recherches de livres sur
Open Library et Google Books (seul l'ISBN est envoyé).

LIBRE ET GRATUIT
Étagère est un logiciel libre (AGPL-3.0). Le code, le serveur et la documentation sont sur
GitHub : github.com/bibear/etagere

Nécessite le serveur Étagère sur le réseau de la maison.

## What's new

Première version : scan et ajout de livres, disponibilité et verrou de lecture, prêts, avis de la
maison, mes lectures, recommandations, français et anglais.

## Category

Livres et références (App Store : Livres ; Google Play : Livres et références).

## Contact and links

- URL d'assistance : https://github.com/bibear/etagere/issues
- URL marketing : https://github.com/bibear/etagere
- Politique de confidentialité : https://github.com/bibear/etagere/blob/main/docs/store/privacy.md

## Privacy answers

- App Store « Confidentialité de l'app » : aucune donnée collectée.
- Google Play « Sécurité des données » : aucune donnée collectée ni partagée. Les données restent
  sur le serveur du foyer ; le trafic est local (HTTP sur le réseau de la maison, jamais par
  Internet).
- Caméra : sert uniquement à lire les codes-barres des livres et le QR code du serveur ; aucune
  image n'est enregistrée ni envoyée.
- Classification : 4+ / Tout public (aucun contenu ne sort du foyer).

## Review notes

L'app se connecte à un serveur Étagère sur le réseau local (`npx etagere-server` ou Docker, voir
github.com/bibear/etagere). Sans serveur, le premier écran affiche « Aucune bibliothèque trouvée »
et propose de saisir l'adresse du serveur.
