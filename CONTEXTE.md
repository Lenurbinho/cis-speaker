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

Constats sur la capture du 4/11/2026 (via le relais) :
- `GET /competitions/<id>?_withEvents=true` contient déjà `schedules[].events[]` : **horaire exact de chaque
  série** (`date`), `event` (« 200m Femmes »), `phase` (« Tour 1 Série 2 », « Demi Finale 1 », « Finale »),
  `type` (A = course en couloirs, B = course en ligne, E = saut horizontal, F = saut vertical, G = lancer),
  `status`, `records` (rempli pour les épreuves individuelles), `idCombined` pour les épreuves des combinés.
  Les finales absentes de Media Sheet (200 m, 110 m H) y sont.
- `GET /events/<id>` : `trackResult.results[]` (athlete{longName, id_FFA, id_WA, club, country, photo},
  bib, lane, rank, time « 10.69 », qualif, reactionTime, personalBest, seasonBest, bestChange, points),
  `trackResult.wind`, `trackResult.summary` (classement des combinés) ; `horizontalResult.results[].attemptHorizontal[]`
  (round_Result, round_Wind, round_Valide, round_Rank_After_Attempt, round_Points) ;
  `verticalResult.heights[]` + `results[].attemptVertical[]` (ht, ht_Att1..3 « O/X/- ») ; `phaseLinks`.
- Adresses `/schedules/…` et `/competitions/<id>/events` : 404 (inexistantes).
- Site public des archives Matsport : `https://history.athle-liveresults.fr/competitions/<id>/<id>_SCH_<date>`
  (donné par Alexandre). Le live est sans doute sur un domaine `athle-liveresults.fr` : l'ajouter à la liste
  des sites autorisés du relais (`SITES_OK`) au moment de brancher le live Matsport.
- Direct athle.fr (2e capture, OK) : chaque liste de départ (`frmmode=1`) contient tout : titre
  (`.mainheaders` « 200m TCF », combinés « Heptathlon JSF | Longueur TCF »), records (`td.recordsDatas` :
  RF SEF, RF ESF, RCH…, puis « MPF 2026 » par catégorie), `.headers4` (« 26 JUILLET 14:08 »,
  « Qualif : 2Q + 2q »), les tours de l'épreuve (`.navDatas` / `.navActive`, avec leurs GUID : séries,
  1/2 finales, finale), et les lignes `tr.trlive` (ordre/couloir, dossard, lien fiche FFA, « SEF/02 »,
  club, dépt, ligue, SB, PB « 24''00 (26) »). `frmmode=2` = résultats (colonnes Pl., Perf, …, Pts).

**Import du Direct (V1.4, `import.js`)** : Réglages → « Importer depuis le Direct athle.fr » (n° + date) ;
lit par le relais le programme puis toutes les listes (et les finales trouvées dans les onglets), et fabrique
un fichier au format Media Sheet (ids stables tirés des GUID, pour que les saisies restent attachées même
si on réimporte après l'ajout des finales). Ensuite, ouvrir le fichier Media Sheet de la réunion propose de
**compléter** la réunion importée (palmarès, records détenus, bilans, minima, podium N-1) : jointure par
dossard + nom. La réunion importée est partagée avec tous les appareils.
Testé sur la J3 : 16 tours dont les finales du 200 m F/H et du 110 m H, heures exactes, règles 2Q+2q / 3Q+2q,
RF par catégorie, MPF par catégorie.
- **Résultats en direct depuis le Direct (V1.6)** : pour une réunion importée du Direct, toutes les 10 s le
  CIS lit par le relais (cache 8 s partagé) les pages de résultats (`frmmode=2`) des séries / concours
  commencés (ou qui commencent dans les 5 min) et remplit : temps, statuts (NP → DNS, AB → DNF, DQ, NM), vent
  de la série, essais avec vent, barres O/X/– (« r » = abandon), épreuves des combinés ; Q/q officiels
  (corrigés seulement s'ils diffèrent du calcul) ; concours marqués terminés quand le résultat est officiel.
  Alertes et historique « (Direct) ». **Une case saisie à la main n'est jamais écrasée.** Avec l'heure
  simulée, une réunion passée se rejoue (testé sur la J3 à 15h50). Bouton marche/arrêt et « Mettre à jour
  maintenant » dans Réglages. Athlètes reconnus par leur n° de fiche FFA, sinon par le nom.
- **V1.7** : réimport discret toutes les 3 min (réunion du jour, live activé) : une liste publiée en cours de
  réunion (finale…) apparaît seule, avec reprise des **stats Media Sheet** déjà fusionnées et des références
  (SB/PB, records, MPF) ; bandeau « Nouvelle liste publiée : … ». Saisies gardées (identifiants stables).
  **Combinés sur deux jours** : l'import va chercher dans le programme des autres journées les épreuves du
  combiné (ex. J2 de l'heptathlon quand on importe la J3) : leurs résultats remontent, sans les mettre dans
  l'horaire du jour. Il faut **réimporter** une réunion importée avant la V1.7 pour en profiter.
- **Live Matsport (V1.9, testé sur les archives de la J3)** : Réglages → « Live Matsport » : coller l'adresse
  d'une page de la journée (`https://athle-liveresults.fr/competitions/<id>/<id>_SCH_<aaaammjj>`, ou
  `history.…` pour les archives). Le CIS cherche l'interface de données (archives : api-history.athle.matsport.com ;
  live : essaie api.athle.matsport.com, api-live.athle.matsport.com, api.athle-liveresults.fr — **à confirmer
  le jour J**). Si une réunion est ouverte (Direct / Media Sheet), il **relie** chaque épreuve Matsport à la
  série correspondante (sexe, épreuve, tour, heure ±10 min ; combinés par discipline) et les résultats viennent
  de Matsport (toutes les 10 s, cache 5 s), le Direct en secours ; sinon il **crée la réunion** depuis Matsport
  (horaire, séries, couloirs, dossards, SB/PB, records RF/RCH/MPF/RM ; pas de catégories → compléter avec
  Media Sheet). Athlètes reconnus par le dossard. Le lien Matsport est gardé lors des réimports du Direct.
  Relais version 4 : ajoute `athle-liveresults.fr` aux sites autorisés.
- **Combinés, onglet d'une épreuve (V1.9)** : gros chiffre = **place dans l'épreuve**, sous les points
  « 3e au général » ; tri par défaut : classement de l'épreuve (Ordre → général → passage).
- **Outils de micro (V1.8)** :
  - **Présenter** (bouton sur chaque série / concours) : en jeu (records, MPF, minima), favoris (3 meilleurs SB),
    puis couloir par couloir ou ordre de passage : nom, catégorie, année, club, SB/PB, minima, 5 meilleures stats, note.
  - **Ce qu'il faut pour…** sous « À l'essai » en concours horizontal : marque pour passer en tête, pour le
    podium, pour le top 8 (avant le 4e essai), PB, records / MPF / minima à portée (≤ 6 % au-dessus du PB) ;
    en vertical : « Si X passe 5m90 : en tête, PB, record des championnats… ».
  - **Podium** (bouton quand l'épreuve est finie, aussi dans ⋯) : 3 premiers, perf, vent, club, records/PB du jour,
    et pour le vainqueur d'un championnat « 2e titre de champion(ne) de France (déjà en 2024) » d'après le palmarès.
  - **Notes du speaker** : dans la fiche d'un athlète (« Ma note de speaker »), affichée en jaune sous son nom
    partout, dans la présentation et le podium ; partagée entre appareils.
  - **Combinés, onglet d'une épreuve** : classés par défaut au **classement général**, colonne **Ord.** (ordre de
    passage), place dans l'épreuve sous les points, « À suivre / Ensuite » mis en évidence ; le bouton Ordre
    alterne général → épreuve → passage.
  - Correctif V1.8.1 : un **réimport manuel** du Direct garde désormais les stats Media Sheet déjà fusionnées
    (avant, il les perdait) ; « Présenter » signale quand aucune stat n'est chargée.
  - Correctif : un combiné des autres jours (ex. décathlon vendredi-samedi) n'apparaît plus dans l'horaire du
    jour importé ; seuls les combinés ayant une épreuve ce jour-là sont gardés.
- **Horaire des combinés (V1.5)** : dans la colonne Horaire, une ligne par épreuve du combiné avec son heure
  (« 14h05 Javelot · Heptathlon ») ; la toucher ouvre le panneau du combiné **directement sur l'onglet de
  cette épreuve** (les autres épreuves et le classement restent à un onglet). Heures tirées du Direct ; sinon
  bouton « Heure ? ✎ » dans l'onglet de l'épreuve (heure partagée entre appareils). Les suggestions
  « Maintenant » proposent aussi l'épreuve du combiné en cours.
- Combinés en catégorie jeunes (CA, MI…) : tables FFA jeunes **pas encore intégrées** ; message d'avertissement
  et points indicatifs (tables adultes). À faire si le cas se présente (remarque d'Alexandre, 4/11/2026).

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
- **Combinés** (V1.3) : onglets par épreuve (jour 1 / jour 2) + « Classement » ; on saisit la **vraie perf**
  (temps, marque, vent pour 100/200/haies/longueur ; DNS/DNF/DQ/NM), les **points** sont calculés avec les
  tables World Athletics (vérifié sur les points Matsport : 10"69 = 931, 7m64 = 970) ; classement
  intermédiaire avec le **détail des perfs** de chaque épreuve (pas les points) ; alertes PB/SB par épreuve,
  et à la fin, total comparé aux records et au PB. Programmes : heptathlon F, décathlon H et F, pentathlon F
  salle, heptathlon H salle.
- **Alertes** : à chaque saisie, comparaison selon la catégorie de l'athlète (records), en tenant compte des
  perfs déjà réalisées dans le tour ; pastilles sur la ligne + bandeau prêt à lire ; vent > +2.0 signalé
  « non homologable ». Historique de toutes les saisies, chacune annulable.
- **Dictée vocale** (réseau nécessaire) et clavier physique (chiffres, Entrée, X, O, -).

Ajouts V1.1 (3/11/2026) :
- **Ligne « meilleures stats »** sous le nom, avant SB/PB : records détenus, minima, meilleurs résultats
  internationaux puis nationaux (classés par importance : JO > CM > CE… ; titres ; même épreuve d'abord ;
  récents d'abord), 3 au maximum, puis une pastille « +N » s'il y en a d'autres (elle ouvre la fiche).
- **Nom de l'athlète = lien vers sa fiche FFA** (ou World Athletics si Media Sheet donne ce lien), nouvel onglet.
- **Partage des réunions entre appareils** : relais Google Apps Script dans le Drive d'Alexandre
  (`relais/Code.gs`, mode d'emploi `relais/LISEZMOI.md`), protégé par un **code d'équipe**. Une réunion
  ouverte sur un appareil est envoyée au relais ; les autres appareils la voient dans Réglages (et l'ouvrent
  d'office s'ils n'ont rien d'ouvert), et reçoivent ses mises à jour (vérification toutes les 2 min).
  Un **lien d'invitation** règle un nouvel appareil d'un coup. Relais installé par Alexandre le 4/11/2026.

Ajouts V1.2 (4/11/2026) — **saisies partagées en direct** (relais version 2) :
- chaque « case » (temps d'un athlète, essais d'un athlète, concours vertical, vent, règle de qualif, Q/q
  corrigé, couloir de finale, retard, épreuve terminée, finales créées) part au relais dès qu'elle change ;
  les cases des autres appareils arrivent toutes les **3 s** ; nouvelle réunion / mise à jour vérifiée
  toutes les **5 s** ;
- même case saisie en même temps sur deux appareils : la plus récente gagne ;
- sans réseau : en attente sur l'appareil, envoi au retour du réseau ; état affiché à côté de la date
  (« partagé ✓ », « envoi… », « hors ligne (n en attente) ») ;
- alertes et historique aussi pour les saisies venues d'un autre appareil ;
- restent propres à chaque appareil : épreuves affichées, ordre d'affichage, horloge simulée, bandeau.
- Côté relais : fichier `<réunion>.saisies.json` dans le dossier Drive, verrou contre les écritures
  simultanées, mémoire cache pour répondre tout de suite quand rien n'a changé.

**Live Matsport (à venir)** : même principe, avec le relais qui interroge Matsport et garde la réponse en
cache quelques secondes, pour que tous les speakers partagent **une seule** interrogation de Matsport
(rythme visé : environ 5 s, seulement pour les épreuves en cours, à confirmer avec Matsport).

Limites connues : règles de qualification absentes des fichiers Media Sheet actuels (à choisir au bouton
« Qualif ») ; RF et MPF par catégorie partiels tant que l'export CIS (Direct FFA) n'existe pas ; combinés
réduits au total de points.

## Améliorations pour plus tard (une fois tout le reste en place)
- **Photos des athlètes** comme sur le fichier final de Media Sheet (champ `photo` du fichier) : petite photo
  dans la fiche, voire sur la ligne. Demandé le 4/11/2026, accessoire.

## Prochaines étapes
1. Retours d'Alexandre sur la V1 en conditions réelles. (Partage réunion + saisies testé avec succès le 4/11/2026.)
   Import automatique en cours : relais version 3 (action `brut` : lecture des seuls sites athle.fr et
   matsport.com, réponse gardée en cache quelques secondes pour tous les speakers) et page
   `outils/capture.html` qui rassemble les pages sources d'une réunion dans un fichier pour écrire l'import.
2. Export « CIS » depuis Media Sheet ou import direct (Direct FFA / Matsport) : règles de qualification,
   heures exactes des séries, RF et MPF par catégorie (champ `records_cis` déjà lu par `engine.js`) ;
   corriger le bug de phase des séries dans Media Sheet.
3. Relais Google Apps Script (déjà en place pour les réunions) : synchronisation des saisies entre
   appareils, lecture du live Matsport, import athle.fr, pour tous les speakers.
