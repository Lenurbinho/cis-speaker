# Relais de partage du CIS speaker (Google Apps Script)

Le relais permet qu'une réunion ouverte sur un appareil (ordinateur, tablette) **apparaisse sur tous les
appareils des speakers**. Les fichiers sont gardés dans un dossier privé de ton Google Drive
(« CIS speaker - réunions ») ; seuls les appareils qui ont le **code d'équipe** peuvent les lire.
Gratuit. À faire une seule fois (5 minutes).

## Installer
1. Va sur https://script.google.com → **Nouveau projet**. Renomme-le « Relais CIS speaker ».
2. Efface le contenu de `Code.gs` et colle tout le contenu du fichier `relais/Code.gs` de ce dépôt.
3. Ligne `const CODE_EQUIPE = 'A-CHANGER';` : remplace `A-CHANGER` par ton code (ex. `SpeakerBZH2026`).
   Ligne `const CODE_ADMIN = 'A-CHANGER-AUSSI';` : mets un **autre** code, connu de toi seul. Il sert à retirer
   une réunion de la liste partagée, à envoyer une réunion aux autres et à effacer des saisies chez tout le monde.
4. Clique sur 💾 (Enregistrer). En haut, choisis la fonction **autoriser** puis **▶ Exécuter** :
   Google demande l'autorisation d'accéder à ton Drive → accepte (« Paramètres avancés » → « Accéder à… »
   si Google affiche un avertissement : c'est ton propre script).
5. **Déployer** → **Nouveau déploiement** → roue ⚙ → **Application Web** :
   - Exécuter en tant que : **Moi**
   - Qui a accès : **Tout le monde**
   → **Déployer** → copie l'**URL de l'application Web** (elle finit par `/exec`).
6. Dans le CIS : **Réglages** → **Partage entre appareils** → colle l'URL et le code → **Enregistrer**.
7. Bouton **Copier le lien d'invitation** : envoie ce lien aux autres speakers ; en l'ouvrant, leur
   appareil est réglé tout seul.

## Mettre à jour le relais (nouvelle version du code)
1. Ouvre ton projet « Relais CIS speaker » sur https://script.google.com.
2. **Note ton code d'équipe** (ligne `CODE_EQUIPE`) et ton code administrateur (`CODE_ADMIN`), puis remplace tout
   le contenu de `Code.gs` par le nouveau fichier `relais/Code.gs` ; remets tes deux codes ; 💾.
3. **Déployer** → **Gérer les déploiements** → ✏️ (crayon) → Version : **Nouvelle version** → **Déployer**.
   L'adresse `/exec` ne change pas : rien à refaire sur les appareils.

4. Si la nouvelle version demande un nouvel accès (version 3 : lecture d'athle.fr et de Matsport) :
   choisis la fonction **autoriser** → **▶ Exécuter** → accepte la nouvelle autorisation
   (« se connecter à un service externe »).

Si le CIS affiche « relais à mettre à jour » à côté de la date, c'est que cette étape manque.

## Modifier le script plus tard
Après une modification : **Déployer** → **Gérer les déploiements** → ✏️ → Version : **Nouvelle version** →
**Déployer** (l'URL reste la même).

## Code administrateur (relais version 7)
Dans le CIS, sur **tes** appareils seulement : Réglages → Partage entre appareils → « Code administrateur » →
**Valider**. Le bouton **Retirer** n'apparaît que sur ces appareils, et le relais refuse le retrait sans ce code.
Le lien d'invitation ne contient pas ce code.

Depuis la **version 7** du relais, l'envoi d'une réunion (« Partager cette réunion », imports) est aussi réservé
à l'administrateur : le relais refuse tout envoi sans ce code.
