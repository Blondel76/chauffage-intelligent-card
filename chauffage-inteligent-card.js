class ChauffageInteligentCard extends HTMLElement {

  constructor() {
    super();

    this.attachShadow({ mode: "open" });
    this._rendered = false;
  }

  // ==========================================================
  // CONFIGURATION
  // ==========================================================

  setConfig(config) {

    this.config = config || {};

    if (!this._hass) {
      return;
    }

    this.render();
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
  // CONSTRUCTION AUTOMATIQUE DES ENTITES
  // ==========================================================
  //
  // Exemple :
  //
  // area = bureau_salle_de_jeux
  //
  // devient automatiquement :
  //
  // number.coefficient_bureau_salle_de_jeux
  // sensor.derive_bureau_salle_de_jeux
  // sensor.heure_anticipee_bureau_salle_de_jeux
  // sensor.heure_planning_bureau_salle_de_jeux
  // sensor.heure_planning_precedent_bureau_salle_de_jeux
  // sensor.temps_de_chauffe_bureau_salle_de_jeux
  //
  // ==========================================================

  _getEntities(area) {

    if (!area) {
      return null;
    }

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
  // LECTURE D'UNE ENTITE
  // ==========================================================

  _getState(entityId) {

    if (!entityId || !this._hass) {
      return "--";
    }

    const entity = this._hass.states[entityId];

    if (!entity) {
      return "--";
    }

    return entity.state;
  }

  // ==========================================================
  // FORMATAGE
  // ==========================================================

  _formatValue(value) {

    if (
      value === undefined ||
      value === null ||
      value === "" ||
      value === "unknown" ||
      value === "unavailable"
    ) {
      return "--";
    }

    return value;
  }

  // ==========================================================
  // NOM DE LA PIECE
  // ==========================================================

  _getAreaName(areaId) {

    if (!areaId || !this._hass) {
      return "Aucune pièce sélectionnée";
    }

    /*
     * On demande le registre des areas uniquement pour
     * récupérer le nom humain de la pièce.
     *
     * Le fonctionnement de la carte ne dépend PAS de cette
     * récupération : les entités utilisent directement areaId.
     */

    return this.config.area_name || areaId;
  }

  // ==========================================================
  // RENDU
  // ==========================================================

  render() {

    if (!this._hass || !this.config) {
      return;
    }

    const area = this.config.area || "";

    const areaName =
      this.config.area_name ||
      area ||
      "Aucune pièce sélectionnée";

    const entities = this._getEntities(area);

    let boxes = "";

    if (entities) {

      boxes = `

        <div class="box">
          <div class="label">Coefficient</div>
          <div class="value">
            ${this._formatValue(
              this._getState(entities.coefficient)
            )}
          </div>
        </div>

        <div class="box">
          <div class="label">Dérive</div>
          <div class="value">
            ${this._formatValue(
              this._getState(entities.derive)
            )}
            <span class="unit">°C/Min</span>
          </div>
        </div>

        <div class="box">
          <div class="label">Heure anticipée</div>
          <div class="value">
            ${this._formatValue(
              this._getState(entities.heureAnticipee)
            )}
          </div>
        </div>

        <div class="box">
          <div class="label">Heure planning</div>
          <div class="value">
            ${this._formatValue(
              this._getState(entities.heurePlanning)
            )}
          </div>
        </div>

        <div class="box">
          <div class="label">Planning précédent</div>
          <div class="value">
            ${this._formatValue(
              this._getState(entities.heurePlanningPrecedent)
            )}
          </div>
        </div>

        <div class="box">
          <div class="label">Temps de chauffe</div>
          <div class="value">
            ${this._formatValue(
              this._getState(entities.tempsChauffe)
            )}
            <span class="unit">Min</span>
          </div>
        </div>

      `;

    } else {

      boxes = `
        <div class="empty">
          Sélectionne une pièce dans la configuration.
        </div>
      `;
    }

    // ========================================================
    // CARTE
    // ========================================================

    this.shadowRoot.innerHTML = `

      <style>

        :host {
          display: block;
        }

        .card {
          background:
            var(--card-background-color, #1c1c1c);

          border:
            1px solid var(--divider-color, #333333);

          border-radius: 12px;

          padding: 16px;

          box-sizing: border-box;

          color:
            var(--primary-text-color, white);
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

        .room {
          margin-top: 3px;

          font-size: 14px;

          color:
            var(--secondary-text-color, #999999);
        }

        .icon {
          color: #ff9800;
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

          color:
            var(--secondary-text-color, #999999);
        }

        .value {
          margin-top: 5px;

          font-size: 22px;

          font-weight: 400;
        }

        .unit {
          font-size: 14px;

          color:
            var(--secondary-text-color, #999999);
        }

        .empty {
          margin-top: 16px;

          color:
            var(--secondary-text-color, #999999);
        }

      </style>

      <div class="card">

        <div class="header">

          <div>

            <div class="title">
              Chauffage
            </div>

            <div class="room">
              ${areaName}
            </div>

          </div>

          <div class="icon">

            <ha-icon
              icon="mdi:fire">
            </ha-icon>

          </div>

        </div>

        <div class="grid">

          ${boxes}

        </div>

      </div>

    `;
  }

  // ==========================================================
  // EDITEUR NATIF HOME ASSISTANT
  // ==========================================================

  static getConfigElement() {

    return document.createElement(
      "systeme-chauffage-card-editor"
    );
  }

  static getStubConfig() {

    return {
      area: ""
    };
  }

  // ==========================================================
  // TAILLE
  // ==========================================================

  getCardSize() {

    return 4;
  }
}


// =============================================================
// EDITEUR
// =============================================================

class SystemeChauffageCardEditor extends HTMLElement {

  constructor() {

    super();

    this.attachShadow({
      mode: "open"
    });

    this._built = false;
    this._selector = null;
  }

  // ==========================================================
  // CONFIG
  // ==========================================================

  setConfig(config) {

    this._config = {
      ...(config || {})
    };

    if (!this._config.area) {
      this._config.area = "";
    }

    this._build();

    this._updateSelector();
  }

  // ==========================================================
  // HASS
  // ==========================================================

  set hass(hass) {

    this._hass = hass;

    if (!this._built) {
      this._build();
    }

    this._updateSelector();
  }

  get hass() {

    return this._hass;
  }

  // ==========================================================
  // CONSTRUCTION DE L'EDITEUR
  // ==========================================================

  _build() {

    if (this._built) {
      return;
    }

    this.shadowRoot.innerHTML = `

      <style>

        .container {
          padding: 8px 0 16px 0;
        }

        .title {
          font-size: 14px;

          font-weight: 500;

          margin-bottom: 8px;
        }

        .info {
          margin-top: 10px;

          font-size: 12px;

          color:
            var(--secondary-text-color, #999999);
        }

      </style>

      <div class="container">

        <div class="title">
          Pièce
        </div>

        <ha-selector
          id="area-selector">
        </ha-selector>

        <div class="info">
          Les entités du chauffage sont sélectionnées
          automatiquement selon la pièce.
        </div>

      </div>

    `;

    this._selector =
      this.shadowRoot.querySelector(
        "#area-selector"
      );

    // --------------------------------------------------------
    // CHANGEMENT DE PIECE
    // --------------------------------------------------------

    this._selector.addEventListener(
      "value-changed",
      (event) => {

        const areaId =
          event.detail.value || "";

        this._config = {
          ...this._config,
          area: areaId
        };

        this._fireConfigChanged();
      }
    );

    this._built = true;
  }

  // ==========================================================
  // CONFIGURATION DU SELECTEUR NATIF
  // ==========================================================

  _updateSelector() {

    if (!this._selector || !this._hass) {
      return;
    }

    /*
     * C'est le sélecteur natif HA.
     *
     * selector:
     *   area:
     *
     * Home Assistant récupère lui-même les pièces
     * disponibles dans son registre.
     */

    this._selector.hass = this._hass;

    this._selector.selector = {
      area: {}
    };

    this._selector.value =
      this._config?.area || "";
  }

  // ==========================================================
  // CONFIG-CHANGED
  // ==========================================================

  _fireConfigChanged() {

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


// =============================================================
// ENREGISTREMENT DE L'EDITEUR
// =============================================================

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


// =============================================================
// ENREGISTREMENT DE LA CARTE
// =============================================================

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


// =============================================================
// DECLARATION HOME ASSISTANT
// =============================================================

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
      "Affichage du chauffage par pièce",

    preview:
      true
  });
}
