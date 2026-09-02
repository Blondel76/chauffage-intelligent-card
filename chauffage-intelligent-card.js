class ChauffageIntelligentCard extends HTMLElement {

  constructor() {
    super();

    this.attachShadow({ mode: "open" });
    this._rendered = false;
    this._lastArea = null;
    this._valueEls = null;
  }

  // ==========================================================
  // CONFIGURATION
  // ==========================================================

  setConfig(config) {

    this.config = config || {};

    if (!this._hass) {
      return;
    }

    this._fullRender();
  }

  // ==========================================================
  // HASS
  // ==========================================================

  set hass(hass) {

    this._hass = hass;

    if (!this.config) {
      return;
    }

    const area = this.config.area || "";

    if (!this._rendered || this._lastArea !== area) {
      this._fullRender();
    } else {
      this._updateValues();
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

      coefficient: `number.coefficient_${area}`,
      derive: `sensor.derive_${area}`,
      heureAnticipee: `sensor.heure_anticipee_${area}`,
      heurePlanning: `sensor.heure_planning_${area}`,
      heurePlanningPrecedent: `sensor.heure_planning_precedent_${area}`,
      tempsChauffe: `sensor.temps_de_chauffe_${area}`

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
  // NOM DE LA PIECE (via le registre des areas de HA)
  // ==========================================================

  _getAreaName(areaId) {

    if (!areaId) {
      return "Aucune pièce sélectionnée";
    }

    // Le registre des areas est exposé côté frontend HA sur
    // hass.areas (clé = area_id). On retombe sur area_name
    // fourni en config, puis sur le slug brut si indisponible.
    const registryName = this._hass?.areas?.[areaId]?.name;

    return registryName || this.config?.area_name || areaId;
  }

  // ==========================================================
  // RENDU COMPLET (structure + styles)
  // ==========================================================
  // Appelé uniquement à la création ou quand la pièce change.
  // ==========================================================

  _fullRender() {

    if (!this._hass || !this.config) {
      return;
    }

    const area = this.config.area || "";
    const areaName = this._getAreaName(area);
    const entities = this._getEntities(area);

    let boxesHtml = "";

    if (entities) {

      boxesHtml = `
        <div class="box">
          <div class="label">Coefficient</div>
          <div class="value" data-key="coefficient">--</div>
        </div>

        <div class="box">
          <div class="label">Dérive</div>
          <div class="value" data-key="derive">--<span class="unit">°C/Min</span></div>
        </div>

        <div class="box">
          <div class="label">Heure anticipée</div>
          <div class="value" data-key="heureAnticipee">--</div>
        </div>

        <div class="box">
          <div class="label">Heure planning</div>
          <div class="value" data-key="heurePlanning">--</div>
        </div>

        <div class="box">
          <div class="label">Planning précédent</div>
          <div class="value" data-key="heurePlanningPrecedent">--</div>
        </div>

        <div class="box">
          <div class="label">Temps de chauffe</div>
          <div class="value" data-key="tempsChauffe">--<span class="unit">Min</span></div>
        </div>
      `;

    } else {

      boxesHtml = `
        <div class="empty">
          Sélectionne une pièce dans la configuration.
        </div>
      `;
    }

    this.shadowRoot.innerHTML = `

      <style>

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

        .room {
          margin-top: 3px;
          font-size: 14px;
          color: var(--secondary-text-color, #999999);
        }

        .icon {
          color: var(--state-icon-color, #ff9800);
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
          margin-left: 4px;
          color: var(--secondary-text-color, #999999);
        }

        .empty {
          margin-top: 16px;
          color: var(--secondary-text-color, #999999);
        }

      </style>

      <div class="card">

        <div class="header">
          <div>
            <div class="title">Chauffage</div>
            <div class="room">${areaName}</div>
          </div>
          <div class="icon">
            <ha-icon icon="mdi:fire"></ha-icon>
          </div>
        </div>

        <div class="grid">
          ${boxesHtml}
        </div>

      </div>
    `;

    // On met en cache les nœuds de valeur pour ne plus jamais
    // avoir à régénérer le innerHTML entier ensuite.
    this._valueEls = entities
      ? {
          coefficient: this.shadowRoot.querySelector('[data-key="coefficient"]'),
          derive: this.shadowRoot.querySelector('[data-key="derive"]'),
          heureAnticipee: this.shadowRoot.querySelector('[data-key="heureAnticipee"]'),
          heurePlanning: this.shadowRoot.querySelector('[data-key="heurePlanning"]'),
          heurePlanningPrecedent: this.shadowRoot.querySelector('[data-key="heurePlanningPrecedent"]'),
          tempsChauffe: this.shadowRoot.querySelector('[data-key="tempsChauffe"]'),
        }
      : null;

    this._entities = entities;
    this._lastArea = area;
    this._rendered = true;

    this._updateValues();
  }

  // ==========================================================
  // MISE A JOUR DES VALEURS UNIQUEMENT
  // ==========================================================
  // Appelé à chaque update hass tant que la pièce ne change pas.
  // Ne touche que le texte des valeurs, pas toute la structure.
  // ==========================================================

  _updateValues() {

    if (!this._entities || !this._valueEls) {
      return;
    }

    const units = {
      derive: "°C/Min",
      tempsChauffe: "Min",
    };

    for (const [key, entityId] of Object.entries(this._entities)) {

      const el = this._valueEls[key];

      if (!el) {
        continue;
      }

      const value = this._formatValue(this._getState(entityId));
      const unit = units[key];
      const text = unit ? `${value}` : value;

      // On ne réécrit le texte que s'il a changé, pour éviter
      // toute réécriture DOM inutile.
      const firstChildText = el.firstChild
        ? el.firstChild.textContent
        : el.textContent;

      if (firstChildText !== text) {
        if (unit) {
          el.firstChild.textContent = text;
        } else {
          el.textContent = text;
        }
      }
    }
  }

  // ==========================================================
  // EDITEUR NATIF HOME ASSISTANT
  // ==========================================================

  static getConfigElement() {
    return document.createElement("chauffage-intelligent-card-editor");
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

class ChauffageIntelligentCardEditor extends HTMLElement {

  constructor() {
    super();

    this.attachShadow({ mode: "open" });

    this._built = false;
    this._selector = null;
  }

  setConfig(config) {

    this._config = { ...(config || {}) };

    if (!this._config.area) {
      this._config.area = "";
    }

    this._build();
    this._updateSelector();
  }

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
          color: var(--secondary-text-color, #999999);
        }

      </style>

      <div class="container">
        <div class="title">Pièce</div>
        <ha-selector id="area-selector"></ha-selector>
        <div class="info">
          Les entités du chauffage sont sélectionnées
          automatiquement selon la pièce.
        </div>
      </div>
    `;

    this._selector = this.shadowRoot.querySelector("#area-selector");

    this._selector.addEventListener("value-changed", (event) => {

      const areaId = event.detail.value || "";

      this._config = {
        ...this._config,
        area: areaId
      };

      this._fireConfigChanged();
    });

    this._built = true;
  }

  _updateSelector() {

    if (!this._selector || !this._hass) {
      return;
    }

    this._selector.hass = this._hass;
    this._selector.selector = { area: {} };
    this._selector.value = this._config?.area || "";
  }

  _fireConfigChanged() {

    this.dispatchEvent(
      new CustomEvent("config-changed", {
        detail: { config: this._config },
        bubbles: true,
        composed: true
      })
    );
  }
}


// =============================================================
// ENREGISTREMENT
// =============================================================

if (!customElements.get("chauffage-intelligent-card-editor")) {
  customElements.define("chauffage-intelligent-card-editor", ChauffageIntelligentCardEditor);
}

if (!customElements.get("chauffage-intelligent-card")) {
  customElements.define("chauffage-intelligent-card", ChauffageIntelligentCard);
}

window.customCards = window.customCards || [];

if (!window.customCards.some(card => card.type === "chauffage-intelligent-card")) {
  window.customCards.push({
    type: "chauffage-intelligent-card",
    name: "Chauffage intélligent card",
    description: "Affichage du chauffage par pièce",
    preview: true
  });
}
