class SystemeChauffageCard extends HTMLElement {

  constructor() {

    super();

    this.attachShadow({ mode: "open" });

    // On initialise juste le CSS ici (fixe).
    // Le HTML du contenu (les box) sera généré dynamiquement
    // dans render(), une fois qu'on a la config + les données hass.
    this._initStyles();

  }

  // ==========================================================
  // STYLES (inchangés dans leur structure, mais on utilise
  // maintenant les variables CSS de Home Assistant quand elles
  // existent, avec une valeur de secours après la virgule).
  // Ça permet à la carte de s'adapter automatiquement au thème
  // clair/sombre choisi par l'utilisateur, au lieu d'imposer
  // toujours du noir.
  // ==========================================================
  _initStyles() {

    const style = document.createElement("style");

    style.textContent = `

      :host {
        display: block;
      }

      .card {
        background: var(--card-background-color, #1c1c1c);
        border: 1px solid var(--divider-color, #333333);
        border-radius: 12px;
        padding: 16px;
        box-sizing: border-box;
        color: var(--primary-text-color, white);
      }

      /* ==============================
         EN-TETE
         ============================== */

      .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .title {
        font-size: 18px;
        font-weight: 500;
      }

      .icon {
        /* Couleur par défaut (arrêté) : gris.
           On la change dynamiquement en JS selon l'état
           (voir _getIconColor). */
        color: var(--secondary-text-color, #999999);
        transition: color 0.3s ease;
      }

      ha-icon {
        --mdc-icon-size: 28px;
      }

      /* ==============================
         GRILLE
         ==============================
         auto-fit + minmax : la grille s'adapte à la largeur
         disponible (utile si la carte est placée dans une
         colonne plus large ou plus étroite du dashboard),
         au lieu d'être bloquée sur exactement 2 colonnes. */

        .grid {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 16px;
        }

      /* ==============================
         BLOC
         ============================== */

        .box {
          width: max-content;
          min-width: 120px;
          box-sizing: border-box;
        }

      .label {
        font-size: 13px;
        color: var(--secondary-text-color, #999999);
      }

      .value {
        margin-top: 5px;
        font-size: 22px;
        font-weight: 400;
        /* transition douce quand une valeur change,
           plutôt qu'un changement brutal */
        transition: opacity 0.2s ease;
      }

      .unit {
        font-size: 14px;
        color: var(--secondary-text-color, #999999);
      }

    `;

    this.shadowRoot.appendChild(style);

  }

  // ==========================================================
  // CONFIGURATION
  // ==========================================================
  // Appelé une fois par Home Assistant quand la carte est créée
  // (depuis le YAML/UI du dashboard). C'est ici qu'on définit
  // quelles entités HA alimentent chaque box.
  //
  // Exemple de configuration attendue dans le dashboard :
  //
  // type: custom:systeme-chauffage-card
  // entity_temp_ext: sensor.temperature_exterieure
  // entity_temp_int: sensor.temperature_interieure
  // entity_etat: climate.chauffage
  //
  // Tu peux ajouter d'autres clés (entity_temps_chauffe,
  // entity_heure_anticipe, etc.) au fur et à mesure.
  // ==========================================================
  setConfig(config) {

    // "required: true" dans FIELDS (voir tout en bas du fichier)
    // sert à DEUX choses en même temps :
    // 1) ici, on refuse la config si une entité obligatoire manque
    // 2) dans l'éditeur graphique, ça affiche une petite astérisque
    //    rouge et empêche de sauvegarder tant que ce n'est pas rempli.
    // C'est pour ça que FIELDS est une liste PARTAGÉE, définie une
    // seule fois : si tu ajoutes/retires un champ obligatoire, tu
    // n'as qu'un seul endroit à modifier.
    const missing = SystemeChauffageCard.FIELDS
      .filter((field) => field.required && !config[field.key])
      .map((field) => field.key);

    if (missing.length > 0) {
      throw new Error(
        `systeme-chauffage-card : entité(s) obligatoire(s) manquante(s) : ${missing.join(", ")}`
      );
    }

    // On génère la liste des box à afficher à partir de FIELDS,
    // en excluant "entity_etat" qui est traitée à part (texte
    // "Arrêté"/"Chauffe" plutôt que valeur + unité — voir render()).
    this._boxes = SystemeChauffageCard.FIELDS
      .filter((field) => !field.isState && !field.isCalculated)
      .map((field) => ({
        label: field.label,
        entity: config[field.key],
        unit: field.unit,
        attribute: field.attribute, // optionnel — voir _getState()
      }));

    this.config = config;

    // Si hass est déjà disponible (rechargement de carte par ex.),
    // on peut render tout de suite. Sinon on attend le setter hass.
    if (this._hass) {
      this.render();
    }

  }

  // ==========================================================
  // ÉDITEUR GRAPHIQUE
  // ==========================================================
  // Indique à Home Assistant quel élément utiliser comme interface
  // graphique de configuration (le formulaire qui s'ouvre quand tu
  // cliques sur "Modifier" sur la carte dans le dashboard).
  // Sans ça, HA propose seulement un éditeur YAML brut.
  static getConfigElement() {
    return document.createElement("systeme-chauffage-card-editor");
  }

  // Configuration par défaut proposée quand on ajoute la carte
  // depuis le sélecteur de cartes de l'UI (avant tout réglage).
  static getStubConfig() {
    return {};
  }

  // ==========================================================
  // HASS SETTER — le cœur de la connexion à Home Assistant
  // ==========================================================
  // Home Assistant appelle ce setter automatiquement à CHAQUE
  // mise à jour d'état, plusieurs fois par minute en général.
  // C'est ici (et seulement ici) qu'on doit lire les valeurs
  // réelles des entités et rafraîchir l'affichage.
  set hass(hass) {

    this._hass = hass;

    // setConfig() peut être appelé avant que hass n'existe la
    // première fois : on ne render que si la config est prête.
    if (this.config) {
      this.render();
    }

  }

  // Getter correspondant, requis par HA pour lire l'état courant.
  get hass() {
    return this._hass;
  }

  // ==========================================================
  // RÉCUPÉRATION D'UNE VALEUR D'ÉTAT (OU D'UN ATTRIBUT)
  // ==========================================================
  // Petite fonction utilitaire : va chercher l'état d'une entité
  // dans hass.states, et renvoie "--" si l'entité n'est pas
  // configurée ou n'existe pas (évite les erreurs JS en pleine
  // figure si une entité est mal orthographiée).
  //
  // Le 2e paramètre "attribute" est optionnel : certaines valeurs
  // ne sont pas dans l'état brut de l'entité mais dans ses
  // attributs. Exemple : pour une entité climate, la température
  // affichée (ex: "heat") n'est PAS la consigne — la consigne est
  // dans l'attribut "temperature" de cette même entité.
  _getState(entityId, attribute) {

    if (!entityId) return "--";

    const stateObj = this._hass.states[entityId];

    if (!stateObj) return "--";

    if (attribute) {
      const value = stateObj.attributes ? stateObj.attributes[attribute] : undefined;
      return (value === undefined || value === null) ? "--" : value;
    }

    return stateObj.state;

  }

  // ==========================================================
  // COULEUR DE L'ICÔNE SELON L'ÉTAT
  // ==========================================================
  // Exemple simple : si l'entité d'état contient "heat" ou "on",
  // on colore la flamme en orange, sinon en gris.
  // À adapter selon les vrais états de ton entité climate/switch.
  _getIconColor() {

    const etat = this._getState(this.config.entity_etat);

    if (etat === "heat" || etat === "on") {
      return "#ff9800"; // orange : ça chauffe
    }

    return "var(--secondary-text-color, #999999)"; // gris : arrêté

  }

  // ==========================================================
  // RENDU
  // ==========================================================
  // Reconstruit le contenu de la carte (hors <style>, déjà posé
  // une fois dans le constructeur) à partir de this._boxes et
  // des valeurs actuelles de hass.
  render() {

    const etat = this._getState(this.config.entity_etat);
    const iconColor = this._getIconColor();

    // On génère le HTML des box à partir du tableau this._boxes,
    // au lieu de dupliquer 10 fois le même bloc à la main.
    const boxesHtml = this._boxes
      .map((box) => {

        // box.attribute est optionnel (voir FIELDS) : utilisé pour
        // la "Consigne", qui vient de l'attribut "temperature" de
        // l'entité climate plutôt que de son état brut.
        const value = this._getState(box.entity, box.attribute);

        return `
          <div class="box">
            <div class="label">${box.label}</div>
            <div class="value">
              <span>${value}</span>
              <span class="unit">${box.unit}</span>
            </div>
          </div>
        `;

      })
      .join("");

    // ======================================================
    // BOXES CALCULÉES
    // ======================================================
    // Contrairement aux box ci-dessus (qui affichent une valeur
    // brute d'entité), celles-ci sont calculées directement en
    // JS à partir de plusieurs entités — voir SystemeChauffageCard.
    // CALCULATIONS tout en bas du fichier pour le détail de chaque
    // calcul (ex : temps de chauffe estimé).
    //
    // Comme render() est rappelé à chaque mise à jour de hass, le
    // calcul est automatiquement refait et la valeur affichée se
    // met à jour toute seule — pas besoin de logique supplémentaire.
    const calculatedBoxesHtml = SystemeChauffageCard.CALCULATIONS
      .map((calc) => {

        const value = calc.compute(this.config, this._hass);

        return `
          <div class="box">
            <div class="label">${calc.label}</div>
            <div class="value">
              <span>${value === null || value === undefined ? "--" : value}</span>
              <span class="unit">${calc.unit}</span>
            </div>
          </div>
        `;

      })
      .join("");

    // On ajoute la box "État" séparément car son contenu est
    // du texte (Arrêté / Chauffe...) et non une valeur + unité.
    const etatHtml = `
      <div class="box">
        <div class="label">État</div>
        <div class="value">${etat === "--" ? "Arrêté" : etat}</div>
      </div>
    `;

    // On ne remplace QUE le contenu (pas le <style> déjà présent),
    // pour éviter de recréer inutilement les balises de style à
    // chaque mise à jour hass (plusieurs fois par minute).
    let container = this.shadowRoot.querySelector(".card");

    if (!container) {
      container = document.createElement("div");
      container.className = "card";
      this.shadowRoot.appendChild(container);
    }

    container.innerHTML = `

      <div class="header">
        <div class="title">Chauffage</div>
        <div class="icon" style="color: ${iconColor};">
          <ha-icon icon="mdi:fire"></ha-icon>
        </div>
      </div>

      <div class="grid">
        ${boxesHtml}
        ${calculatedBoxesHtml}
        ${etatHtml}
      </div>

    `;

  }

  // ==========================================================
  // TAILLE (utilisée par HA pour le placement dans les dashboards
  // en grille type "masonry")
  // ==========================================================
  getCardSize() {
    return 4;
  }

}

// ==============================================================
// FIELDS — LISTE DES ENTITÉS CONFIGURABLES
// ==============================================================
// C'est LA liste centrale qui décrit chaque entité de la carte :
//   - key       : nom de la clé dans la config (ex: "entity_temp_ext")
//   - label     : texte affiché (dans la carte ET dans l'éditeur)
//   - unit      : unité affichée dans la box
//   - required  : true = obligatoire (bloque setConfig + astérisque
//                 rouge dans l'éditeur graphique)
//   - domain    : filtre optionnel pour l'éditeur, pour ne proposer
//                 que les entités du bon type (ex: "sensor", "climate")
//   - attribute : optionnel — si la valeur à afficher n'est pas
//                 l'état brut de l'entité mais un de ses attributs
//                 (ex : "temperature" pour lire la consigne d'un
//                 climate, dont l'état brut est plutôt "heat"/"off")
//   - isState   : true pour l'entité d'état, traitée à part dans
//                 render() (texte "Arrêté"/"Chauffe" plutôt que
//                 valeur + unité)
//
// setConfig(), render() ET l'éditeur graphique lisent tous les
// trois cette même liste. Résultat : pour ajouter un nouveau champ
// à ta carte, tu n'as QU'UNE LIGNE à ajouter ici, et il apparaîtra
// automatiquement dans la carte ET dans le formulaire de config.
//
// Note : "Temps de chauffe" n'est PAS dans cette liste — ce n'est
// plus une entité à sélectionner, mais une valeur CALCULÉE par la
// carte elle-même. Voir SystemeChauffageCard.CALCULATIONS un peu
// plus bas.
// ==============================================================
SystemeChauffageCard.FIELDS = [
  { key: "entity_temp_ext",    label: "Température extérieure", unit: "°C", required: true,  domain: "sensor" },
  { key: "entity_temp_int",    label: "Température intérieure", unit: "°C", required: true,  domain: "sensor" },
  { key: "entity_consigne",    label: "Consigne",               unit: "°C", required: true,  domain: "climate", attribute: "temperature" },
  { key: "entity_coefficient", label: "Coefficient",            unit: "",   required: true,  domain: "input_number" },
  { key: "entity_planning",    label: "Planning en cours",      unit: "",   required: true,  domain: "input_text" },
  { key: "entity_derive",      label: "Dérive",                 unit: "°C/Min", required: false },
  { key: "entity_etat",        label: "État du chauffage",      unit: "",   required: true,  domain: "climate", isState: true },
];

// ==============================================================
// CALC — fonctions de calcul, réutilisables entre elles
// ==============================================================
// ⚠️ ZONE À REGARDER EN PRIORITÉ EN CAS DE PROBLÈME SUR UN CALCUL.
//
// Chaque fonction ci-dessous correspond à un template Jinja2 que
// tu utilisais côté Home Assistant, traduit en JavaScript. Elles
// sont regroupées ici (plutôt que directement dans CALCULATIONS
// plus bas) parce que certaines s'appellent entre elles :
// "heureAnticipee" a par exemple besoin du résultat de
// "heurePlanning" ET de "tempsChauffe". Les séparer permet de
// réutiliser un calcul sans dupliquer sa logique.
//
// Toutes prennent (config, hass) et renvoient soit une valeur,
// soit null si hass n'est pas encore prêt.
// ==============================================================
SystemeChauffageCard.CALC = {

  // ------------------------------------------------------
  // TEMPS DE CHAUFFE ESTIMÉ (en minutes)
  // ------------------------------------------------------
  // Traduction directe du template Jinja2 :
  //   delta       = consigne - température intérieure
  //   coeff       = coefficient réglable, borné entre 10 et 60
  //   facteur_ext = 1 + ((temp - température extérieure) / 50),
  //                 borné entre 0.7 et 1.5
  //   résultat    = round(delta * coeff * facteur_ext),
  //                 mais 0 si delta <= 0.3°C (déjà à température)
  //
  // Entités utilisées (définies dans FIELDS) :
  //   entity_temp_int, entity_consigne (attribut "temperature"),
  //   entity_coefficient, entity_temp_ext
  // ------------------------------------------------------
  tempsChauffe(config, hass) {

    if (!hass) return null;

    const temp = parseFloat(hass.states[config.entity_temp_int]?.state) || 0;

    const consigneEntity = hass.states[config.entity_consigne];
    const consigne = parseFloat(consigneEntity?.attributes?.temperature) || 0;

    const delta = consigne - temp;

    let coeff = parseFloat(hass.states[config.entity_coefficient]?.state);
    if (isNaN(coeff)) coeff = 25; // valeur par défaut si pas encore disponible
    coeff = Math.min(Math.max(coeff, 10), 60);

    const extBrut = parseFloat(hass.states[config.entity_temp_ext]?.state);
    const ext = isNaN(extBrut) ? 10 : extBrut;

    let facteurExt = 1 + ((temp - ext) / 50);
    facteurExt = Math.min(Math.max(facteurExt, 0.7), 1.5);

    if (delta > 0.3) {
      return Math.round(delta * coeff * facteurExt);
    }

    return 0;

  },

  // ------------------------------------------------------
  // HEURE PLANNING (prochain créneau à venir)
  // ------------------------------------------------------
  // Traduction du template Jinja2 : parcourt le planning
  // (entity_planning, format "07h30|21,12h00|19,..."), et renvoie
  // le premier créneau dont l'heure est APRÈS l'heure actuelle.
  // S'il n'y en a aucun (on est après le dernier créneau du jour),
  // on revient au tout premier créneau de la liste — comportement
  // identique au template d'origine.
  // ------------------------------------------------------
  heurePlanning(config, hass) {

    if (!hass) return null;

    const planning = hass.states[config.entity_planning]?.state;

    if (!planning || ["unknown", "unavailable", "none", ""].includes(planning)) {
      return "unknown";
    }

    const maintenant = SystemeChauffageCard._nowHHMM();
    let resultat = null;

    for (const item of planning.split(",")) {
      if (item.includes("|")) {

        const [hBrut, mBrut] = item.split("|");
        const h = (hBrut || "").trim();
        const m = (mBrut || "").trim();

        // On garde le PREMIER créneau trouvé après maintenant
        // (résultat === null évite d'écraser une trouvaille précédente).
        if (h > maintenant && resultat === null) {
          resultat = `${h}|${m}`;
        }

      }
    }

    if (resultat === null) {
      return planning.split(",")[0].trim();
    }

    return resultat;

  },

  // ------------------------------------------------------
  // HEURE PLANNING PRÉCÉDENT (dernier créneau déjà passé)
  // ------------------------------------------------------
  // Même logique que ci-dessus, mais on garde le DERNIER créneau
  // dont l'heure est déjà passée (<=  maintenant) — donc on ne
  // s'arrête pas au premier trouvé, contrairement à heurePlanning.
  // Si aucun n'est encore passé, on revient au DERNIER créneau
  // de la liste (fin de journée précédente).
  // ------------------------------------------------------
  heurePlanningPrecedent(config, hass) {

    if (!hass) return null;

    const planning = hass.states[config.entity_planning]?.state;

    if (!planning || ["unknown", "unavailable", "none", ""].includes(planning)) {
      return "unknown";
    }

    const maintenant = SystemeChauffageCard._nowHHMM();
    let resultat = null;

    for (const item of planning.split(",")) {
      if (item.includes("|")) {

        const [hBrut, mBrut] = item.split("|");
        const h = (hBrut || "").trim();
        const m = (mBrut || "").trim();

        // Ici on écrase à chaque créneau passé trouvé : on veut
        // le DERNIER, pas le premier (pas de "resultat === null").
        if (h <= maintenant) {
          resultat = `${h}|${m}`;
        }

      }
    }

    if (resultat === null) {
      const items = planning.split(",");
      return items[items.length - 1].trim();
    }

    return resultat;

  },

  // ------------------------------------------------------
  // HEURE ANTICIPÉE (heure de démarrage du chauffage)
  // ------------------------------------------------------
  // Traduction du template Jinja2. Utilise directement les
  // résultats de heurePlanning() et tempsChauffe() ci-dessus au
  // lieu de relire sensor.heure_planning_chauffage_bureau et
  // sensor.capteur_temps_de_chauffe_bureau : ce sont exactement
  // les mêmes valeurs, maintenant calculées ici même.
  //
  // ⚠️ DIFFÉRENCE VOLONTAIRE avec le template Jinja d'origine :
  // dans le template, `strptime(cible_ok, '%H:%M')` crée un
  // datetime SANS date (année 1900 par défaut), donc la comparaison
  // `d < now()` était TOUJOURS vraie (1900 < aujourd'hui) — la
  // branche "sinon" n'était donc jamais réellement atteinte en
  // pratique. Ici, on construit `d` avec la date d'AUJOURD'HUI,
  // pour que la comparaison ait un sens réel. Dis-moi si tu
  // préfères qu'on reproduise exactement l'ancien comportement.
  // ------------------------------------------------------
  heureAnticipee(config, hass) {

    if (!hass) return null;

    const planning = SystemeChauffageCard.CALC.heurePlanning(config, hass);
    const cible = (planning || "").split("|")[0];

    if (!cible || ["unknown", "unavailable", "none", ""].includes(cible)) {
      return cible || "--";
    }

    // "07h30" → "07:30"
    const cibleOk = cible.replace("h", ":").substring(0, 5);

    const besoin = SystemeChauffageCard.CALC.tempsChauffe(config, hass);

    if (besoin !== null && besoin > 0 && besoin < 180) {

      const [hh, mm] = cibleOk.split(":").map(Number);
      if (isNaN(hh) || isNaN(mm)) return cibleOk;

      const maintenant = new Date();
      const cibleDate = new Date(
        maintenant.getFullYear(),
        maintenant.getMonth(),
        maintenant.getDate(),
        hh,
        mm
      );

      const d = new Date(cibleDate.getTime() - besoin * 60000);

      if (d < maintenant) {
        return SystemeChauffageCard._nowHHMM();
      }

      return SystemeChauffageCard._formatHHMM(d);

    }

    return cibleOk;

  },

};

// Petits utilitaires de formatage d'heure, partagés par les
// calculs ci-dessus (évite de dupliquer le padStart partout).
SystemeChauffageCard._nowHHMM = function () {
  return SystemeChauffageCard._formatHHMM(new Date());
};

SystemeChauffageCard._formatHHMM = function (date) {
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
};

// ==============================================================
// CALCULATIONS — ce qui s'affiche dans la carte
// ==============================================================
// Fait le lien entre les fonctions de CALC ci-dessus et leur
// affichage (label, unité). Pour ajouter un futur calcul, ajoute
// sa fonction dans CALC, puis une ligne ici.
// ==============================================================
SystemeChauffageCard.CALCULATIONS = [
  { key: "temps_chauffe",            label: "Temps de chauffe",         unit: "Min", compute: SystemeChauffageCard.CALC.tempsChauffe },
  { key: "heure_planning",           label: "Heure planning",           unit: "H",   compute: SystemeChauffageCard.CALC.heurePlanning },
  { key: "heure_planning_precedent", label: "Heure planning précédent", unit: "H",   compute: SystemeChauffageCard.CALC.heurePlanningPrecedent },
  { key: "heure_anticipee",          label: "Heure anticipée",          unit: "H",   compute: SystemeChauffageCard.CALC.heureAnticipee },
];

// ==============================================================
// ÉDITEUR GRAPHIQUE (visuel "tuiles")
// ==============================================================
// Cette classe génère le formulaire qui s'affiche quand tu cliques
// sur "Modifier" sur la carte dans le dashboard. Chaque champ de
// FIELDS devient une "tuile" avec son label et un sélecteur
// d'entité <ha-entity-picker> — le même composant que HA utilise
// nativement (recherche, icônes, filtre par domaine).
// ==============================================================
class SystemeChauffageCardEditor extends HTMLElement {

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  // Appelé une fois par HA avec la config actuelle de la carte
  // (vide si on vient tout juste de l'ajouter au dashboard).
  //
  // ⚠️ BUG CORRIGÉ ICI : avant, setConfig() ET le setter hass()
  // appelaient tous les deux _render(), qui reconstruisait TOUT
  // le HTML à chaque fois (innerHTML = ...). Or HA réassigne hass
  // très souvent — y compris pendant que tu tapes dans le champ
  // de recherche du picker. Résultat : le <ha-entity-picker> était
  // détruit et recréé sous tes doigts, ce qui fermait son menu
  // déroulant en pleine frappe.
  //
  // La règle à retenir pour tout composant HA avec des champs
  // interactifs : on construit la structure du DOM UNE SEULE FOIS,
  // et ensuite on ne fait plus que mettre à jour les propriétés
  // des éléments déjà en place (_updatePickers), sans jamais les
  // recréer.
  setConfig(config) {

    this._config = config || {};

    // On ne construit le formulaire que s'il n'existe pas encore.
    if (!this._built) {
      this._buildForm();
    }

    this._updatePickers();

  }

  // Comme pour la carte principale, HA injecte l'objet hass ici,
  // et le fait très fréquemment (à chaque changement d'état dans
  // toute la maison, pas seulement pour cette carte).
  set hass(hass) {

    this._hass = hass;

    // Si le formulaire est déjà construit, on se contente de
    // rafraîchir les propriétés des pickers existants — jamais
    // de reconstruction ici, justement pour ne pas interrompre
    // une saisie en cours.
    if (this._built) {
      this._updatePickers();
    }

  }

  get hass() {
    return this._hass;
  }

  // ==========================================================
  // CONSTRUCTION (appelée UNE SEULE FOIS)
  // ==========================================================
  // Pose le style et une tuile par entrée de FIELDS, avec un
  // <ha-entity-picker> vide dedans (sans valeur ni hass pour
  // l'instant — ça viendra juste après, via _updatePickers).
  _buildForm() {

    this.shadowRoot.innerHTML = `

      <style>

        /* Grille "tuiles" : responsive, s'adapte à la largeur
           du panneau d'édition (qui peut être étroit sur mobile). */
        .grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 12px;
          padding: 4px 0 12px 0;
        }

        .tile {
          background: var(--secondary-background-color, #242424);
          border: 1px solid var(--divider-color, #333333);
          border-radius: 10px;
          padding: 10px 12px;
        }

        .tile-label {
          font-size: 13px;
          color: var(--secondary-text-color, #999999);
          margin-bottom: 6px;
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .required-mark {
          color: #ff5252;
        }

      </style>

      <div class="grid">
        ${SystemeChauffageCard.FIELDS.map((field) => `
          <div class="tile">
            <div class="tile-label">
              ${field.label}
              ${field.required ? '<span class="required-mark">*</span>' : ""}
            </div>
            <ha-entity-picker data-key="${field.key}"></ha-entity-picker>
          </div>
        `).join("")}
      </div>

    `;

    // On attache les écouteurs d'événements ICI, une seule fois,
    // sur les pickers qui viennent d'être créés. Comme ils ne
    // seront plus jamais recréés, pas besoin de les rattacher
    // à chaque mise à jour.
    const pickers = this.shadowRoot.querySelectorAll("ha-entity-picker");

    pickers.forEach((picker) => {

      const key = picker.dataset.key;

      // Quand l'utilisateur choisit (ou efface) une entité,
      // ha-entity-picker émet un événement "value-changed".
      picker.addEventListener("value-changed", (ev) => {
        ev.stopPropagation(); // on gère l'événement ici, pas besoin qu'il remonte plus haut
        this._updateConfig(key, ev.detail.value);
      });

    });

    this._built = true;

  }

  // ==========================================================
  // MISE À JOUR (appelée à chaque changement de hass ou de config)
  // ==========================================================
  // Ne touche QUE les propriétés des pickers déjà présents dans
  // le DOM — ne recrée jamais d'élément. C'est ce qui permet de
  // garder le focus et le menu déroulant ouverts pendant la frappe.
  _updatePickers() {

    if (!this._hass || !this._config) return;

    const pickers = this.shadowRoot.querySelectorAll("ha-entity-picker");

    pickers.forEach((picker) => {

      const key = picker.dataset.key;
      const field = SystemeChauffageCard.FIELDS.find((f) => f.key === key);
      const newValue = this._config[key] || "";

      picker.hass = this._hass;
      picker.required = !!field.required;
      picker.label = field.label;

      // Filtre la liste déroulante pour ne proposer que les
      // entités du bon domaine (ex: seulement les "sensor" pour
      // une température), si un domaine est précisé dans FIELDS.
      if (field.domain) {
        picker.includeDomains = [field.domain];
      }

      // On ne réassigne .value que si la valeur a réellement
      // changé (par ex. après un config-changed déclenché ailleurs).
      // Ça évite de perturber le champ de saisie interne du picker
      // si l'utilisateur est justement en train d'y taper du texte
      // de recherche (qui n'est pas la même chose que .value, mais
      // autant limiter les écritures inutiles).
      if (picker.value !== newValue) {
        picker.value = newValue;
      }

    });

  }

  // Met à jour la config locale, puis PRÉVIENT Home Assistant du
  // changement via un événement "config-changed". C'est le contrat
  // standard que HA écoute pour sauvegarder automatiquement la
  // nouvelle config de la carte (pas besoin de bouton "Enregistrer").
  _updateConfig(key, value) {

    this._config = {
      ...this._config,
      [key]: value,
    };

    const event = new CustomEvent("config-changed", {
      detail: { config: this._config },
      bubbles: true,
      composed: true, // pour traverser la frontière du Shadow DOM
    });

    this.dispatchEvent(event);

  }

}

if (!customElements.get("systeme-chauffage-card-editor")) {
  customElements.define(
    "systeme-chauffage-card-editor",
    SystemeChauffageCardEditor
  );
}

// ----------------------------------------------------------
// ENREGISTREMENT DU CUSTOM ELEMENT
// ----------------------------------------------------------

if (!customElements.get("systeme-chauffage-card")) {

  customElements.define(
    "systeme-chauffage-card",
    SystemeChauffageCard
  );

}

// ----------------------------------------------------------
// DÉCLARATION AUPRÈS DE HOME ASSISTANT
// (pour qu'elle apparaisse dans le sélecteur de cartes de l'UI)
// ----------------------------------------------------------

window.customCards = window.customCards || [];

if (
  !window.customCards.some(
    (card) => card.type === "systeme-chauffage-card"
  )
) {

  window.customCards.push({
    type: "systeme-chauffage-card",
    name: "Système de chauffage",
    description: "Système de chauffage personnalisé",
    preview: true,
  });

}
