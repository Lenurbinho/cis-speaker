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
7. **Saisie partagée** (version 2) : modifications identiques chez tous les utilisateurs via une
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

### Live d'un prestataire — Matsport (analysé le 3/11/2026 sur les CF Élites 2026)
Quand un prestataire comme Matsport gère la réunion, ses pages s'appuient sur une interface de
données JSON publique : `https://api-history.athle.matsport.com` (archives ; le live devrait suivre
la même structure sur le domaine live, à vérifier lors d'une réunion en cours).
- `GET /competitions/<idCompétition>?_withEvents=true` → journées (`schedules`), et pour chaque
  épreuve / série : heure, nom (« 100m Hommes »), phase (« Tour 1 Série 1 », « Finale »), statut
  (`OFFICIAL`…), type (A = course, F = concours), combinés.
- `GET /events/<idÉpreuve>` → records (RF, RC, MPF, WR) ; `phaseLinks` (toutes les séries + bilan) ;
  - courses (`trackResult`) : vent, et par athlète : couloir, dossard, place, temps, **Q/q**,
    temps de réaction, SB, PB, `bestChange` (SB / PB / RC…) ;
  - concours horizontaux (`horizontalResult`) : chaque essai avec vent, marque, classement après
    l'essai, record battu à l'essai ;
  - concours verticaux (`verticalResult`) : barres, et O / X / – à chaque essai ;
  - fiche athlète : nom, club, pays, **`id_FFA`** et `id_WA` → jointure directe avec Media Sheet.
- **Limite technique** : le serveur n'accepte que les pages Matsport (pas d'autorisation « CORS »).
  Un site hébergé ailleurs ne peut pas lire ces données directement : il faut un **relais**. Solution
  gratuite retenue : le même **Google Apps Script** que pour la saisie partagée (il récupère le JSON
  côté Google et le renvoie au CIS), interrogé toutes les 10 à 20 s pendant la réunion.
- À demander : l'accord du prestataire / de l'organisateur avant d'utiliser ces données en direct.

**Fonctionnement hybride visé** : si un live est disponible, le CIS se remplit tout seul (perfs, Q/q,
essais, vent) et garde nos stats et alertes ; sinon, saisie manuelle. Une saisie manuelle doit
toujours pouvoir corriger ou compléter le live.

### Chaîne retenue
Media Sheet (sur l'ordinateur, qui accède à la FFA) produit un **fichier unique pour le CIS** :
programme + séries + règles de qualification + records par catégorie + MPF + stats Media Sheet.
Le CIS (site statique, GitHub Pages) lit ce fichier, fonctionne hors connexion et garde les saisies.

## Accord des fournisseurs de données (3/11/2026)
Alexandre a l'accord de principe de la **FFA** et de **Matsport** pour utiliser les données de leurs sites
(Direct athle.fr, live et archives Matsport) **dans le cadre de son activité de speaker**, et pour que
l'outil serve aussi à d'autres speakers. Ce n'est pas une autorisation de publier ces données en accès
libre : elles ne sont **jamais stockées dans le dépôt public**, le CIS les lit au moment de l'utilisation
(fichier ouvert sur l'appareil, ou relais Google Apps Script).
Exemple de live Matsport (CF Élites 2026) :
`https://athle-history.matsport.com/competitions/36df6676-37a4-4396-aad0-935a0b262729/36df6676-37a4-4396-aad0-935a0b262729_SCH_20260724`

## Décisions
- **Lecture des données séparée du reste** : `engine.js` transforme une source (aujourd'hui le fichier
  Media Sheet) en un modèle unique de réunion (tours, séries, engagés, records). Les futures sources
  (Direct FFA, Matsport) n'auront qu'à produire ce même modèle.
- **Live Matsport et import athle.fr pour tous les speakers** (demandé le 3/11/2026, à faire après la V1) :
  - le live Matsport doit marcher pour **tous les speakers** qui utilisent le CIS, pas seulement Alexandre ;
  - on doit pouvoir **importer depuis le CIS** les données nécessaires, depuis le Direct athle.fr **ou**
    depuis Matsport : programme, séries et couloirs, règles de qualification, records par catégorie, MPF,
    puis les résultats en direct ;
  - moyen retenu : un relais Google Apps Script gratuit dans le Drive d'Alexandre, ouvert aux utilisateurs
    du CIS (il contourne le blocage « CORS ») ; le CIS l'interroge pendant la réunion ; une saisie manuelle
    peut toujours corriger ou compléter le live ;
  - accord FFA et Matsport obtenu par Alexandre (voir plus haut) ; les données restent lues au moment de
    l'utilisation, jamais stockées dans le dépôt.
- **Dépôt public, code seulement** : un dépôt privé n'apporterait rien (GitHub Pages gratuit exige un
  dépôt public, et un site Pages reste public même depuis un dépôt privé payant). Les données de
  meeting restent sur les appareils des speakers.
- **Pas de recherche par dossard** dans le CIS piste/salle (utile seulement en running, trail, cross).
- Tablette en priorité, téléphone en secours.
- Saisie partagée : idée gardée pour la version 2 (Google Sheets + Apps Script).
- Projet séparé de l'Ekiden : ce dépôt + un projet Claude dédié.

## État de la V1 (3/11/2026)
Fichiers : `index.html` (écran), `style.css`, `app.js` (affichage, saisie), `engine.js` (calculs),
`sw.js` (hors connexion, **incrémenter `CACHE` à chaque publication**), `data/demo.json` (réunion
**fictive** de démonstration, générée, aucune donnée réelle).

- **Chargement** : bouton « Ouvrir le fichier de la réunion » → fichier Media Sheet `store/meetings/<id>.json`,
  gardé dans l'appareil (IndexedDB). Saisies gardées dans l'appareil (localStorage), exportables / importables.
- **Lecture Media Sheet** : les séries d'une même épreuve (même nom, sexe, catégorie, heure) sont regroupées en
  un tour (« Séries », « Demi-finales ») ; heure des séries suivantes estimée (+8 min, marquée « ~ ») ;
  SB/PB de l'épreuve tirés des listes SB/PB (bon engin : 4 kg, 106 cm…, perfs ventées « (F) » et « (NC) »
  ignorées) ; records : RM, RE, RF (bilans « tous les temps »), RF par catégorie (records détenus par les
  engagés : NU23R / NU20R / NU18R), RCH (record_meeting), MPM / MPE / MPF de l'année (MPF complétée par les
  SB des engagés), minima A/B.
- **Horloge** : heure réelle, ou heure simulée (activée d'office si la réunion n'est pas aujourd'hui).
- **Horaire** : colonne à gauche (tiroir sur téléphone / tablette portrait), ligne « Maintenant », statuts,
  Retard ±5 min (épreuves à venir), heure modifiable par épreuve. Suggestions « Maintenant » : épreuves en
  cours ou qui commencent dans les 30 min.
- **Épreuves côte à côte** : 1 à 4 sur tablette (mise en page compacte automatique quand c'est étroit),
  onglets sur téléphone. Sur tablette en paysage, le pavé se range à gauche à la place de l'horaire.
- **Courses** : onglets de séries + Bilan, saisie au pavé (2312 → 23"12, 15230 → 1'52"30), DNS/DNF/DQ,
  vent par série, ordre couloirs / classement, Q/q automatiques (règle du fichier ou choisie au bouton
  « Qualif »), corrigeables d'un tap, égalités signalées, « Créer la finale » avec les qualifiés (couloirs
  à saisir).
- **Concours horizontaux** : 6 essais (X, –, marque + vent pour longueur/triple), 8 meilleurs après 3 essais,
  ordre inversé pour les essais 4-6, « À l'essai » / « Suivant », masquer les éliminés.
- **Concours verticaux** : barres, O / X / –, rotation des sauteurs, éliminé après 3 échecs consécutifs,
  classement officiel, barre suivante proposée, barrage signalé.
- **Combinés** : total de points (V1 simple).
- **Alertes** : à chaque saisie, comparaison selon la catégorie de l'athlète (records), en tenant compte des
  perfs déjà réalisées dans le tour ; pastilles sur la ligne + bandeau prêt à lire ; vent > +2.0 signalé
  « non homologable ». Historique de toutes les saisies, chacune annulable.
- **Dictée vocale** (réseau nécessaire) et clavier physique (chiffres, Entrée, X, O, -).

Limites connues : règles de qualification absentes des fichiers Media Sheet actuels (à choisir au bouton
« Qualif ») ; RF et MPF par catégorie partiels tant que l'export CIS (Direct FFA) n'existe pas ; combinés
réduits au total de points.

## Prochaines étapes
1. Retours d'Alexandre sur la V1 en conditions réelles.
2. Export « CIS » depuis Media Sheet ou import direct (Direct FFA / Matsport) : règles de qualification,
   heures exactes des séries, RF et MPF par catégorie (champ `records_cis` déjà lu par `engine.js`) ;
   corriger le bug de phase des séries dans Media Sheet.
3. Relais Google Apps Script pour tous les speakers : lecture du live Matsport, import athle.fr,
   synchronisation des saisies entre appareils.
