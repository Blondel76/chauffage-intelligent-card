class SystemeChauffageCard extends HTMLElement {

  constructor() {
    super();

    this.attachShadow({ mode: "open" });

    this._initStyles();
  }

  // ==========================================================
  // STYLES
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
        color: var(--secondary-text-color, #999999);
        transition: color 0.3s ease;
      }

      ha-icon {
        --mdc-icon-size: 28px;
      }

      .grid {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 16px;
      }

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

  setConfig(config) {

    if (!config || !config.piece) {
      throw new Error(
        "systeme-chauffage-card : veuillez sélectionner une pièce."
      );
    }

    this.config = config;

    if (this._hass) {
      this.render();
    }
  }

  // ==========================================================
  // ÉDITEUR GRAPHIQUE
  // ==========================================================

  static getConfigElement() {
    return document.createElement(
      "systeme-chauffage-card-editor"
    );
  }

  static getStubConfig() {
    return {
      piece: ""
    };
  }

  // ==========================================================
  // HASS
  // ==========================================================

  set hass(hass) {

    this._hass = hass;

    if (this.config) {
      this.render();
    }
  }

  get hass() {
    return this._hass;
  }

  // ==========================================================
  // RÉCUPÉRATION D'UNE ENTITÉ
  // ==========================================================

  _getState(entityId) {

    if (!entityId) {
      return "--";
    }

    const stateObj = this._hass?.states?.[entityId];

    if (!stateObj) {
      return "--";
    }

    return stateObj.state;
  }

  // ==========================================================
  // NOM AFFICHÉ DE LA PIÈCE
  // ==========================================================

  _getRoomName() {

    const room = SystemeChauffageCard.ROOMS.find(
      item => item.id === this.config.piece
    );

    return room ? room.name : this.config.piece;
  }

  // ==========================================================
  // CONSTRUCTION AUTOMATIQUE DES ENTITÉS
  // ==========================================================

  _getEntities() {

    const piece = this.config.piece;

    return {

      coefficient:
        `number.coefficient_${piece}`,

      derive:
        `sensor.derive_${piece}`,

      heureAnticipee:
        `sensor.heure_anticipee_${piece}`,

      heurePlanning:
        `sensor.heure_planning_${piece}`,

      heurePlanningPrecedent:
        `sensor.heure_planning_precedent_${piece}`,

      tempsChauffe:
        `sensor.temps_de_chauffe_${piece}`

    };
  }

  // ==========================================================
  // COULEUR DE L'ICÔNE
  // ==========================================================

  _getIconColor() {

    const entities = this._getEntities();

    /*
     * Pour l'instant on regarde l'état du chauffage
     * uniquement si une entité correspondante existe.
     *
     * Comme tu ne m'as pas donné d'entité d'état dans ta liste,
     * l'icône reste grise.
     */

    return "var(--secondary-text-color, #999999)";
  }

  // ==========================================================
  // RENDU
  // ==========================================================

  render() {

    if (!this._hass || !this.config?.piece) {
      return;
    }

    const entities = this._getEntities();
    const roomName = this._getRoomName();
    const iconColor = this._getIconColor();

    const coefficient =
      this._getState(entities.coefficient);

    const derive =
      this._getState(entities.derive);

    const heureAnticipee =
      this._getState(entities.heureAnticipee);

    const heurePlanning =
      this._getState(entities.heurePlanning);

    const heurePlanningPrecedent =
      this._getState(entities.heurePlanningPrecedent);

    const tempsChauffe =
      this._getState(entities.tempsChauffe);

    let container =
      this.shadowRoot.querySelector(".card");

    if (!container) {

      container = document.createElement("div");

      container.className = "card";

      this.shadowRoot.appendChild(container);
    }

    container.innerHTML = `

      <div class="header">

        <div class="title">
          Chauffage — ${roomName}
        </div>

        <div
          class="icon"
          style="color: ${iconColor};"
        >
          <ha-icon icon="mdi:fire"></ha-icon>
        </div>

      </div>

      <div class="grid">

        <div class="box">
          <div class="label">
            Coefficient
          </div>

          <div class="value">
            <span>${coefficient}</span>
          </div>
        </div>

        <div class="box">
          <div class="label">
            Dérive
          </div>

          <div class="value">
            <span>${derive}</span>
            <span class="unit">°C/Min</span>
          </div>
        </div>

        <div class="box">
          <div class="label">
            Heure anticipée
          </div>

          <div class="value">
            <span>${heureAnticipee}</span>
          </div>
        </div>

        <div class="box">
          <div class="label">
            Heure planning
          </div>

          <div class="value">
            <span>${heurePlanning}</span>
          </div>
        </div>

        <div class="box">
          <div class="label">
            Planning précédent
          </div>

          <div class="value">
            <span>${heurePlanningPrecedent}</span>
          </div>
        </div>

        <div class="box">
          <div class="label">
            Temps de chauffe
          </div>

          <div class="value">
            <span>${tempsChauffe}</span>
            <span class="unit">Min</span>
          </div>
        </div>

      </div>
    `;
  }

  // ==========================================================
  // TAILLE
  // ==========================================================

  getCardSize() {
    return 4;
  }
}


// ==============================================================
// PIÈCES DISPONIBLES
// ==============================================================
//
// IMPORTANT :
// Le "id" doit correspondre EXACTEMENT au suffixe utilisé
// dans les noms de tes entités.
//
// Exemple :
// id = bureau_salle_de_jeux
//
// donnera automatiquement :
// number.coefficient_bureau_salle_de_jeux
// sensor.derive_bureau_salle_de_jeux
// etc.
//
// Ajoute simplement tes autres pièces ici.
// ==============================================================

SystemeChauffageCard.ROOMS = [

  {
    id: "bureau_salle_de_jeux",
    name: "Bureau salle de jeux"
  },

  {
    id: "salon",
    name: "Salon"
  },

  {
    id: "chambre",
    name: "Chambre"
  }

];


// ==============================================================
// ÉDITEUR GRAPHIQUE
// ==============================================================

class SystemeChauffageCardEditor extends HTMLElement {

  constructor() {

    super();

    this.attachShadow({
      mode: "open"
    });

    this._built = false;
  }


  // ==========================================================
  // CONFIG
  // ==========================================================

  setConfig(config) {

    this._config = {
      ...(config || {})
    };

    if (!this._built) {
      this._buildForm();
    }

    this._updateSelector();
  }


  // ==========================================================
  // HASS
  // ==========================================================

  set hass(hass) {

    this._hass = hass;

    if (!this._built) {
      this._buildForm();
    }

    this._updateSelector();
  }


  get hass() {
    return this._hass;
  }


  // ==========================================================
  // CONSTRUCTION DU FORMULAIRE
  // ==========================================================

  _buildForm() {

    this.shadowRoot.innerHTML = `

      <style>

        .container {
          padding: 4px 0 12px 0;
        }

        .label {
          font-size: 13px;
          color: var(
            --secondary-text-color,
            #999999
          );

          margin-bottom: 6px;
        }

        ha-select {
          width: 100%;
        }

      </style>

      <div class="container">

        <div class="label">
          Pièce
        </div>

        <ha-select
          id="piece"
          label="Sélectionner une pièce"
        >
        </ha-select>

      </div>

    `;

    const selector =
      this.shadowRoot.querySelector("#piece");

    selector.addEventListener(
      "selected-changed",
      (event) => {

        const value =
          event.detail.value;

        if (!value) {
          return;
        }

        this._updateConfig(value);
      }
    );

    this._built = true;
  }


  // ==========================================================
  // REMPLISSAGE DU MENU
  // ==========================================================

  _updateSelector() {

    if (!this._built) {
      return;
    }

    const selector =
      this.shadowRoot.querySelector("#piece");

    if (!selector) {
      return;
    }

    /*
     * On ne reconstruit pas le sélecteur à chaque changement
     * de hass.
     */

    if (!selector.__optionsBuilt) {

      selector.innerHTML = "";

      SystemeChauffageCard.ROOMS.forEach(
        (room) => {

          const option =
            document.createElement(
              "mwc-list-item"
            );

          option.value = room.id;
          option.textContent = room.name;

          selector.appendChild(option);
        }
      );

      selector.__optionsBuilt = true;
    }

    const value =
      this._config?.piece || "";

    if (selector.value !== value) {
      selector.value = value;
    }
  }


  // ==========================================================
  // MISE À JOUR DE LA CONFIG
  // ==========================================================

  _updateConfig(piece) {

    this._config = {
      ...this._config,
      piece
    };

    this.dispatchEvent(
      new CustomEvent(
        "config-changed",
        {
          detail: {
            config: this._config
          },
          bubbles: true,
          composed: true
        }
      )
    );
  }
}


// ==============================================================
// ENREGISTREMENT DE L'ÉDITEUR
// ==============================================================

if (
  !customElements.get(
    "systeme-chauffage-card-editor"
  )
) {

  customElements.define(
    "systeme-chauffage-card-editor",
    SystemeChauffageCardEditor
  );
}


// ==============================================================
// ENREGISTREMENT DE LA CARTE
// ==============================================================

if (
  !customElements.get(
    "systeme-chauffage-card"
  )
) {

  customElements.define(
    "systeme-chauffage-card",
    SystemeChauffageCard
  );
}


// ==============================================================
// DÉCLARATION HOME ASSISTANT
// ==============================================================

window.customCards =
  window.customCards || [];


if (
  !window.customCards.some(
    card =>
      card.type ===
      "systeme-chauffage-card"
  )
) {

  window.customCards.push({

    type:
      "systeme-chauffage-card",

    name:
      "Système de chauffage",

    description:
      "Affiche automatiquement les informations de chauffage d'une pièce.",

    preview:
      true
  });
}
