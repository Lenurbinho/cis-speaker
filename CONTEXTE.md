# CIS speaker — contexte et cahier des charges

Document de référence du projet. À lire en premier à chaque séance de travail.

## Qui, pourquoi

Alexandre Brunel est speaker d'athlétisme (FFA) et formateur à l'ENP Saint-Malo. Il n'a pas de
bagage en code : explications en français simple, livrables complets, tests réels entre les séances.

Il a déjà :
- **Media Sheet** (dépôt privé `Lenurbinho/Alex-Brunel-Media-Sheet`) : application locale (Python,
  sur son ordinateur) qui scrape la FFA et World Athletics et produit, par épreuve, les fiches
  speaker (SB/PB, records détenus, palmarès, minima, bilans, podiums N-1). Elle lit le Direct FFA et
  enregistre chaque meeting dans `store/meetings/<id>.json`.
- **L'outil speaker de l'Ekiden de Paris 2026** (`Lenurbinho/ekiden-paris-2026`) : site mobile hors
  connexion pour les courses sur route (recherche par dossard, repérés, pavé numérique, dictée vocale,
  historique). Sa méthode est décrite dans `MODELE.md` et la compétence « outil-speaker-course ».

## Le projet : un « CIS hybride » pour la piste et la salle

Un écran de type CIS (système d'information de compétition) **sans suivi live branché**, qui suit
l'horaire de la réunion, avec la **saisie manuelle des perfs** au fil de l'eau (par le speaker ou par
une deuxième personne), et des **alertes** prêtes à annoncer.

### Fonctions attendues (par priorité)
1. **Horaire** : bandeau affichable / masquable, ligne « maintenant », statut des épreuves
   (à venir, en cours, terminée), bouton « +5 min » pour décaler la suite en cas de retard.
2. **Vue « Maintenant »** : épreuves proposées selon l'heure ; 2 à 4 épinglées côte à côte sur
   **tablette (prioritaire)**, en onglets sur téléphone (secours). Choix de la série / du tour.
3. **Fiche course** : couloir, dossard, nom, catégorie, club, SB/PB, records à battre.
   Saisie des temps couloir par couloir (pavé intégré, format automatique 10"52 / 1'52"30),
   classement de la série, **Q et q calculés automatiquement** selon la règle (« 2Q + 2q ») série
   après série, corrigeables d'un tap ; bilan des séries et composition de la finale.
4. **Concours horizontaux** : grille d'essais (perf, X, –), classement à chaque essai ; après 3 essais
   les 8 meilleurs continuent (les autres masqués en option), ordre de passage inversé.
5. **Concours verticaux** : barres, O / X / –, éliminé (et masqué) après 3 échecs consécutifs,
   classement officiel (barre franchie, échecs à cette barre, total des échecs).
6. **Alertes speaker** (très attendues) : à chaque saisie, comparaison **selon la catégorie de
   l'athlète** avec SB, PB, record du championnat, records de France / d'Europe / du monde de sa
   catégorie et toutes catégories, minima, meilleure perf française de l'année → pastille sur la
   ligne + bandeau « 1'52"30 : PB pour X, minima France espoirs ».
7. **Recherche par dossard** : toutes les épreuves d'un athlète, horaires et perfs déjà saisies.
8. **Saisie partagée** (version 2) : modifications identiques chez tous les utilisateurs via une
   **feuille Google Sheets + Apps Script** dans le Drive d'Alexandre (gratuit), synchronisation en
   quelques secondes, repli local sans réseau. GitHub écarté pour le direct.

Aussi repris de l'Ekiden : pavé numérique intégré, bouton Effacer, dictée vocale, historique, bouton
Retour, fonctionnement hors connexion (service worker), charte claire et très lisible.

## Sources de données (analyse sur les CF Élites 2026, J3 du 26 juillet, Direct 314411)

### Direct FFA — `https://www.athle.fr/direct/<id>`
- Programme : `/ajax/direct.aspx?mode=0&competition=<id>&date=…` → heure, catégorie (TCF/TCM…),
  épreuve, tour, liens « Série 1 / Série 2… », chacun avec un identifiant d'épreuve (GUID).
- Liste de départ : `/bases/liste.aspx?frmbase=directs&frmmode=1&frmcompetition=<id>&frmepreuve=<GUID>`
  → heure exacte de la série (14:00, 14:08, 14:16…), **règle de qualification** (« Qualif : 2Q + 2q »),
  **records** (RF par catégorie SEF/ESF/JUF…, RCH = record du championnat), **MPF de l'année par
  catégorie**, puis par ligne : ordre/couloir, dossard, athlète, catégorie/année (« ESF/05 »), club,
  département, ligue, SB, PB (année).
- J3 : 23 listes (dont épreuves d'heptathlon, séries de 200 m F/H, demi-finales et finale du 110 m H).
- La page indique que la FFA n'autorise pas la copie de ses données : **ne pas publier de données de
  meeting dans ce dépôt public**. Le site charge les données depuis un fichier choisi par l'utilisateur
  (ou son Drive) ; seules des données fictives de démonstration vont dans le dépôt.

### Media Sheet — `store/meetings/<id>.json`
- `meeting.epreuves[]` : nom, sexe, catégorie, horaire, phase, qualification, record_meeting, minima,
  barèmes de minima, top monde/Europe/France de l'année et de tous les temps, podium N-1, et
  `startlist[]` (nom, nat, cat, année, couloir, dossard, SB, PB détaillés par épreuve, club, licence,
  entraîneur, palmarès national/international, records détenus, URL de fiche).
- Constats sur la J3 : 18 épreuves ; **champ `qualification` vide** ; **les trois séries de 200 m
  portent toutes la phase « Série 2 »** (bug à corriger dans Media Sheet) ; l'heptathlon est regroupé
  en une seule épreuve.

### Chaîne retenue
Media Sheet (sur l'ordinateur, qui accède à la FFA) produit un **fichier unique pour le CIS** :
programme + séries + règles de qualification + records par catégorie + MPF + stats Media Sheet.
Le CIS (site statique, GitHub Pages) lit ce fichier, fonctionne hors connexion et garde les saisies.

## Décisions
- Tablette en priorité, téléphone en secours.
- Saisie partagée : idée gardée pour la version 2 (Google Sheets + Apps Script).
- Projet séparé de l'Ekiden : ce dépôt + un projet Claude dédié.

## Prochaines étapes
1. V1 « solo » sur données réelles de la J3 : horaire + vue Maintenant + fiches course et concours
   + saisie + Q/q + alertes.
2. Export « CIS » depuis Media Sheet (et correction du bug de phase des séries).
3. Synchronisation Google Sheets.
