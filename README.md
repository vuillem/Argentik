# Argentik

Argentik  
Experimental web application for darkroom contact printing from a smartphone

---

### Overview

Argentik is a web application that turns a smartphone or tablet into a controlled light source for producing silver gelatin contact prints.

The user displays a digital negative on the phone’s screen and places photographic paper directly on top of the device. The screen then acts as the exposure light source. The application allows precise control of exposure times and reproduces the basic workflow used in a traditional darkroom.

The project was developed in a pedagogical context for teaching analog photography. Its goal is to provide a simple and accessible tool for exploring the relationship between digital images and chemical printing without requiring a traditional enlarger.

---

### Workflow: test strips before final exposure

As in a traditional enlarger workflow, Argentik is designed to begin with test strips.

Test strips allow the user to determine the correct exposure time before making a full print. This step is essential in darkroom printing because the way photographic paper reacts to light depends on several factors, including the density of the negative, the contrast of the image, and the type of paper.

In Argentik, the test strip mode:

- divides the image into several bands  
- exposes each band with a different exposure time  
- displays the exposure time on each band  

The parameters that can be adjusted are:

- reference exposure time  
- time increment between each band  
- number of bands

This makes it possible to generate a full exposure scale on a single test print.

Once the test strip has been developed and evaluated, the user can determine the optimal exposure time and then proceed to a full image exposure.

---

### Full image exposure

After identifying the correct exposure time, the user can launch a full exposure of the image.

The exposure sequence is designed for darkroom use:

1. a black screen delay occurs before the exposure to allow the user to position the paper  
2. the digital negative appears for the programmed exposure time  
3. a double audio signal indicates that the exposure is finished  
4. the screen returns to black  

This sequence allows the user to work in darkness without needing to look at the screen during exposure.

---

### Contrast presets

Argentik includes several contrast presets that adjust the tonal curve of the digital negative before exposure.

These presets help adapt the image to different types of photographic paper or to negatives with varying contrast levels.

The goal is to make it easier for users to reach a satisfactory result during the first test strips.

---

### Exposure time labels

In test strip mode, exposure times are displayed directly on each band.

The text is automatically mirrored so that it appears correctly readable on the final photographic print after exposure. The label boxes are designed to remain inside each band and avoid overlapping with the image area.

---

### Image manipulation tools

Several tools allow the user to adapt the image for contact printing:

- image rotation  
- horizontal mirror  
- framing adjustments  
- full-screen display  

These functions make it possible to adapt the orientation of the image to the physical position of the smartphone during printing.

---

### Current limitation

In the current version of Argentik, the smartphone’s system status bar (time, battery level, notifications) is not automatically hidden.

This area may emit unwanted light during exposure.

A simple solution is to cover this part of the screen with opaque tape, such as black gaffer tape.

---

### Project goals

Argentik aims to:

- provide a pedagogical tool for analog photography  
- explore hybrid workflows between digital images and chemical printing  
- enable contact printing without a traditional enlarger  
- experiment with simple and reproducible darkroom techniques

---

### Project status

Argentik is currently in a testing phase with users. Feedback is used to improve:

- interface ergonomics  
- exposure timing accuracy  
- the test strip mode  
- compatibility with different smartphones

Suggestions, feedback and contributions are welcome.

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