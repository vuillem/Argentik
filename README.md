# Argentik

Argentik  
Application web expérimentale pour tirage argentique depuis smartphone

---

### Présentation

Argentik est une application web qui transforme un smartphone ou une tablette en source lumineuse contrôlée pour réaliser des tirages argentiques par contact.

L’utilisateur affiche un négatif numérique sur l’écran du téléphone et place directement le papier photographique dessus. L’écran sert alors de source d’exposition. L’application permet de contrôler précisément les temps d’exposition et de reproduire les étapes classiques de travail en chambre noire.

Le projet a été développé dans un contexte pédagogique pour l’enseignement de la photographie argentique. L’objectif est de proposer un outil simple et accessible permettant d’explorer les relations entre image numérique et tirage chimique, sans agrandisseur.


---

### Logique de travail : bandes test avant tirage final

Comme dans un flux de tirage classique sous agrandisseur, Argentik est conçu pour commencer par la réalisation de bandes test.

Les bandes test permettent de déterminer le temps d’exposition correct avant de réaliser un tirage complet. Cette étape est fondamentale en photographie argentique car la réaction du papier à la lumière dépend de nombreux facteurs : densité du négatif, contraste de l’image et type de papier.

Dans Argentik, le mode bande test :

- divise l’image en plusieurs bandes,
- expose chaque bande avec un temps différent,
- affiche sur chaque bande le temps d’exposition utilisé.

Les paramètres configurables sont :

- temps de référence
- incrément de temps
- nombre de bandes

Cela permet de générer rapidement une échelle d’exposition sur un seul tirage test.

Une fois la bande test développée et observée, l’utilisateur peut déterminer le temps optimal puis lancer une exposition intégrale de l’image.


---

### Exposition intégrale

Après avoir identifié le temps d’exposition correct, l’utilisateur peut lancer une exposition complète de l’image.

Le déroulement de l’exposition est pensé pour un usage en chambre noire :

1. un temps d’écran noir précède l’exposition afin de laisser le temps de positionner le papier,
2. le négatif est affiché pendant la durée d’exposition programmée,
3. un double signal sonore indique la fin de l’exposition,
4. l’écran repasse ensuite au noir.

Ce fonctionnement permet de manipuler le papier photographique dans l’obscurité sans risque d’exposition accidentelle.


---

### Présets de contraste

Argentik propose plusieurs présets de contraste permettant d’adapter le rendu du négatif numérique avant l’exposition.

Ces présets modifient la courbe tonale de l’image afin de faciliter l’adaptation à différents types de papier photographique ou à des négatifs présentant des contrastes variés.

L’objectif est d’aider l’utilisateur à obtenir plus rapidement un rendu satisfaisant lors des premières bandes test.



---

### Repérage des temps d’exposition

Dans le mode bande test, les temps d’exposition sont affichés directement sur chaque bande.

Le texte est automatiquement inversé afin qu’il apparaisse lisible sur le tirage final après exposition. Les cartouches sont dimensionnés pour rester dans la zone de la bande et éviter toute interférence avec l’image.

---

### Manipulation de l’image

Plusieurs fonctions permettent d’adapter l’image au tirage par contact :

- rotation de l’image  
- miroir horizontal  
- ajustement du cadrage  
- affichage plein écran

Ces fonctions permettent d’utiliser le smartphone dans différentes positions sous le papier photographique.


---

### Limitation actuelle

Dans la version actuelle, la barre supérieure du smartphone (heure, batterie, notifications) n’est pas masquée automatiquement. Cette zone peut émettre une lumière parasite pendant l’exposition.

Une solution simple consiste à couvrir cette partie de l’écran avec un ruban opaque (par exemple du gaffer noir). 

---

### Objectif du projet

Argentik vise à :

- proposer un outil pédagogique pour la photographie argentique,
- explorer des méthodes hybrides entre image numérique et tirage chimique,
- permettre la réalisation de tirages sans agrandisseur,
- expérimenter des flux de travail simples et reproductibles.



---

### État du projet

Argentik est actuellement en phase de test auprès d’utilisateurs. Les retours servent à améliorer :

- l’ergonomie de l’interface,
- la précision des temps d’exposition,
- le mode bande test,
- la compatibilité avec différents smartphones.

Les suggestions et contributions sont les bienvenus. 