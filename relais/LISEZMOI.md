# Relais de partage du CIS speaker (Google Apps Script)

Le relais permet qu'une réunion ouverte sur un appareil (ordinateur, tablette) **apparaisse sur tous les
appareils des speakers**. Les fichiers sont gardés dans un dossier privé de ton Google Drive
(« CIS speaker - réunions ») ; seuls les appareils qui ont le **code d'équipe** peuvent les lire.
Gratuit. À faire une seule fois (5 minutes).

## Installer
1. Va sur https://script.google.com → **Nouveau projet**. Renomme-le « Relais CIS speaker ».
2. Efface le contenu de `Code.gs` et colle tout le contenu du fichier `relais/Code.gs` de ce dépôt.
3. Ligne `const CODE_EQUIPE = 'A-CHANGER';` : remplace `A-CHANGER` par ton code (ex. `SpeakerBZH2026`).
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

## Modifier le script plus tard
Après une modification : **Déployer** → **Gérer les déploiements** → ✏️ → Version : **Nouvelle version** →
**Déployer** (l'URL reste la même).
