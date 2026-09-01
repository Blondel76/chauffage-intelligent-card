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

      .missing {
        opacity: 0.5;
      }

    `;

    this.shadowRoot.appendChild(style);
  }


  // ==========================================================
  // CONFIGURATION
  // ==========================================================

  setConfig(config) {

    if (!config || !config.area) {
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
    return {};
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

    const stateObj =
      this._hass?.states?.[entityId];

    if (!stateObj) {
      return "--";
    }

    return stateObj.state;
  }


  // ==========================================================
  // NOM DE LA ZONE
  // ==========================================================

  _getAreaName() {

    const areaId = this.config.area;

    /*
     * Home Assistant expose normalement les zones dans
     * hass.areas lorsqu'elles sont disponibles dans le
     * contexte de la carte.
     */

    if (
      this._hass?.areas &&
      this._hass.areas[areaId]
    ) {
      return (
        this._hass.areas[areaId].name ||
        areaId
      );
    }

    /*
     * Si hass.areas n'est pas disponible, on utilise
     * simplement l'identifiant de la zone.
     */

    return areaId;
  }


  // ==========================================================
  // ENTITÉS AUTOMATIQUES
  // ==========================================================

  _getEntities() {

    const area = this.config.area;

    return {

      coefficient:
        `number.coefficient_${area}`,

      derive:
        `sensor.derive_${area}`,

      heureAnticipee:
        `sensor.heure_anticipee_${area}`,

      heurePlanning:
        `sensor.heure_planning_${area}`,

      heurePlanningPrecedent:
        `sensor.heure_planning_precedent_${area}`,

      tempsChauffe:
        `sensor.temps_de_chauffe_${area}`

    };
  }


  // ==========================================================
  // RENDU
  // ==========================================================

  render() {

    if (!this._hass || !this.config?.area) {
      return;
    }

    const entities =
      this._getEntities();

    const areaName =
      this._getAreaName();

    const coefficient =
      this._getState(
        entities.coefficient
      );

    const derive =
      this._getState(
        entities.derive
      );

    const heureAnticipee =
      this._getState(
        entities.heureAnticipee
      );

    const heurePlanning =
      this._getState(
        entities.heurePlanning
      );

    const heurePlanningPrecedent =
      this._getState(
        entities.heurePlanningPrecedent
      );

    const tempsChauffe =
      this._getState(
        entities.tempsChauffe
      );


    let container =
      this.shadowRoot.querySelector(".card");


    if (!container) {

      container =
        document.createElement("div");

      container.className = "card";

      this.shadowRoot.appendChild(
        container
      );
    }


    container.innerHTML = `

      <div class="header">

        <div class="title">
          Chauffage — ${areaName}
        </div>

        <div class="icon">
          <ha-icon icon="mdi:fire"></ha-icon>
        </div>

      </div>


      <div class="grid">

        <div class="box">
          <div class="label">
            Coefficient
          </div>

          <div class="value">
            ${coefficient}
          </div>
        </div>


        <div class="box">
          <div class="label">
            Dérive
          </div>

          <div class="value">
            ${derive}
            <span class="unit">
              °C/Min
            </span>
          </div>
        </div>


        <div class="box">
          <div class="label">
            Heure anticipée
          </div>

          <div class="value">
            ${heureAnticipee}
          </div>
        </div>


        <div class="box">
          <div class="label">
            Heure planning
          </div>

          <div class="value">
            ${heurePlanning}
          </div>
        </div>


        <div class="box">
          <div class="label">
            Planning précédent
          </div>

          <div class="value">
            ${heurePlanningPrecedent}
          </div>
        </div>


        <div class="box">
          <div class="label">
            Temps de chauffe
          </div>

          <div class="value">
            ${tempsChauffe}
            <span class="unit">
              Min
            </span>
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



// ============================================================
// ÉDITEUR GRAPHIQUE
// ============================================================

class SystemeChauffageCardEditor extends HTMLElement {

  constructor() {

    super();

    this.attachShadow({
      mode: "open"
    });

    this._built = false;
  }


  // ==========================================================
  // CONFIGURATION
  // ==========================================================

  setConfig(config) {

    this._config = {
      ...(config || {})
    };

    this._buildForm();

    this._updateAreaPicker();
  }


  // ==========================================================
  // HASS
  // ==========================================================

  set hass(hass) {

    this._hass = hass;

    if (!this._built) {
      this._buildForm();
    }

    this._updateAreaPicker();
  }


  get hass() {
    return this._hass;
  }


  // ==========================================================
  // CONSTRUCTION DU FORMULAIRE
  // ==========================================================

  _buildForm() {

    if (this._built) {
      return;
    }

    this.shadowRoot.innerHTML = `

      <style>

        .container {
          padding: 4px 0 12px 0;
        }

        .label {
          font-size: 13px;
          color:
            var(
              --secondary-text-color,
              #999999
            );

          margin-bottom: 6px;
        }

        ha-entity-picker {
          width: 100%;
        }

      </style>


      <div class="container">

        <div class="label">
          Pièce
        </div>

        <ha-entity-picker
          id="area-picker">
        </ha-entity-picker>

      </div>

    `;


    const picker =
      this.shadowRoot.querySelector(
        "#area-picker"
      );


    /*
     * On utilise le picker HA natif avec un filtre
     * de zone.
     *
     * La sélection d'une zone est récupérée grâce
     * à l'événement value-changed.
     */

    picker.addEventListener(
      "value-changed",
      (event) => {

        const entityId =
          event.detail?.value;

        /*
         * Ce picker peut retourner une entité.
         * On ne veut PAS ça.
         *
         * La solution ci-dessous permet de récupérer
         * la zone de l'entité sélectionnée.
         */

        if (!entityId || !this._hass) {
          return;
        }

        const state =
          this._hass.states[entityId];

        const areaId =
          state?.attributes?.area_id;

        if (areaId) {
          this._updateConfig(areaId);
        }

      }
    );


    this._built = true;
  }


  // ==========================================================
  // SÉLECTION DE LA ZONE
  // ==========================================================

  _updateAreaPicker() {

    if (
      !this._built ||
      !this._hass
    ) {
      return;
    }

    const picker =
      this.shadowRoot.querySelector(
        "#area-picker"
      );

    if (!picker) {
      return;
    }


    picker.hass =
      this._hass;

    /*
     * On demande au picker de travailler
     * avec les zones.
     */

    picker.includeDomains = [];


    /*
     * Si une zone est déjà enregistrée,
     * on essaie de conserver sa valeur.
     */

    if (
      this._config?.area &&
      picker.value !== this._config.area
    ) {

      picker.value =
        this._config.area;
    }

  }


  // ==========================================================
  // CONFIG CHANGED
  // ==========================================================

  _updateConfig(areaId) {

    this._config = {
      ...this._config,
      area: areaId
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



// ============================================================
// ENREGISTREMENT ÉDITEUR
// ============================================================

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



// ============================================================
// ENREGISTREMENT CARTE
// ============================================================

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



// ============================================================
// DÉCLARATION HOME ASSISTANT
// ============================================================

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
