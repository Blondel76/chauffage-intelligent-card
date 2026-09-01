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
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
        gap: 10px;
        margin-top: 16px;
      }

      /* ==============================
         BLOC
         ============================== */

      .box {
        background: var(--secondary-background-color, #242424);
        border: 1px solid var(--divider-color, #333333);
        border-radius: 10px;
        padding: 12px;
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
      .filter((field) => !field.isState)
      .map((field) => ({
        label: field.label,
        entity: config[field.key],
        unit: field.unit,
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
  // RÉCUPÉRATION D'UNE VALEUR D'ÉTAT
  // ==========================================================
  // Petite fonction utilitaire : va chercher l'état d'une entité
  // dans hass.states, et renvoie "--" si l'entité n'est pas
  // configurée ou n'existe pas (évite les erreurs JS en pleine
  // figure si une entité est mal orthographiée).
  _getState(entityId) {

    if (!entityId) return "--";

    const stateObj = this._hass.states[entityId];

    if (!stateObj) return "--";

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

        const value = this._getState(box.entity);

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
//   - key      : nom de la clé dans la config (ex: "entity_temp_ext")
//   - label    : texte affiché (dans la carte ET dans l'éditeur)
//   - unit     : unité affichée dans la box
//   - required : true = obligatoire (bloque setConfig + astérisque
//                rouge dans l'éditeur graphique)
//   - domain   : filtre optionnel pour l'éditeur, pour ne proposer
//                que les entités du bon type (ex: "sensor", "climate")
//   - isState  : true pour l'entité d'état, traitée à part dans
//                render() (texte "Arrêté"/"Chauffe" plutôt que
//                valeur + unité)
//
// setConfig(), render() ET l'éditeur graphique lisent tous les
// trois cette même liste. Résultat : pour ajouter un nouveau champ
// à ta carte, tu n'as QU'UNE LIGNE à ajouter ici, et il apparaîtra
// automatiquement dans la carte ET dans le formulaire de config.
// ==============================================================
SystemeChauffageCard.FIELDS = [
  { key: "entity_temp_ext",        label: "Température extérieure",   unit: "°C",     required: true,  domain: "sensor" },
  { key: "entity_temp_int",        label: "Température intérieure",   unit: "°C",     required: true,  domain: "sensor" },
  { key: "entity_consigne",        label: "Consigne",                 unit: "°C",     required: false, domain: "climate" },
  { key: "entity_temps_chauffe",   label: "Temps de chauffe",         unit: "Min",    required: false },
  { key: "entity_heure_anticipee", label: "Heure anticipée",          unit: "H",      required: false },
  { key: "entity_heure_precedent", label: "Heure planning précédent", unit: "H",      required: false },
  { key: "entity_heure_planning",  label: "Heure planning",           unit: "H",      required: false },
  { key: "entity_planning",        label: "Planning en cours",        unit: "",       required: false },
  { key: "entity_coefficient",     label: "Coefficient",              unit: "Min/°C", required: false },
  { key: "entity_derive",          label: "Dérive",                   unit: "°C/Min", required: false },
  { key: "entity_etat",            label: "État du chauffage",        unit: "",       required: true,  domain: "climate", isState: true },
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
