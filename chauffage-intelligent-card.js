class ChauffageIntelligentCard extends HTMLElement {

  constructor() {
    super();

    this.attachShadow({ mode: "open" });
    this._rendered = false;
    this._lastArea = null;
    this._valueEls = null;
    this._climateEntityId = undefined;
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
      tempsChauffe: `sensor.temps_de_chauffe_${area}`,
      securite: `sensor.securite_${area}`,
      aeration: `sensor.aeration_${area}`,
      humidite: `sensor.humidite_${area}`,
      fenetreOuverte: `switch.fenetre_ouverte_${area}`,

    };
  }

  // ==========================================================
  // RECHERCHE DE L'ENTITE CLIMATE DE LA PIECE
  // ==========================================================

  _resolveClimateEntity(area) {

    if (!area || !this._hass) {
      return null;
    }

    const entities = this._hass.entities;
    const devices = this._hass.devices;

    if (!entities) {
      return null;
    }

    for (const [entityId, entry] of Object.entries(entities)) {

      if (!entityId.startsWith("climate.")) {
        continue;
      }

      const entityArea = entry.area_id
        || (devices && entry.device_id
          ? devices[entry.device_id]?.area_id
          : null);

      if (entityArea === area) {
        return entityId;
      }
    }

    return null;
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

    if (!areaId) {
      return "Aucune pièce sélectionnée";
    }

    const registryName = this._hass?.areas?.[areaId]?.name;

    return registryName || this.config?.area_name || areaId;
  }

  // ==========================================================
  // COULEUR DE SECURITE
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
  // RENDU COMPLET
  // ==========================================================

  _fullRender() {

    if (!this._hass || !this.config) {
      return;
    }

    const area = this.config.area || "";
    const areaName = this._getAreaName(area);
    const entities = this._getEntities(area);

    this._climateEntityId = this._resolveClimateEntity(area);

    let bodyHtml = "";

    if (entities) {

      bodyHtml = `
        <div class="dial-wrap">

          <svg viewBox="0 0 180 180" class="dial-svg">

            <circle
              cx="90"
              cy="90"
              r="78"
              class="dial-track"
            />

            <circle
              cx="90"
              cy="90"
              r="78"
              class="dial-progress"
              data-key="dialProgress"
            />

          </svg>

          <div class="dial-center">

            <div
              class="dial-value"
              data-key="dialValue"
            >
              --
            </div>

            <div
              class="dial-sub"
              data-key="dialSub"
            >
              --
            </div>

          </div>

        </div>

        <div class="status-row">

          <div class="status-chip">

            <ha-icon icon="mdi:water-percent"></ha-icon>

            <span data-key="humidite">
              --
            </span>

          </div>

          <div class="status-chip">

            <ha-icon icon="mdi:window-open-variant"></ha-icon>

            <span data-key="aeration">
              --
            </span>

          </div>

          <div class="status-chip">

            <ha-icon icon="mdi:window-closed-variant"></ha-icon>

            <span data-key="fenetreOuverte">
              --
            </span>

          </div>

        </div>
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
          background: var(
            --ha-card-background,
            var(--card-background-color)
          );

          border: 1px solid var(--divider-color);

          border-radius: var(
            --ha-card-border-radius,
            12px
          );

          padding: 16px;

          box-sizing: border-box;

          color: var(--primary-text-color);
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

          color: var(--secondary-text-color);
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
          background: rgba(
            var(--rgb-success-color, 76, 175, 80),
            0.15
          );

          color: var(
            --success-color,
            #4caf50
          );
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

          transition:
            stroke-dashoffset 0.4s ease,
            stroke 0.4s ease;
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

        .status-row {
          display: flex;

          gap: 8px;

          margin-bottom: 4px;
        }

        .status-chip {
          flex: 1;

          display: flex;

          flex-direction: column;

          align-items: center;

          gap: 4px;

          background: var(--secondary-background-color);

          border-radius: 8px;

          padding: 8px 4px;

          font-size: 11px;

          color: var(--secondary-text-color);

          text-align: center;
        }

        .status-chip ha-icon {
          --mdc-icon-size: 18px;

          color: var(--secondary-text-color);
        }

        .empty {
          margin-top: 16px;

          color: var(--secondary-text-color);
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

          <div
            class="heating-badge"
            data-key="heatingBadge"
          >

            <ha-icon icon="mdi:fire"></ha-icon>

            <span data-key="heatingLabel">
              --
            </span>

          </div>

        </div>

        ${bodyHtml}

      </div>
    `;

    // ========================================================
    // CACHE DES ELEMENTS A METTRE A JOUR
    // ========================================================

    this._valueEls = entities
      ? {

          humidite:
            this.shadowRoot.querySelector(
              '[data-key="humidite"]'
            ),

          aeration:
            this.shadowRoot.querySelector(
              '[data-key="aeration"]'
            ),

          fenetreOuverte:
            this.shadowRoot.querySelector(
              '[data-key="fenetreOuverte"]'
            ),

          dialValue:
            this.shadowRoot.querySelector(
              '[data-key="dialValue"]'
            ),

          dialSub:
            this.shadowRoot.querySelector(
              '[data-key="dialSub"]'
            ),

          dialProgress:
            this.shadowRoot.querySelector(
              '[data-key="dialProgress"]'
            ),

          heatingBadge:
            this.shadowRoot.querySelector(
              '[data-key="heatingBadge"]'
            ),

          heatingLabel:
            this.shadowRoot.querySelector(
              '[data-key="heatingLabel"]'
            ),

        }

      : null;

    this._entities = entities;

    this._lastArea = area;

    this._rendered = true;

    this._updateValues();
  }

  // ==========================================================
  // MISE A JOUR DES VALEURS
  // ==========================================================

  _updateValues() {

    if (!this._entities || !this._valueEls) {
      return;
    }

    const els = this._valueEls;

    const circumference =
      2 * Math.PI * 78;

    // ========================================================
    // SECURITE
    // ========================================================

    const securiteState =
      this._getState(
        this._entities.securite
      );

    const ringColor =
      this._securityColorVar(
        securiteState
      );

    // ========================================================
    // CLIMATE
    // ========================================================

    const climateState =
      this._climateEntityId
        ? this._hass.states[
            this._climateEntityId
          ]
        : null;

    const current =
      climateState?.attributes?.current_temperature;

    const target =
      climateState?.attributes?.temperature;

    const heating =
      climateState?.attributes?.hvac_action ===
      "heating";

    // ========================================================
    // CENTRE DU CADRAN
    // ========================================================

    if (
      current !== undefined &&
      current !== null
    ) {

      els.dialValue.textContent =
        `${current}°`;

      els.dialSub.textContent =
        target !== undefined &&
        target !== null
          ? `consigne ${target}°`
          : "consigne --";

      const ratio =
        target !== undefined &&
        target !== null

          ? Math.min(
              Math.max(
                (
                  current -
                  (target - 5)
                ) / 5,
                0
              ),
              1
            )

          : 0.5;

      els.dialProgress.style.strokeDashoffset =
        `${circumference * (1 - ratio)}`;

    } else {

      // Repli si aucune entité climate
      // n'est trouvée pour la pièce.

      const tempsChauffe =
        this._formatValue(
          this._getState(
            this._entities.tempsChauffe
          )
        );

      els.dialValue.textContent =
        tempsChauffe;

      els.dialSub.textContent =
        "min de chauffe estimées";

      els.dialProgress.style.strokeDashoffset =
        "0";
    }

    els.dialProgress.style.strokeDasharray =
      `${circumference}`;

    els.dialProgress.style.stroke =
      ringColor;

    // ========================================================
    // BADGE CHAUFFE
    // ========================================================

    if (
      els.heatingBadge.classList.contains(
        "active"
      ) !== heating
    ) {

      els.heatingBadge.classList.toggle(
        "active",
        heating
      );
    }

    els.heatingLabel.textContent =
      heating
        ? "Chauffe"
        : "Éteint";

    // ========================================================
    // HUMIDITE
    // ========================================================

    const humidite =
      this._formatValue(
        this._getState(
          this._entities.humidite
        )
      );

    els.humidite.textContent =
      humidite === "--"
        ? "--"
        : `${humidite}%`;

    // ========================================================
    // AERATION
    // ========================================================

    els.aeration.textContent =
      this._formatValue(
        this._getState(
          this._entities.aeration
        )
      );

    // ========================================================
    // FENETRE
    // ========================================================

    const fenetreState =
      this._getState(
        this._entities.fenetreOuverte
      );

    els.fenetreOuverte.textContent =
      fenetreState === "on"
        ? "Ouverte"
        : fenetreState === "off"
          ? "Fermée"
          : "--";
  }

  // ==========================================================
  // EDITEUR NATIF HOME ASSISTANT
  // ==========================================================

  static getConfigElement() {
    return document.createElement(
      "chauffage-intelligent-card-editor"
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
    return 5;
  }
}


// =============================================================
// EDITEUR
// =============================================================

class ChauffageIntelligentCardEditor extends HTMLElement {

  constructor() {
    super();

    this.attachShadow({
      mode: "open"
    });

    this._built = false;

    this._selector = null;
  }

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
  // CONSTRUCTION EDITEUR
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
            var(
              --secondary-text-color,
              #999999
            );
        }

      </style>

      <div class="container">

        <div class="title">
          Pièce
        </div>

        <ha-selector
          id="area-selector"
        ></ha-selector>

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
  // MISE A JOUR DU SELECTEUR
  // ==========================================================

  _updateSelector() {

    if (
      !this._selector ||
      !this._hass
    ) {
      return;
    }

    this._selector.hass =
      this._hass;

    this._selector.selector = {
      area: {}
    };

    this._selector.value =
      this._config?.area || "";
  }

  // ==========================================================
  // CONFIG CHANGED
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
// ENREGISTREMENT EDITEUR
// =============================================================

if (
  !customElements.get(
    "chauffage-intelligent-card-editor"
  )
) {

  customElements.define(
    "chauffage-intelligent-card-editor",
    ChauffageIntelligentCardEditor
  );
}


// =============================================================
// ENREGISTREMENT CARTE
// =============================================================

if (
  !customElements.get(
    "chauffage-intelligent-card"
  )
) {

  customElements.define(
    "chauffage-intelligent-card",
    ChauffageIntelligentCard
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
      "chauffage-intelligent-card"
  )
) {

  window.customCards.push({

    type:
      "chauffage-intelligent-card",

    name:
      "Chauffage intelligent card",

    description:
      "Affichage du chauffage par pièce",

    preview: true

  });
}
