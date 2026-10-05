class ChauffageIntelligentCard extends HTMLElement {

  constructor() {
    super();

    this.attachShadow({ mode: "open" });
    this._rendered = false;
    this._lastArea = null;
    this._valueEls = null;
    this._climateEntityId = undefined; // undefined = pas encore cherché, null = pas trouvé
    this._fenetreEntityId = undefined;
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
  // sensor.securite_bureau_salle_de_jeux
  // sensor.aeration_bureau_salle_de_jeux (optionnel selon config de la pièce)
  // sensor.humidite_bureau_salle_de_jeux (optionnel selon config de la pièce)
  //
  // Le thermostat (climate) et le capteur d'ouverture (fenêtre/porte)
  // sont retrouvés via le registre area de Home Assistant, voir
  // _resolveClimateEntity() et _resolveFenetreEntity() ci-dessous.
  //
  // ==========================================================

  _getEntities(area) {

    if (!area) {
      return null;
    }

    return {

      securite: `sensor.securite_${area}`,
      aeration: `sensor.aeration_${area}`,
      humidite: `sensor.humidite_${area}`,

    };
  }

  // ==========================================================
  // RECHERCHE DE L'ENTITE CLIMATE DE LA PIECE
  // ==========================================================
  //
  // Une pièce peut avoir DEUX entités climate : le thermostat de la
  // pièce ET la vanne (en chauffage gaz, la vanne est elle-même une
  // entité climate). On liste tous les climate de la zone, puis on
  // privilégie celui qui a des preset_modes (confort/eco/hors_gel...)
  // : c'est le thermostat piloté par le planning, pas la vanne, qui
  // n'a normalement pas de presets.
  //
  // Si le registre n'est pas exposé par cette version de HA, ou
  // qu'aucune entité climate ne matche, on renvoie null et la carte
  // affiche "--" au centre du cadran.
  //
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

    const candidates = [];

    for (const [entityId, entry] of Object.entries(entities)) {

      if (!entityId.startsWith("climate.")) {
        continue;
      }

      const entityArea = entry.area_id
        || (devices && entry.device_id ? devices[entry.device_id]?.area_id : null);

      if (entityArea === area) {
        candidates.push(entityId);
      }
    }

    if (candidates.length === 0) {
      return null;
    }

    if (candidates.length === 1) {
      return candidates[0];
    }

    const withPresets = candidates.find((entityId) => {
      const presets = this._hass.states[entityId]?.attributes?.preset_modes;
      return Array.isArray(presets) && presets.length > 0;
    });

    return withPresets || candidates[0];
  }

  // ==========================================================
  // RECHERCHE DE L'ENTITE FENETRE/PORTE DE LA PIECE
  // ==========================================================
  //
  // Sans capteur de porte/fenêtre configuré, l'intégration crée un
  // interrupteur manuel switch.fenetre_ouverte_<area> : on l'utilise
  // en priorité. Si un vrai capteur est configuré, c'est un
  // binary_sensor au nom libre : on le retrouve via la zone et son
  // device_class (door/window/garage_door/opening).
  //
  // ==========================================================

  _resolveFenetreEntity(area) {

    if (!area || !this._hass) {
      return null;
    }

    const switchId = `switch.fenetre_ouverte_${area}`;

    if (this._hass.states[switchId]) {
      return switchId;
    }

    const entities = this._hass.entities;
    const devices = this._hass.devices;

    if (!entities) {
      return null;
    }

    const openingClasses = ["door", "window", "garage_door", "opening"];

    for (const [entityId, entry] of Object.entries(entities)) {

      if (!entityId.startsWith("binary_sensor.")) {
        continue;
      }

      const deviceClass = this._hass.states[entityId]?.attributes?.device_class;

      if (!deviceClass || !openingClasses.includes(deviceClass)) {
        continue;
      }

      const entityArea = entry.area_id
        || (devices && entry.device_id ? devices[entry.device_id]?.area_id : null);

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

    this._climateEntityId = this._resolveClimateEntity(area);
    this._fenetreEntityId = this._resolveFenetreEntity(area);

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

        <div class="status-row">
          <div class="status-chip">
            <ha-icon icon="mdi:water-percent"></ha-icon>
            <span data-key="humidite">--</span>
          </div>
          <div class="status-chip">
            <ha-icon icon="mdi:window-open-variant"></ha-icon>
            <span data-key="aeration">--</span>
          </div>
          <div class="status-chip">
            <ha-icon icon="mdi:window-closed-variant"></ha-icon>
            <span data-key="fenetreOuverte">--</span>
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

        .status-row {
          display: flex;
          gap: 8px;
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
          aeration: this.shadowRoot.querySelector('[data-key="aeration"]'),
          fenetreOuverte: this.shadowRoot.querySelector('[data-key="fenetreOuverte"]'),
          dialValue: this.shadowRoot.querySelector('[data-key="dialValue"]'),
          dialSub: this.shadowRoot.querySelector('[data-key="dialSub"]'),
          dialProgress: this.shadowRoot.querySelector('[data-key="dialProgress"]'),
          heatingBadge: this.shadowRoot.querySelector('[data-key="heatingBadge"]'),
          heatingLabel: this.shadowRoot.querySelector('[data-key="heatingLabel"]'),
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
  // Ne touche que le texte/attributs, pas toute la structure.
  // ==========================================================

  _updateValues() {

    if (!this._entities || !this._valueEls) {
      return;
    }

    const els = this._valueEls;
    const circumference = 2 * Math.PI * 78;

    // --- Sécurité (pilote la couleur de l'anneau) ---
    const securiteState = this._getState(this._entities.securite);
    const ringColor = this._securityColorVar(securiteState);

    // --- Entité climate de la pièce (thermostat, pas la vanne) ---
    const climateState = this._climateEntityId
      ? this._hass.states[this._climateEntityId]
      : null;

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
      els.dialSub.textContent = "--";
      els.dialProgress.style.strokeDashoffset = "0";
    }

    els.dialProgress.style.strokeDasharray = `${circumference}`;
    els.dialProgress.style.stroke = ringColor;

    // --- Badge chauffe ---
    if (els.heatingBadge.classList.contains("active") !== heating) {
      els.heatingBadge.classList.toggle("active", heating);
    }
    els.heatingLabel.textContent = heating ? "Chauffe" : "Éteint";

    // --- Humidité (valeur numérique + niveau qualitatif si dispo) ---
    const humiditeState = this._hass.states[this._entities.humidite];
    let humiditeText = "--";

    if (humiditeState) {

      const raw = humiditeState.state;
      const niveau = humiditeState.attributes?.niveau;
      const numeric = parseFloat(raw);

      if (Number.isFinite(numeric)) {
        humiditeText = niveau ? `${Math.round(numeric)}% ${niveau}` : `${Math.round(numeric)}%`;
      } else if (raw && raw !== "unknown" && raw !== "unavailable") {
        // Repli si l'entité renvoie encore uniquement le texte qualitatif.
        humiditeText = raw;
      }
    }

    els.humidite.textContent = humiditeText;

    // --- Aération ---
    const aerationState = this._getState(this._entities.aeration);
    els.aeration.textContent = aerationState === "unknown" ? "--" : aerationState;

    // --- Fenêtre / porte ---
    const fenetreState = this._getState(this._fenetreEntityId);
    els.fenetreOuverte.textContent = fenetreState === "on"
      ? "Ouverte"
      : fenetreState === "off"
        ? "Fermée"
        : "--";
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


// =============================================================
// CARTE CENTRALE (à coller À LA SUITE du code existant, dans
// le même fichier chauffage-intelligent-card.js)
// =============================================================
//
// Aucune configuration nécessaire : les entités sont retrouvées
// automatiquement via les noms fixes créés par l'intégration :
//
//   switch.chauffage_general          -> marche/arrêt général (bouton)
//   sensor.pieces_en_chauffe          -> état = nb de pièces en chauffe,
//                                        attribut "total" = nb de pièces
//   sensor.mode_maison_chauffage      -> mode actuel de la maison
//   binary_sensor.chaudiere_chauffage -> état de la chaudière (gaz
//                                        uniquement : si l'entité n'existe
//                                        pas, le bloc est masqué)
//
// =============================================================

class ChauffageIntelligentCentralCard extends HTMLElement {

  constructor() {
    super();

    this.attachShadow({ mode: "open" });
    this._built = false;
    this._els = null;
  }

  setConfig(config) {

    this.config = config || {};

    if (this._hass) {
      this._update();
    }
  }

  set hass(hass) {

    this._hass = hass;

    if (!this._built) {
      this._build();
    }

    this._update();
  }

  get hass() {
    return this._hass;
  }

  // ==========================================================
  // ENTITES (noms fixes, surchargeables via config.entities)
  // ==========================================================

  _ids() {

    const custom = this.config?.entities || {};

    return {
      master: custom.master || "switch.chauffage_general",
      pieces: custom.pieces || "sensor.pieces_en_chauffe",
      mode: custom.mode || "sensor.mode_maison_chauffage",
      chaudiere: custom.chaudiere || "binary_sensor.chaudiere_chauffage",
    };
  }

  // ==========================================================
  // CONSTRUCTION (une seule fois)
  // ==========================================================

  _build() {

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
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .left {
          flex: 1;
          min-width: 0;
        }

        .title {
          font-size: 16px;
          font-weight: 500;
        }

        .gauge-wrap {
          position: relative;
          width: 180px;
          max-width: 100%;
          margin: 8px auto 4px;
        }

        .gauge-svg {
          width: 100%;
          display: block;
        }

        .gauge-track,
        .gauge-progress {
          fill: none;
          stroke-width: 12;
          stroke-linecap: round;
        }

        .gauge-track {
          stroke: var(--divider-color);
        }

        .gauge-progress {
          stroke: var(--disabled-text-color, #9e9e9e);
          transition: stroke-dasharray 0.4s ease, stroke 0.4s ease;
        }

        .gauge-progress.active {
          stroke: var(--success-color, #4caf50);
        }

        .gauge-center {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          text-align: center;
        }

        .gauge-value {
          font-size: 30px;
          font-weight: 500;
          line-height: 1;
        }

        .gauge-sub {
          margin-top: 4px;
          font-size: 12px;
          color: var(--secondary-text-color);
        }

        .chips {
          display: flex;
          gap: 8px;
          margin-top: 12px;
        }

        .chip {
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

        .chip ha-icon {
          --mdc-icon-size: 18px;
        }

        .chip.hidden {
          display: none;
        }

        .right {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
        }

        .power-btn {
          width: 72px;
          height: 72px;
          border-radius: 50%;
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          background: var(--disabled-text-color, #9e9e9e);
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
          transition: background 0.3s ease, transform 0.1s ease;
          --mdc-icon-size: 34px;
        }

        .power-btn:active {
          transform: scale(0.94);
        }

        .power-btn.on {
          background: var(--success-color, #4caf50);
        }

        .power-btn.off {
          background: var(--error-color, #f44336);
        }

        .power-btn.na {
          cursor: not-allowed;
        }

        .power-label {
          font-size: 12px;
          color: var(--secondary-text-color);
        }

      </style>

      <div class="card">

        <div class="left">

          <div class="title">Chauffage</div>

          <div class="gauge-wrap">
            <svg viewBox="0 0 180 100" class="gauge-svg">
              <path class="gauge-track" d="M 15 90 A 75 75 0 0 1 165 90" pathLength="100" />
              <path class="gauge-progress" data-key="gaugeProgress" d="M 15 90 A 75 75 0 0 1 165 90" pathLength="100" stroke-dasharray="0 100" />
            </svg>
            <div class="gauge-center">
              <div class="gauge-value" data-key="gaugeValue">--</div>
              <div class="gauge-sub" data-key="gaugeSub">pièces en chauffe</div>
            </div>
          </div>

          <div class="chips">
            <div class="chip">
              <ha-icon icon="mdi:home-switch-outline"></ha-icon>
              <span data-key="mode">--</span>
            </div>
            <div class="chip hidden" data-key="chaudiereChip">
              <ha-icon icon="mdi:fire" data-key="chaudiereIcon"></ha-icon>
              <span data-key="chaudiere">--</span>
            </div>
          </div>

        </div>

        <div class="right">
          <button class="power-btn na" data-key="powerBtn" aria-label="Marche / arrêt du chauffage">
            <ha-icon icon="mdi:power"></ha-icon>
          </button>
          <div class="power-label" data-key="powerLabel">--</div>
        </div>

      </div>
    `;

    const q = (key) => this.shadowRoot.querySelector(`[data-key="${key}"]`);

    this._els = {
      gaugeProgress: q("gaugeProgress"),
      gaugeValue: q("gaugeValue"),
      gaugeSub: q("gaugeSub"),
      mode: q("mode"),
      chaudiereChip: q("chaudiereChip"),
      chaudiereIcon: q("chaudiereIcon"),
      chaudiere: q("chaudiere"),
      powerBtn: q("powerBtn"),
      powerLabel: q("powerLabel"),
    };

    this._els.powerBtn.addEventListener("click", () => this._togglePower());

    this._built = true;
  }

  // ==========================================================
  // BOUTON MARCHE / ARRET
  // ==========================================================

  _togglePower() {

    const id = this._ids().master;
    const st = this._hass?.states?.[id];

    if (!st || st.state === "unavailable" || st.state === "unknown") {
      return;
    }

    const domain = id.split(".")[0];

    this._hass.callService(domain, st.state === "on" ? "turn_off" : "turn_on", {
      entity_id: id,
    });
  }

  // ==========================================================
  // MISE A JOUR DES VALEURS
  // ==========================================================

  _update() {

    if (!this._els || !this._hass) {
      return;
    }

    const ids = this._ids();
    const states = this._hass.states;
    const els = this._els;

    // --- Bouton rond ---
    const master = states[ids.master];
    const masterState = master?.state;
    const available = master && masterState !== "unavailable" && masterState !== "unknown";
    const isOn = masterState === "on";

    els.powerBtn.classList.toggle("on", available && isOn);
    els.powerBtn.classList.toggle("off", available && !isOn);
    els.powerBtn.classList.toggle("na", !available);
    els.powerLabel.textContent = !available ? "--" : isOn ? "Allumé" : "Éteint";

    // --- Jauge : pièces en chauffe ---
    const pieces = states[ids.pieces];
    const count = parseInt(pieces?.state, 10);
    const total = parseInt(pieces?.attributes?.total, 10);

    if (Number.isFinite(count)) {

      const ratio = Number.isFinite(total) && total > 0
        ? Math.min(count / total, 1)
        : (count > 0 ? 1 : 0);

      els.gaugeValue.textContent = Number.isFinite(total) ? `${count}/${total}` : `${count}`;
      els.gaugeSub.textContent = count > 1 ? "pièces en chauffe" : "pièce en chauffe";
      els.gaugeProgress.setAttribute("stroke-dasharray", `${ratio * 100} 100`);
      els.gaugeProgress.classList.toggle("active", count > 0);

    } else {

      els.gaugeValue.textContent = "--";
      els.gaugeSub.textContent = "pièces en chauffe";
      els.gaugeProgress.setAttribute("stroke-dasharray", "0 100");
      els.gaugeProgress.classList.remove("active");
    }

    // --- Mode de la maison ---
    const mode = states[ids.mode]?.state;
    els.mode.textContent = mode && mode !== "unknown" && mode !== "unavailable" ? mode : "--";

    // --- Chaudière (masquée si l'entité n'existe pas = chauffage électrique) ---
    const chaudiere = states[ids.chaudiere];

    els.chaudiereChip.classList.toggle("hidden", !chaudiere);

    if (chaudiere) {

      const on = chaudiere.state === "on";

      els.chaudiere.textContent = on ? "Chaudière allumée" : "Chaudière éteinte";
      els.chaudiereIcon.setAttribute("icon", on ? "mdi:fire" : "mdi:fire-off");
    }
  }

  // ==========================================================
  // EDITEUR / TAILLE
  // ==========================================================

  static getConfigElement() {
    return document.createElement("chauffage-intelligent-central-card-editor");
  }

  static getStubConfig() {
    return {};
  }

  getCardSize() {
    return 3;
  }
}


// =============================================================
// EDITEUR (rien à configurer : tout est automatique)
// =============================================================

class ChauffageIntelligentCentralCardEditor extends HTMLElement {

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  setConfig(config) {

    this._config = config || {};

    this.shadowRoot.innerHTML = `
      <div style="padding: 8px 0 16px 0; font-size: 12px; color: var(--secondary-text-color, #999999);">
        Cette carte se configure toute seule à partir des entités
        centrales de l'intégration Chauffage intelligent.
      </div>
    `;
  }

  set hass(hass) {
    this._hass = hass;
  }
}


// =============================================================
// ENREGISTREMENT
// =============================================================

if (!customElements.get("chauffage-intelligent-central-card-editor")) {
  customElements.define("chauffage-intelligent-central-card-editor", ChauffageIntelligentCentralCardEditor);
}

if (!customElements.get("chauffage-intelligent-central-card")) {
  customElements.define("chauffage-intelligent-central-card", ChauffageIntelligentCentralCard);
}

window.customCards = window.customCards || [];

if (!window.customCards.some(card => card.type === "chauffage-intelligent-central-card")) {
  window.customCards.push({
    type: "chauffage-intelligent-central-card",
    name: "Chauffage intelligent - Central",
    description: "Marche/arrêt général, pièces en chauffe, mode de la maison et chaudière",
    preview: true
  });
}
