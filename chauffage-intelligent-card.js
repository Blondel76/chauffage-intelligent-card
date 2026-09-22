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
  // sensor.heure_planning_bureau_salle_de_jeux
  // sensor.humidite_bureau_salle_de_jeux (optionnel selon config de la pièce)
  //
  // Le thermostat de la pièce (climate.*) n'est PAS déduit
  // automatiquement : il y a souvent deux entités climate par
  // pièce (le thermostat ET la vanne en chauffage gaz), donc on
  // demande explicitement laquelle utiliser dans l'éditeur.
  //
  // ==========================================================

  _getEntities(area) {

    if (!area) {
      return null;
    }

    return {

      heurePlanning: `sensor.heure_planning_${area}`,
      humidite: `sensor.humidite_${area}`,

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

    const registryName = this._hass?.areas?.[areaId]?.name;

    return registryName || this.config?.area_name || areaId;
  }

  // ==========================================================
  // COULEUR DE SECURITE (suit le thème HA, pas de couleur fixe)
  // ==========================================================

  _securityColorVar(securityState) {

    const map = {
      vert: "var(--success-color, #4caf50)",
      orange: "var(--warning-color, #ff9800)",
      rouge: "var(--error-color, #f44336)",
      gris: "var(--disabled-text-color, #9e9e9e)",
    };

    return map[securityState] || map.gris;
  }

  // ==========================================================
  // FORMATAGE DU PROCHAIN CRENEAU ("18h00|confort" -> "18h00 confort")
  // ==========================================================

  _formatPlanningSlot(rawState) {

    if (!rawState || rawState === "unknown" || rawState === "unavailable") {
      return "--";
    }

    if (!rawState.includes("|")) {
      return rawState;
    }

    const [heure, preset] = rawState.split("|");

    return `${heure.trim()} ${preset.trim()}`;
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
    const securiteEntity = area ? `sensor.securite_${area}` : null;

    let bodyHtml = "";

    if (entities) {

      bodyHtml = `
        <div class="dial-wrap">
          <svg viewBox="0 0 180 180" class="dial-svg">
            <circle cx="90" cy="90" r="78" class="dial-track" />
            <circle cx="90" cy="90" r="78" class="dial-progress" data-key="dialProgress" />
          </svg>
          <div class="dial-center">
            <div class="dial-value" data-key="dialValue">--</div>
            <div class="dial-sub" data-key="dialSub">--</div>
          </div>
        </div>

        <div class="humidity-row">
          <ha-icon icon="mdi:water-percent"></ha-icon>
          <span data-key="humidite">--</span>
        </div>

        <div class="next-slot" data-key="nextSlot">--</div>
      `;

    } else {

      bodyHtml = `
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
          background: var(--ha-card-background, var(--card-background-color));
          border: 1px solid var(--divider-color);
          border-radius: var(--ha-card-border-radius, 12px);
          padding: 16px;
          box-sizing: border-box;
          color: var(--primary-text-color);
        }

        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .room {
          font-size: 16px;
          font-weight: 500;
        }

        .heating-badge {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 4px 10px;
          border-radius: 20px;
          font-size: 12px;
          background: var(--secondary-background-color);
          color: var(--secondary-text-color);
        }

        .heating-badge.active {
          background: rgba(var(--rgb-success-color, 76, 175, 80), 0.15);
          color: var(--success-color, #4caf50);
        }

        .heating-badge ha-icon {
          --mdc-icon-size: 16px;
        }

        .dial-wrap {
          position: relative;
          width: 180px;
          height: 180px;
          margin: 20px auto 16px;
        }

        .dial-svg {
          width: 100%;
          height: 100%;
        }

        .dial-track {
          fill: none;
          stroke: var(--divider-color);
          stroke-width: 10;
        }

        .dial-progress {
          fill: none;
          stroke-width: 10;
          stroke-linecap: round;
          transform: rotate(-90deg);
          transform-origin: 90px 90px;
          transition: stroke-dashoffset 0.4s ease, stroke 0.4s ease;
        }

        .dial-center {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
        }

        .dial-value {
          font-size: 34px;
          font-weight: 500;
          line-height: 1;
        }

        .dial-sub {
          margin-top: 6px;
          font-size: 12px;
          color: var(--secondary-text-color);
        }

        .humidity-row {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          font-size: 14px;
          color: var(--secondary-text-color);
          margin-bottom: 12px;
        }

        .humidity-row ha-icon {
          --mdc-icon-size: 18px;
        }

        .next-slot {
          text-align: center;
          font-size: 13px;
          color: var(--secondary-text-color);
          border-top: 1px solid var(--divider-color);
          padding-top: 10px;
        }

        .empty {
          margin-top: 16px;
          color: var(--secondary-text-color);
        }

      </style>

      <div class="card">

        <div class="header">
          <div class="room">${areaName}</div>
          <div class="heating-badge" data-key="heatingBadge">
            <ha-icon icon="mdi:fire"></ha-icon>
            <span data-key="heatingLabel">--</span>
          </div>
        </div>

        ${bodyHtml}

      </div>
    `;

    this._valueEls = entities
      ? {
          humidite: this.shadowRoot.querySelector('[data-key="humidite"]'),
          nextSlot: this.shadowRoot.querySelector('[data-key="nextSlot"]'),
          dialValue: this.shadowRoot.querySelector('[data-key="dialValue"]'),
          dialSub: this.shadowRoot.querySelector('[data-key="dialSub"]'),
          dialProgress: this.shadowRoot.querySelector('[data-key="dialProgress"]'),
          heatingBadge: this.shadowRoot.querySelector('[data-key="heatingBadge"]'),
          heatingLabel: this.shadowRoot.querySelector('[data-key="heatingLabel"]'),
        }
      : null;

    this._entities = entities;
    this._securiteEntity = securiteEntity;
    this._lastArea = area;
    this._rendered = true;

    this._updateValues();
  }

  // ==========================================================
  // MISE A JOUR DES VALEURS UNIQUEMENT
  // ==========================================================
  // Appelé à chaque update hass tant que la pièce ne change pas.
  // ==========================================================

  _updateValues() {

    if (!this._entities || !this._valueEls) {
      return;
    }

    const els = this._valueEls;
    const circumference = 2 * Math.PI * 78;

    // --- Sécurité (pilote la couleur de l'anneau) ---
    const securiteState = this._getState(this._securiteEntity);
    const ringColor = this._securityColorVar(securiteState);

    // --- Entité climate choisie explicitement dans l'éditeur ---
    const climateEntityId = this.config?.climate_entity || null;
    const climateState = climateEntityId ? this._hass.states[climateEntityId] : null;

    const current = climateState?.attributes?.current_temperature;
    const target = climateState?.attributes?.temperature;
    const heating = climateState?.attributes?.hvac_action === "heating";

    if (current !== undefined && current !== null) {

      els.dialValue.textContent = `${Number(current).toFixed(1)}°`;
      els.dialSub.textContent = target !== undefined && target !== null
        ? `consigne ${Number(target).toFixed(1)}°`
        : "consigne --";

      const ratio = target !== undefined && target !== null
        ? Math.min(Math.max((current - (target - 5)) / 5, 0), 1)
        : 0.5;

      els.dialProgress.style.strokeDashoffset = `${circumference * (1 - ratio)}`;

    } else {

      els.dialValue.textContent = "--";
      els.dialSub.textContent = climateEntityId
        ? "--"
        : "thermostat non configuré";
      els.dialProgress.style.strokeDashoffset = "0";
    }

    els.dialProgress.style.strokeDasharray = `${circumference}`;
    els.dialProgress.style.stroke = ringColor;

    // --- Badge chauffe ---
    if (els.heatingBadge.classList.contains("active") !== heating) {
      els.heatingBadge.classList.toggle("active", heating);
    }
    els.heatingLabel.textContent = heating ? "Chauffe" : "Éteint";

    // --- Humidité (valeur numérique brute) ---
    const humiditeRaw = this._getState(this._entities.humidite);
    const humiditeValue = parseFloat(humiditeRaw);
    els.humidite.textContent = Number.isFinite(humiditeValue)
      ? `${Math.round(humiditeValue)}%`
      : "--";

    // --- Prochain créneau ---
    els.nextSlot.textContent = `Prochain ${this._formatPlanningSlot(this._getState(this._entities.heurePlanning))}`;
  }

  // ==========================================================
  // EDITEUR NATIF HOME ASSISTANT
  // ==========================================================

  static getConfigElement() {
    return document.createElement("chauffage-intelligent-card-editor");
  }

  static getStubConfig() {
    return {
      area: "",
      climate_entity: "",
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
    this._areaSelector = null;
    this._climateSelector = null;
  }

  setConfig(config) {

    this._config = { ...(config || {}) };

    if (!this._config.area) {
      this._config.area = "";
    }

    if (!this._config.climate_entity) {
      this._config.climate_entity = "";
    }

    this._build();
    this._updateSelectors();
  }

  set hass(hass) {

    this._hass = hass;

    if (!this._built) {
      this._build();
    }

    this._updateSelectors();
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

        .field {
          margin-bottom: 16px;
        }

        .title {
          font-size: 14px;
          font-weight: 500;
          margin-bottom: 8px;
        }

        .info {
          margin-top: 6px;
          font-size: 12px;
          color: var(--secondary-text-color, #999999);
        }

      </style>

      <div class="container">
        <div class="field">
          <div class="title">Pièce</div>
          <ha-selector id="area-selector"></ha-selector>
          <div class="info">
            Les entités (humidité, planning...) sont sélectionnées
            automatiquement selon la pièce.
          </div>
        </div>

        <div class="field">
          <div class="title">Thermostat de la pièce</div>
          <ha-selector id="climate-selector"></ha-selector>
          <div class="info">
            À choisir explicitement : en chauffage gaz, la vanne est
            aussi une entité climate, donc elle n'est pas devinée
            automatiquement.
          </div>
        </div>
      </div>
    `;

    this._areaSelector = this.shadowRoot.querySelector("#area-selector");
    this._climateSelector = this.shadowRoot.querySelector("#climate-selector");

    this._areaSelector.addEventListener("value-changed", (event) => {

      this._config = {
        ...this._config,
        area: event.detail.value || "",
      };

      this._fireConfigChanged();
    });

    this._climateSelector.addEventListener("value-changed", (event) => {

      this._config = {
        ...this._config,
        climate_entity: event.detail.value || "",
      };

      this._fireConfigChanged();
    });

    this._built = true;
  }

  _updateSelectors() {

    if (!this._areaSelector || !this._climateSelector || !this._hass) {
      return;
    }

    this._areaSelector.hass = this._hass;
    this._areaSelector.selector = { area: {} };
    this._areaSelector.value = this._config?.area || "";

    this._climateSelector.hass = this._hass;
    this._climateSelector.selector = { entity: { domain: "climate" } };
    this._climateSelector.value = this._config?.climate_entity || "";
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
