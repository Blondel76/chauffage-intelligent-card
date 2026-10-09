class ChauffageIntelligentCard extends HTMLElement {

  constructor() {
    super();

    this.attachShadow({ mode: "open" });
    this._rendered = false;
    this._lastArea = null;
    this._valueEls = null;
    this._climateEntityId = undefined; // undefined = pas encore cherché, null = pas trouvé
    this._fenetreEntityId = undefined;
    this._humiditeEntityId = undefined;
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
  // RECHERCHE DU CAPTEUR D'HUMIDITE (valeur numerique) DE LA PIECE
  // ==========================================================

  _resolveHumiditeEntity(area) {

    if (!area || !this._hass) {
      return null;
    }

    const entities = this._hass.entities;
    const devices = this._hass.devices;

    if (!entities) {
      return null;
    }

    for (const [entityId, entry] of Object.entries(entities)) {

      if (!entityId.startsWith("sensor.")) {
        continue;
      }

      if (this._hass.states[entityId]?.attributes?.device_class !== "humidity") {
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
  // COULEUR DES PUCES (humidité, aération, fenêtre)
  // ==========================================================
  //
  // Convertit un texte d'état ("Normal", "Élevé", "Très élevé"...)
  // en classe CSS : "ok" (vert), "warn" (orange), "error" (rouge)
  // ou "" (neutre, si l'état n'est pas reconnu).
  //
  // ==========================================================

  // Humidité : Normal = vert, Élevé = jaune, Très élevé = orange,
  // Excessive = rouge. L'ordre des tests compte : "très élevé"
  // contient "élevé".
  _humidityClass(text) {

    const t = String(text || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    if (!t || ["--", "unknown", "unavailable"].includes(t)) {
      return "";
    }

    if (t.includes("excessi")) return "error";
    if (t.includes("tres")) return "warn";
    if (t.includes("eleve")) return "caution";
    if (t.includes("normal")) return "ok";

    return "";
  }

  // Aération : Recommandée = vert, Possible = jaune, Peu utile = orange,
  // Déconseillée = rouge. L'ordre des tests compte : "déconseillée"
  // contient "conseillée".
  _aerationClass(text) {

    const t = String(text || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    if (!t || ["--", "unknown", "unavailable"].includes(t)) {
      return "";
    }

    if (t.includes("deconseille")) return "error";
    if (t.includes("peu utile")) return "warn";
    if (t.includes("possible")) return "caution";
    if (t.includes("recommande") || t.includes("conseille")) return "ok";

    return "";
  }

  _setChipLevel(chip, level) {

    if (!chip) {
      return;
    }

    chip.classList.remove("ok", "caution", "warn", "error");

    if (level) {
      chip.classList.add(level);
    }
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
    this._humiditeEntityId = this._resolveHumiditeEntity(area);

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
          <div class="status-chip" data-key="humiditeChip">
            <ha-icon icon="mdi:water-percent"></ha-icon>
            <span data-key="humidite">--</span>
          </div>
          <div class="status-chip" data-key="aerationChip">
            <ha-icon icon="mdi:window-open-variant"></ha-icon>
            <span data-key="aeration">--</span>
          </div>
          <div class="status-chip" data-key="fenetreChip">
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
          transition: background 0.3s ease, color 0.3s ease;
        }

        .status-chip ha-icon {
          --mdc-icon-size: 18px;
          color: var(--secondary-text-color);
        }

        .status-chip.ok {
          background: color-mix(in srgb, var(--success-color, #4caf50) 20%, var(--secondary-background-color));
          color: var(--success-color, #4caf50);
        }

        .status-chip.caution {
          background: color-mix(in srgb, var(--yellow-color, #fdd835) 20%, var(--secondary-background-color));
          color: var(--yellow-color, #fdd835);
        }

        .status-chip.warn {
          background: color-mix(in srgb, var(--warning-color, #ff9800) 20%, var(--secondary-background-color));
          color: var(--warning-color, #ff9800);
        }

        .status-chip.error {
          background: color-mix(in srgb, var(--error-color, #f44336) 20%, var(--secondary-background-color));
          color: var(--error-color, #f44336);
        }

        .status-chip.ok ha-icon { color: var(--success-color, #4caf50); }
        .status-chip.caution ha-icon { color: var(--yellow-color, #fdd835); }
        .status-chip.warn ha-icon { color: var(--warning-color, #ff9800); }
        .status-chip.error ha-icon { color: var(--error-color, #f44336); }

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
          humiditeChip: this.shadowRoot.querySelector('[data-key="humiditeChip"]'),
          aeration: this.shadowRoot.querySelector('[data-key="aeration"]'),
          aerationChip: this.shadowRoot.querySelector('[data-key="aerationChip"]'),
          fenetreOuverte: this.shadowRoot.querySelector('[data-key="fenetreOuverte"]'),
          fenetreChip: this.shadowRoot.querySelector('[data-key="fenetreChip"]'),
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

    // --- Humidité : "Niveau - valeur%" ---
    const humiditeState = this._hass.states[this._entities.humidite];
    const humAttrs = humiditeState?.attributes || {};
    const humRaw = humiditeState?.state;

    let niveau = null;
    let valeur = null;

    // 1) L'état du capteur : numérique, ou texte qualitatif (ex. "normal")
    const numericState = parseFloat(humRaw);

    if (Number.isFinite(numericState)) {
      valeur = numericState;
      niveau = humAttrs.niveau || null;
    } else if (humRaw && humRaw !== "unknown" && humRaw !== "unavailable") {
      niveau = humRaw;
    }

    // 2) Valeur dans les attributs du capteur
    if (valeur === null) {
      for (const key of ["valeur", "humidite", "humidity", "value", "taux", "taux_humidite", "current_humidity"]) {
        const v = parseFloat(humAttrs[key]);
        if (Number.isFinite(v)) {
          valeur = v;
          break;
        }
      }
    }

    // 3) Humidité mesurée par le thermostat de la pièce
    if (valeur === null) {
      const v = parseFloat(climateState?.attributes?.current_humidity);
      if (Number.isFinite(v)) {
        valeur = v;
      }
    }

    // 4) Capteur d'humidité rattaché à la pièce
    if (valeur === null && this._humiditeEntityId) {
      const v = parseFloat(this._hass.states[this._humiditeEntityId]?.state);
      if (Number.isFinite(v)) {
        valeur = v;
      }
    }

    let humiditeText = "--";

    if (niveau && valeur !== null) {
      const niveauCap = niveau.charAt(0).toUpperCase() + niveau.slice(1);
      humiditeText = `${niveauCap} - ${Math.round(valeur)}%`;
    } else if (valeur !== null) {
      humiditeText = `${Math.round(valeur)}%`;
    } else if (niveau) {
      humiditeText = niveau.charAt(0).toUpperCase() + niveau.slice(1);
    }

    els.humidite.textContent = humiditeText;

    // Couleur selon le niveau (normal = vert, élevé = jaune, très élevé = orange, excessive = rouge)
    this._setChipLevel(els.humiditeChip, this._humidityClass(niveau));

    // --- Aération ---
    const aerationState = this._getState(this._entities.aeration);
    els.aeration.textContent = aerationState === "unknown" ? "--" : aerationState;

    this._setChipLevel(els.aerationChip, this._aerationClass(aerationState));

    // --- Fenêtre / porte ---
    const fenetreState = this._getState(this._fenetreEntityId);
    els.fenetreOuverte.textContent = fenetreState === "on"
      ? "Ouverte"
      : fenetreState === "off"
        ? "Fermée"
        : "--";

    // Ouverte = rouge, fermée = vert
    this._setChipLevel(
      els.fenetreChip,
      fenetreState === "on" ? "error" : fenetreState === "off" ? "ok" : ""
    );
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
//
// Le mode de la maison et la chaudière ne sont PAS à nom fixe : ce sont
// les entités choisies par l'utilisateur dans la config centrale. Le
// switch général les publie dans ses attributs :
//   mode_entity   -> ex. input_select.mode_presence_maison
//   boiler_entity -> ex. switch.ma_chaudiere (absent en électrique :
//                    le bloc chaudière est alors masqué)
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

    const master = custom.master || "switch.chauffage_general";

    // Le switch général publie la config centrale de l'intégration :
    //   mode_entity   -> entité du sélecteur de mode choisie par l'utilisateur
    //   boiler_entity -> entité chaudière choisie (absente en électrique)
    const attrs = this._hass?.states?.[master]?.attributes || {};

    return {
      master,
      pieces: custom.pieces || "sensor.pieces_en_chauffe",
      mode: this.config?.mode_entity || custom.mode || attrs.mode_entity || null,
      chaudiere: this.config?.boiler_entity || custom.chaudiere || attrs.boiler_entity || null,
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

        .chip.ok ha-icon {
          color: var(--success-color, #4caf50);
        }

        .chip.error ha-icon,
        .chip.error {
          color: var(--error-color, #f44336);
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

          <div class="chips">
            <div class="chip" data-key="chauffeChip">
              <ha-icon icon="mdi:radiator"></ha-icon>
              <span data-key="enChauffe">--</span>
            </div>
            <div class="chip" data-key="froidesChip">
              <ha-icon icon="mdi:snowflake-alert"></ha-icon>
              <span data-key="froides">--</span>
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
      mode: q("mode"),
      chaudiereChip: q("chaudiereChip"),
      chaudiereIcon: q("chaudiereIcon"),
      chaudiere: q("chaudiere"),
      powerBtn: q("powerBtn"),
      powerLabel: q("powerLabel"),
      enChauffe: q("enChauffe"),
      chauffeChip: q("chauffeChip"),
      froides: q("froides"),
      froidesChip: q("froidesChip"),
    };

    this._els.powerBtn.addEventListener("click", () => this._togglePower());

    this._built = true;
  }

  // ==========================================================
  // BOUTON MARCHE / ARRET
  // ==========================================================

  // Pièces = une par sensor.securite_<area> (créé par l'intégration).
  // Une pièce chauffe si son thermostat est en hvac_action "heating".
  _findClimate(area) {

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

    if (candidates.length <= 1) {
      return candidates[0] || null;
    }

    return candidates.find((id) => {
      const presets = this._hass.states[id]?.attributes?.preset_modes;
      return Array.isArray(presets) && presets.length > 0;
    }) || candidates[0];
  }

  _roomStats() {

    const prefix = "sensor.securite_";
    const seuil = Number(this.config?.seuil_ecart ?? 1);

    const areas = Object.keys(this._hass.states)
      .filter((id) => id.startsWith(prefix) && id !== "sensor.securite_chauffage")
      .map((id) => id.slice(prefix.length));

    if (areas.length === 0) {
      return null;
    }

    // froides = pièces trop froides (erreur de température)
    const stats = { heating: 0, froides: 0, total: areas.length };

    for (const area of areas) {

      const climateId = this._findClimate(area);
      const attrs = climateId ? this._hass.states[climateId]?.attributes : null;

      if (!attrs) {
        continue;
      }

      if (attrs.hvac_action === "heating") {
        stats.heating++;
      }

      const current = Number(attrs.current_temperature);
      const target = Number(attrs.temperature);

      if (!Number.isFinite(current) || !Number.isFinite(target)) {
        continue;
      }

      if (current <= target - seuil) {
        stats.froides++;
      }
    }

    return stats;
  }

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

    // --- Pièces en chauffe / trop froides ---
    const pieces = states[ids.pieces];
    let count = parseInt(pieces?.state, 10);
    let total = parseInt(pieces?.attributes?.total, 10);

    const stats = this._roomStats();

    if (!Number.isFinite(count) && stats) {
      count = stats.heating;
      total = stats.total;
    }

    els.enChauffe.textContent = Number.isFinite(count)
      ? (Number.isFinite(total) ? `${count}/${total} en chauffe` : `${count} en chauffe`)
      : "--";
    els.chauffeChip.classList.toggle("ok", Number.isFinite(count) && count > 0);

    const froides = stats ? stats.froides : null;

    els.froides.textContent = stats ? `${froides} trop froide${froides > 1 ? "s" : ""}` : "--";
    els.froidesChip.classList.toggle("error", froides > 0);

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
// EDITEUR (choix du mode de la maison et de la chaudière)
// =============================================================

class ChauffageIntelligentCentralCardEditor extends HTMLElement {

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._built = false;
  }

  setConfig(config) {
    this._config = { ...(config || {}) };
    this._build();
    this._sync();
  }

  set hass(hass) {
    this._hass = hass;
    this._build();
    this._sync();
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
        .container { padding: 8px 0 16px 0; }
        .title { font-size: 14px; font-weight: 500; margin: 12px 0 8px; }
        .info { margin-top: 10px; font-size: 12px; color: var(--secondary-text-color, #999999); }
      </style>
      <div class="container">
        <div class="title">Mode de la maison</div>
        <ha-selector id="mode"></ha-selector>
        <div class="title">Chaudière (laisser vide en chauffage électrique)</div>
        <ha-selector id="boiler"></ha-selector>
        <div class="info">
          Si un champ est vide, la carte utilise l'entité publiée par
          le switch général de l'intégration.
        </div>
      </div>
    `;

    this._mode = this.shadowRoot.querySelector("#mode");
    this._boiler = this.shadowRoot.querySelector("#boiler");

    this._mode.selector = { entity: { domain: ["input_select", "select", "sensor"] } };
    this._boiler.selector = { entity: { domain: ["switch", "input_boolean", "binary_sensor", "climate"] } };

    this._mode.addEventListener("value-changed", (e) => this._changed("mode_entity", e.detail.value));
    this._boiler.addEventListener("value-changed", (e) => this._changed("boiler_entity", e.detail.value));

    this._built = true;
  }

  _sync() {

    if (!this._built || !this._hass || !this._config) {
      return;
    }

    this._mode.hass = this._hass;
    this._boiler.hass = this._hass;
    this._mode.value = this._config.mode_entity || "";
    this._boiler.value = this._config.boiler_entity || "";
  }

  _changed(key, value) {

    const config = { ...this._config };

    if (value) {
      config[key] = value;
    } else {
      delete config[key];
    }

    this._config = config;

    this.dispatchEvent(
      new CustomEvent("config-changed", {
        detail: { config },
        bubbles: true,
        composed: true,
      })
    );
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


// =============================================================
// CARTE CAPTEURS (pièces SANS thermostat)
// =============================================================
//
// Même style que la carte pièce, mais sans thermostat, consigne
// ni badge de chauffe. Affiche seulement ce qui existe :
//   - température (capteur de la pièce, ou thermostat si présent)
//   - humidité   (Niveau - valeur%)
//   - aération, fenêtre/porte (puces masquées si pas d'entité)
//
// AUCUNE recherche automatique de capteur : la température et
// l'humidité ne viennent que des entités choisies explicitement.
// Si un champ est vide, l'information n'est pas affichée.
//
//   type: custom:chauffage-intelligent-sensor-card
//   name: Congélateur                (titre de la carte)
//   area: salon                      (OPTIONNEL : à laisser vide pour un
//                                     appareil, sinon lit les entités
//                                     de la pièce)
//   temperature_entity: sensor.xxx   (optionnel)
//   humidity_entity: sensor.yyy      (optionnel)
//
// Seules les entités à nom fixe de l'intégration sont lues si elles
// existent : sensor.securite_<pièce> (couleur de l'anneau),
// sensor.humidite_<pièce>, sensor.aeration_<pièce> et
// switch.fenetre_ouverte_<pièce>.
//
// =============================================================

class ChauffageIntelligentSensorCard extends HTMLElement {

  constructor() {
    super();

    this.attachShadow({ mode: "open" });
    this._rendered = false;
    this._lastKey = null;
    this._els = null;
    this._ids = null;
  }

  setConfig(config) {

    this.config = config || {};

    if (this._hass) {
      this._fullRender();
    }
  }

  set hass(hass) {

    this._hass = hass;

    if (!this.config) {
      return;
    }

    if (!this._rendered || this._lastKey !== this._configKey()) {
      this._fullRender();
    } else {
      this._updateValues();
    }
  }

  get hass() {
    return this._hass;
  }

  _configKey() {

    const c = this.config || {};

    return [c.area, c.name, c.temperature_entity, c.humidity_entity].join("|");
  }

  // ==========================================================
  // ENTITES (aucune détection automatique)
  // ==========================================================

  _resolveIds(area) {

    const c = this.config || {};
    const states = this._hass.states;
    const own = (id) => (area && states[id] ? id : null);

    return {
      temperature: c.temperature_entity || null,
      humidite: c.humidity_entity || null,
      securite: own(`sensor.securite_${area}`),
      humiditeTexte: own(`sensor.humidite_${area}`),
      aeration: own(`sensor.aeration_${area}`),
      fenetre: own(`switch.fenetre_ouverte_${area}`),
    };
  }

  // ==========================================================
  // OUTILS
  // ==========================================================

  _num(entityId) {

    if (!entityId) {
      return null;
    }

    const v = parseFloat(this._hass.states[entityId]?.state);

    return Number.isFinite(v) ? v : null;
  }

  _cap(text) {

    return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
  }

  _securityColorVar(securityState) {

    const map = {
      vert: "var(--success-color, #4caf50)",
      orange: "var(--warning-color, #ff9800)",
      rouge: "var(--error-color, #f44336)",
      gris: "var(--disabled-text-color, #9e9e9e)",
    };

    return map[securityState] || "var(--primary-color, #03a9f4)";
  }

  _getName(area, ids) {

    const c = this.config || {};

    if (c.name) {
      return c.name;
    }

    if (area) {
      return this._hass?.areas?.[area]?.name || area;
    }

    const friendly = this._hass?.states?.[ids?.temperature || ids?.humidite]?.attributes?.friendly_name;

    return friendly || "Aucune pièce sélectionnée";
  }

  // ==========================================================
  // RENDU COMPLET
  // ==========================================================

  _fullRender() {

    if (!this._hass || !this.config) {
      return;
    }

    const c = this.config;
    const area = c.area || "";
    const hasSource = area || c.name || c.temperature_entity || c.humidity_entity;

    this._ids = hasSource ? this._resolveIds(area) : null;

    const name = this._getName(area, this._ids);

    const bodyHtml = this._ids
      ? `
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
          <div class="status-chip" data-key="humiditeChip">
            <ha-icon icon="mdi:water-percent"></ha-icon>
            <span data-key="humidite">--</span>
          </div>
          <div class="status-chip" data-key="aerationChip">
            <ha-icon icon="mdi:window-open-variant"></ha-icon>
            <span data-key="aeration">--</span>
          </div>
          <div class="status-chip" data-key="fenetreChip">
            <ha-icon icon="mdi:window-closed-variant"></ha-icon>
            <span data-key="fenetre">--</span>
          </div>
        </div>
      `
      : `
        <div class="empty">
          Donne un nom et choisis un capteur dans la configuration.
        </div>
      `;

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

        .status-chip.hidden {
          display: none;
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
          <div class="room">${name}</div>
        </div>

        ${bodyHtml}

      </div>
    `;

    const q = (key) => this.shadowRoot.querySelector(`[data-key="${key}"]`);

    this._els = this._ids
      ? {
          dialValue: q("dialValue"),
          dialSub: q("dialSub"),
          dialProgress: q("dialProgress"),
          humidite: q("humidite"),
          humiditeChip: q("humiditeChip"),
          aeration: q("aeration"),
          aerationChip: q("aerationChip"),
          fenetre: q("fenetre"),
          fenetreChip: q("fenetreChip"),
        }
      : null;

    this._lastKey = this._configKey();
    this._rendered = true;

    this._updateValues();
  }

  // ==========================================================
  // MISE A JOUR DES VALEURS
  // ==========================================================

  _updateValues() {

    if (!this._ids || !this._els) {
      return;
    }

    const ids = this._ids;
    const els = this._els;
    const states = this._hass.states;
    const circumference = 2 * Math.PI * 78;

    // --- Température : uniquement le capteur choisi ---
    const temperature = this._num(ids.temperature);

    // --- Humidité : "Niveau - valeur%" ---
    const humState = ids.humiditeTexte ? states[ids.humiditeTexte] : null;
    const humAttrs = humState?.attributes || {};
    const humRaw = humState?.state;

    let niveau = null;
    let valeur = null;

    const numericState = parseFloat(humRaw);

    if (Number.isFinite(numericState)) {
      valeur = numericState;
      niveau = humAttrs.niveau || null;
    } else if (humRaw && humRaw !== "unknown" && humRaw !== "unavailable") {
      niveau = humRaw;
    }

    if (valeur === null) {
      for (const key of ["valeur", "humidite", "humidity", "value", "taux", "taux_humidite", "current_humidity"]) {
        const v = parseFloat(humAttrs[key]);
        if (Number.isFinite(v)) {
          valeur = v;
          break;
        }
      }
    }

    if (valeur === null) {
      valeur = this._num(ids.humidite);
    }

    let humiditeText = null;

    if (niveau && valeur !== null) {
      humiditeText = `${this._cap(niveau)} - ${Math.round(valeur)}%`;
    } else if (valeur !== null) {
      humiditeText = `${Math.round(valeur)}%`;
    } else if (niveau) {
      humiditeText = this._cap(niveau);
    }

    // --- Cadran : température, sinon humidité, sinon "--" ---
    // Pas de consigne : la jauge est pleine dès qu'il y a une valeur.
    if (temperature !== null) {

      els.dialValue.textContent = `${temperature.toFixed(1)}°`;
      els.dialSub.textContent = "température";

    } else if (valeur !== null) {

      els.dialValue.textContent = `${Math.round(valeur)}%`;
      els.dialSub.textContent = "humidité";

    } else {

      els.dialValue.textContent = "--";
      els.dialSub.textContent = "--";
    }

    const ratio = temperature !== null || valeur !== null ? 1 : 0;

    els.dialProgress.style.strokeDasharray = `${circumference}`;
    els.dialProgress.style.strokeDashoffset = `${circumference * (1 - ratio)}`;
    els.dialProgress.style.stroke = this._securityColorVar(
      ids.securite ? states[ids.securite]?.state : null
    );

    // --- Puces (masquées quand l'information n'existe pas) ---
    els.humiditeChip.classList.toggle("hidden", humiditeText === null);
    els.humidite.textContent = humiditeText ?? "--";

    els.aerationChip.classList.toggle("hidden", !ids.aeration);

    if (ids.aeration) {
      const a = states[ids.aeration]?.state;
      els.aeration.textContent = a && a !== "unknown" && a !== "unavailable" ? a : "--";
    }

    els.fenetreChip.classList.toggle("hidden", !ids.fenetre);

    if (ids.fenetre) {
      const f = states[ids.fenetre]?.state;
      els.fenetre.textContent = f === "on" ? "Ouverte" : f === "off" ? "Fermée" : "--";
    }
  }

  // ==========================================================
  // EDITEUR / TAILLE
  // ==========================================================

  static getConfigElement() {
    return document.createElement("chauffage-intelligent-sensor-card-editor");
  }

  static getStubConfig() {
    return {};
  }

  getCardSize() {
    return 4;
  }
}


// =============================================================
// EDITEUR (pièce + capteurs optionnels)
// =============================================================

class ChauffageIntelligentSensorCardEditor extends HTMLElement {

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._built = false;
  }

  setConfig(config) {
    this._config = { ...(config || {}) };
    this._build();
    this._sync();
  }

  set hass(hass) {
    this._hass = hass;
    this._build();
    this._sync();
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
        .container { padding: 8px 0 16px 0; }
        .title { font-size: 14px; font-weight: 500; margin: 12px 0 8px; }
        .info { margin-top: 10px; font-size: 12px; color: var(--secondary-text-color, #999999); }
      </style>
      <div class="container">
        <div class="title">Nom (ex. Congélateur)</div>
        <ha-selector id="name"></ha-selector>
        <div class="title">Capteur de température (optionnel)</div>
        <ha-selector id="temperature"></ha-selector>
        <div class="title">Capteur d'humidité (optionnel)</div>
        <ha-selector id="humidity"></ha-selector>
        <div class="title">Pièce (optionnel, laisser vide pour un appareil)</div>
        <ha-selector id="area"></ha-selector>
        <div class="info">
          Aucun capteur n'est choisi automatiquement : si un champ est
          vide, l'information correspondante n'est pas affichée. Sans
          pièce, la carte n'utilise aucune entité du chauffage de la maison.
        </div>
      </div>
    `;

    this._name = this.shadowRoot.querySelector("#name");
    this._area = this.shadowRoot.querySelector("#area");
    this._temperature = this.shadowRoot.querySelector("#temperature");
    this._humidity = this.shadowRoot.querySelector("#humidity");

    this._name.selector = { text: {} };
    this._area.selector = { area: {} };
    this._temperature.selector = { entity: { domain: "sensor", device_class: "temperature" } };
    this._humidity.selector = { entity: { domain: "sensor", device_class: "humidity" } };

    this._name.addEventListener("value-changed", (e) => this._changed("name", e.detail.value));
    this._area.addEventListener("value-changed", (e) => this._changed("area", e.detail.value));
    this._temperature.addEventListener("value-changed", (e) => this._changed("temperature_entity", e.detail.value));
    this._humidity.addEventListener("value-changed", (e) => this._changed("humidity_entity", e.detail.value));

    this._built = true;
  }

  _sync() {

    if (!this._built || !this._hass || !this._config) {
      return;
    }

    this._name.hass = this._hass;
    this._area.hass = this._hass;
    this._temperature.hass = this._hass;
    this._humidity.hass = this._hass;

    this._name.value = this._config.name || "";
    this._area.value = this._config.area || "";
    this._temperature.value = this._config.temperature_entity || "";
    this._humidity.value = this._config.humidity_entity || "";
  }

  _changed(key, value) {

    const config = { ...this._config };

    if (value) {
      config[key] = value;
    } else {
      delete config[key];
    }

    this._config = config;

    this.dispatchEvent(
      new CustomEvent("config-changed", {
        detail: { config },
        bubbles: true,
        composed: true,
      })
    );
  }
}

// =============================================================
// ENREGISTREMENT
// =============================================================

if (!customElements.get("chauffage-intelligent-sensor-card-editor")) {
  customElements.define("chauffage-intelligent-sensor-card-editor", ChauffageIntelligentSensorCardEditor);
}

if (!customElements.get("chauffage-intelligent-sensor-card")) {
  customElements.define("chauffage-intelligent-sensor-card", ChauffageIntelligentSensorCard);
}

window.customCards = window.customCards || [];

if (!window.customCards.some(card => card.type === "chauffage-intelligent-sensor-card")) {
  window.customCards.push({
    type: "chauffage-intelligent-sensor-card",
    name: "Chauffage intelligent - Pièce sans thermostat",
    description: "Température, humidité, aération et fenêtre d'une pièce sans thermostat",
    preview: true
  });
}
