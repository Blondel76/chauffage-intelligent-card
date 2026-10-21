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
    this._boostTimer = null;
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
  // sensor.heures_chauffe_bureau_salle_de_jeux (temps de chauffe du jour, ligne masquée si absent)
  // switch.boost_bureau_salle_de_jeux (optionnel : puce Boost masquée si absent)
  //
  // Le thermostat (climate), le capteur d'humidité et le capteur
  // d'ouverture (fenêtre/porte) sont retrouvés d'abord via les
  // attributs publiés par l'intégration, puis via le registre area de
  // Home Assistant, voir _resolveClimateEntity(), _resolveHumiditeEntity()
  // et _resolveFenetreEntity() ci-dessous.
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
      tempsChauffeJour: `sensor.heures_chauffe_${area}`,
      boost: `switch.boost_${area}`,

    };
  }

  // ==========================================================
  // ENTITES CHOISIES DANS LA CONFIG DE LA PIECE (via l'intégration)
  // ==========================================================
  //
  // Les capteurs de la pièce (ex. sensor.temps_de_chauffe_<pièce>)
  // publient en attributs le thermostat ("climate") et le capteur de
  // température intérieure ("temperature_interieure") réellement
  // configurés dans l'intégration. C'est la source la plus fiable :
  // elle évite de deviner via le registre des areas.
  //
  // ==========================================================

  _roomAttributes(area) {

    if (!area || !this._hass) {
      return {};
    }

    return this._hass.states[`sensor.temps_de_chauffe_${area}`]?.attributes || {};
  }

  // ==========================================================
  // RECHERCHE DE L'ENTITE CLIMATE DE LA PIECE
  // ==========================================================
  //
  // 1) Thermostat configuré dans l'intégration (attribut "climate").
  //
  // 2) À défaut, via le registre area de HA : une pièce peut avoir
  // DEUX entités climate : le thermostat de la pièce ET la vanne (en
  // chauffage gaz, la vanne est elle-même une entité climate). On
  // liste tous les climate de la zone, puis on privilégie celui qui a
  // des preset_modes (confort/eco/hors_gel...) : c'est le thermostat
  // piloté par le planning, pas la vanne, qui n'a normalement pas de
  // presets.
  //
  // Si rien n'est trouvé, on renvoie null et la carte affiche "--" au
  // centre du cadran.
  //
  // ==========================================================

  _resolveClimateEntity(area) {

    if (!area || !this._hass) {
      return null;
    }

    const configured = this._roomAttributes(area).climate;

    if (configured && this._hass.states[configured]) {
      return configured;
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
  //
  // 1) Même règle que l'intégration : le capteur d'humidité est celui
  // du même appareil que le capteur de température intérieure
  // (sensor.xxx_temperature -> sensor.xxx_humidity).
  //
  // 2) À défaut, un capteur d'humidité (device_class humidity) rattaché
  // à la pièce dans le registre des areas.
  //
  // ==========================================================

  _resolveHumiditeEntity(area) {

    if (!area || !this._hass) {
      return null;
    }

    const tempInt = this._roomAttributes(area).temperature_interieure;

    if (typeof tempInt === "string" && tempInt.endsWith("_temperature")) {

      const derived = tempInt.slice(0, -"_temperature".length) + "_humidity";

      if (this._hass.states[derived]) {
        return derived;
      }
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
  // TEMPS DE CHAUFFE DU JOUR (sous la consigne)
  // ==========================================================
  //
  // Entité : sensor.heures_chauffe_<pièce> (créée par
  // l'intégration, en heures, remise à zéro à minuit). Accepte un nombre (unité h / min / s lue dans
  // l'entité, heures par défaut) ou un texte "HH:MM:SS" / "HH:MM".
  // Ligne masquée si l'entité n'existe pas.
  //
  // ==========================================================

  _formatHeatTime(st) {

    if (!st || st.state === "unavailable" || st.state === "unknown") {
      return "--";
    }

    let minutes = null;
    const raw = String(st.state).trim();

    if (raw.includes(":")) {

      const parts = raw.split(":").map(Number);

      if (parts.length >= 2 && parts.every(Number.isFinite)) {
        const [h, m, sec = 0] = parts;
        minutes = h * 60 + m + sec / 60;
      }

    } else {

      const n = parseFloat(raw);

      if (Number.isFinite(n)) {
        const unit = String(st.attributes?.unit_of_measurement || "h").toLowerCase();

        if (unit === "s") minutes = n / 60;
        else if (unit === "min") minutes = n;
        else if (unit === "d") minutes = n * 1440;
        else minutes = n * 60;
      }
    }

    if (minutes === null) {
      return raw;
    }

    const total = Math.round(minutes);
    const h = Math.floor(total / 60);
    const m = total % 60;

    return h > 0 ? `${h} h ${String(m).padStart(2, "0")}` : `${m} min`;
  }

  // ==========================================================
  // MODE BOOST
  // ==========================================================
  //
  // Entité : switch.boost_<pièce> (absente dans certaines pièces :
  // la puce est alors masquée). Un appui sur la puce active/désactive
  // le boost.
  //
  // Temps restant, par ordre de priorité :
  //   1) un attribut de fin (date ISO) : fin, end, end_time...
  //   2) un attribut de temps restant (en minutes, ou "HH:MM:SS")
  //   3) à défaut : durée configurée (attribut "duree", en minutes)
  //      moins le temps écoulé depuis le passage du switch sur "on"
  //
  // Un petit minuteur rafraîchit l'affichage toutes les 15 s tant que
  // le boost est actif.
  //
  // ==========================================================

  connectedCallback() {

    if (this._rendered) {
      this._updateBoost();
    }
  }

  disconnectedCallback() {

    this._stopBoostTimer();
  }

  _stopBoostTimer() {

    if (this._boostTimer) {
      clearInterval(this._boostTimer);
      this._boostTimer = null;
    }
  }

  _boostRemainingMs(st) {

    const a = st?.attributes || {};
    const now = Date.now();

    for (const key of ["fin", "end", "end_time", "ends_at", "expires_at", "expiration", "heure_fin", "fin_boost", "boost_end"]) {
      if (a[key]) {
        const t = Date.parse(a[key]);
        if (Number.isFinite(t)) {
          return t - now;
        }
      }
    }

    for (const key of ["restant", "temps_restant", "remaining", "remaining_time", "minutes_restantes", "duree_restante"]) {

      const v = a[key];

      if (v === undefined || v === null || v === "") {
        continue;
      }

      if (typeof v === "string" && v.includes(":")) {
        const parts = v.split(":").map(Number);
        if (parts.every(Number.isFinite)) {
          const [h, m, sec] = parts.length === 3 ? parts : [0, parts[0], parts[1] || 0];
          return ((h * 60 + m) * 60 + sec) * 1000;
        }
      }

      const n = parseFloat(v);
      if (Number.isFinite(n)) {
        return n * 60000;
      }
    }

    const duree = parseFloat(a.duree);
    const since = Date.parse(st?.last_changed);

    if (Number.isFinite(duree) && Number.isFinite(since)) {
      return duree * 60000 - (now - since);
    }

    return null;
  }

  _formatRemaining(ms) {

    const totalMin = Math.max(Math.ceil(ms / 60000), 1);

    if (totalMin >= 60) {
      const h = Math.floor(totalMin / 60);
      const m = totalMin % 60;
      return `${h} h ${String(m).padStart(2, "0")}`;
    }

    return `${totalMin} min`;
  }

  _updateBoost() {

    const els = this._valueEls;

    if (!els || !els.boostChip) {
      return;
    }

    const id = this._entities?.boost;
    const st = id && this._hass ? this._hass.states[id] : null;

    // Pièce sans boost : puce masquée
    els.boostChip.classList.toggle("hidden", !st);

    if (!st) {
      this._stopBoostTimer();
      return;
    }

    const available = st.state !== "unavailable" && st.state !== "unknown";
    const isOn = st.state === "on";

    els.boostChip.classList.toggle("clickable", available);
    els.boostChip.setAttribute("aria-pressed", available && isOn ? "true" : "false");
    this._setChipLevel(els.boostChip, available && isOn ? "warn" : "");

    if (!available) {
      els.boost.textContent = "--";
    } else if (isOn) {

      const remaining = this._boostRemainingMs(st);

      els.boost.textContent = remaining !== null && remaining > 0
        ? `Actif · ${this._formatRemaining(remaining)}`
        : "Actif";

    } else {
      els.boost.textContent = "Inactif";
    }

    // Minuteur : seulement tant que le boost est actif
    if (available && isOn) {

      if (!this._boostTimer) {
        this._boostTimer = setInterval(() => this._updateBoost(), 15000);
      }

    } else {
      this._stopBoostTimer();
    }
  }

  _toggleBoost() {

    const id = this._entities?.boost;
    const st = id && this._hass ? this._hass.states[id] : null;

    if (!st || st.state === "unavailable" || st.state === "unknown") {
      return;
    }

    this._hass.callService("switch", st.state === "on" ? "turn_off" : "turn_on", {
      entity_id: id,
    });
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
            <div class="dial-heat hidden" data-key="dialHeat">
              <ha-icon icon="mdi:timer-outline"></ha-icon>
              <span data-key="dialHeatValue">--</span>
            </div>
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
          <div class="status-chip hidden" data-key="boostChip" role="button" aria-label="Mode boost">
            <ha-icon icon="mdi:rocket-launch"></ha-icon>
            <span data-key="boost">--</span>
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

        .status-chip.hidden {
          display: none;
        }

        .status-chip.clickable {
          cursor: pointer;
          transition: background 0.3s ease, color 0.3s ease, transform 0.1s ease;
        }

        .status-chip.clickable:active {
          transform: scale(0.96);
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

        .dial-heat {
          display: flex;
          align-items: center;
          gap: 3px;
          margin-top: 4px;
          font-size: 11px;
          color: var(--secondary-text-color);
        }

        .dial-heat.hidden {
          display: none;
        }

        .dial-heat ha-icon {
          --mdc-icon-size: 13px;
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
          boost: this.shadowRoot.querySelector('[data-key="boost"]'),
          boostChip: this.shadowRoot.querySelector('[data-key="boostChip"]'),
          dialValue: this.shadowRoot.querySelector('[data-key="dialValue"]'),
          dialSub: this.shadowRoot.querySelector('[data-key="dialSub"]'),
          dialHeat: this.shadowRoot.querySelector('[data-key="dialHeat"]'),
          dialHeatValue: this.shadowRoot.querySelector('[data-key="dialHeatValue"]'),
          dialProgress: this.shadowRoot.querySelector('[data-key="dialProgress"]'),
          heatingBadge: this.shadowRoot.querySelector('[data-key="heatingBadge"]'),
          heatingLabel: this.shadowRoot.querySelector('[data-key="heatingLabel"]'),
        }
      : null;

    this._entities = entities;

    if (this._valueEls && this._valueEls.boostChip) {
      this._valueEls.boostChip.addEventListener("click", () => this._toggleBoost());
    }
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

    // --- Temps de chauffe du jour (sous la consigne, masqué si absent) ---
    const heatState = this._hass.states[this._entities.tempsChauffeJour];

    els.dialHeat.classList.toggle("hidden", !heatState);

    if (heatState) {
      els.dialHeatValue.textContent = `${this._formatHeatTime(heatState)} aujourd'hui`;
    }

    // --- Badge chauffe : Chauffe / Au repos / Éteint ---
    let heatingText = "--";

    if (climateState && climateState.state !== "unavailable" && climateState.state !== "unknown") {
      heatingText = heating ? "Chauffe" : climateState.state === "off" ? "Éteint" : "Au repos";
    }

    if (els.heatingBadge.classList.contains("active") !== heating) {
      els.heatingBadge.classList.toggle("active", heating);
    }
    els.heatingLabel.textContent = heatingText;

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

    // 4) Capteur d'humidité de la pièce (même appareil que la température)
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

    // --- Boost (puce masquée si la pièce n'a pas de boost) ---
    this._updateBoost();
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
    name: "Chauffage intelligent card",
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
//   sensor.pieces_en_chauffe          -> état "n/total" (ex. "2/6")
//   sensor.pieces_froides             -> état "n/total"
//   sensor.pieces_chaudes             -> état "n/total"
//   sensor.heures_chauffe_chaudiere   -> temps de chauffe du jour de
//                                        la chaudière (chauffage GAZ
//                                        uniquement : bloc masqué si
//                                        l'entité n'existe pas)
//   sensor.temperature_ext_mini / _maxi       -> extérieur du jour (optionnel)
//   sensor.temperature_prevue_mini / _maxi    -> prévisions du jour (optionnel)
//
// Le mode de la maison et la chaudière ne sont PAS à nom fixe : ce sont
// les entités choisies par l'utilisateur dans la config centrale. Le
// switch général peut les publier dans ses attributs :
//   mode_entity   -> ex. input_select.mode_presence_maison
//   boiler_entity -> ex. switch.ma_chaudiere (absent en électrique :
//                    le bloc chaudière est alors masqué)
// À défaut, ils se règlent dans l'éditeur de la carte.
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

    // Le switch général peut publier la config centrale de l'intégration :
    //   mode_entity   -> entité du sélecteur de mode choisie par l'utilisateur
    //   boiler_entity -> entité chaudière choisie (absente en électrique)
    const attrs = this._hass?.states?.[master]?.attributes || {};

    return {
      master,
      pieces: custom.pieces || "sensor.pieces_en_chauffe",
      froides: custom.froides || "sensor.pieces_froides",
      chaudes: custom.chaudes || "sensor.pieces_chaudes",
      mode: this.config?.mode_entity || custom.mode || attrs.mode_entity || null,
      chaudiere: this.config?.boiler_entity || custom.chaudiere || attrs.boiler_entity || null,
      // Temps de chauffe du jour de la chaudière : fourni par l'intégration
      // (chauffage gaz uniquement)
      tempsChauffe: custom.tempsChauffe || "sensor.heures_chauffe_chaudiere",
      // Températures du jour (optionnelles : créées selon la config centrale)
      extMini: custom.extMini || "sensor.temperature_ext_mini",
      extMaxi: custom.extMaxi || "sensor.temperature_ext_maxi",
      prevMini: custom.prevMini || "sensor.temperature_prevue_mini",
      prevMaxi: custom.prevMaxi || "sensor.temperature_prevue_maxi",
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

        * {
          box-sizing: border-box;
        }

        .card {
          background: var(--ha-card-background, var(--card-background-color));
          border: 1px solid var(--divider-color);
          border-radius: var(--ha-card-border-radius, 16px);
          padding: 14px;
          color: var(--primary-text-color);
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        /* ---------- Bandeau titre ---------- */

        .banner {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 12px 16px;
          border: 1px solid var(--divider-color);
          border-radius: 14px;
          background: color-mix(in srgb, var(--primary-text-color) 3%, transparent);
        }

        .banner-icon {
          --mdc-icon-size: 44px;
          color: var(--primary-color, #03a9f4);
          flex: none;
        }

        .banner-text {
          min-width: 0;
        }

        .banner-title {
          font-size: 24px;
          font-weight: 600;
          line-height: 1.15;
        }

        .banner-sub {
          margin-top: 2px;
          font-size: 14px;
          color: var(--primary-color, #03a9f4);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        /* ---------- Panneau principal ---------- */

        .panel {
          padding: 14px;
          border: 1px solid var(--divider-color);
          border-radius: 14px;
          background: color-mix(in srgb, var(--primary-text-color) 3%, transparent);
        }

        .panel-top {
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .device {
          flex: none;
          width: 70px;
          display: flex;
          align-items: center;
          justify-content: center;
          filter: drop-shadow(0 3px 5px rgba(0, 0, 0, 0.35));
        }

        .device svg {
          width: 100%;
          height: auto;
          display: block;
        }

        .device svg.hidden {
          display: none;
        }

        .rad-accent { fill: #8a94a3; transition: fill 0.3s ease; }
        .rad-accent-stroke { stroke: #8a94a3; opacity: 0; transition: stroke 0.3s ease, opacity 0.3s ease; }
        .device.on .rad-accent { fill: var(--primary-color, #03a9f4); }
        .device.on .rad-accent-stroke { stroke: var(--primary-color, #03a9f4); opacity: 1; }

        .boiler-logo { fill: #8a94a3; transition: fill 0.3s ease; }
        .boiler-flame { fill: #5f6b7a; transition: fill 0.3s ease; }
        .device.on .boiler-logo { fill: var(--primary-color, #03a9f4); }
        .device.on .boiler-flame { fill: var(--primary-color, #03a9f4); }

        .panel-info {
          min-width: 0;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 6px;
        }

        .badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 5px 12px;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          white-space: nowrap;
          color: var(--secondary-text-color);
          border: 1px solid var(--divider-color);
          background: color-mix(in srgb, var(--primary-text-color) 4%, transparent);
          transition: all 0.3s ease;
          --mdc-icon-size: 18px;
        }

        .badge.active {
          color: var(--success-color, #4caf50);
          border-color: var(--success-color, #4caf50);
          background: color-mix(in srgb, var(--success-color, #4caf50) 14%, transparent);
        }

        .heat-time-label {
          font-size: 13px;
          color: var(--secondary-text-color);
          line-height: 1.2;
        }

        .heat-time-value {
          font-size: 22px;
          font-weight: 600;
          line-height: 1.1;
        }

        .hidden {
          display: none;
        }

        /* ---------- Boutons Arrêt / On ---------- */

        .buttons {
          display: flex;
          gap: 10px;
          margin-top: 14px;
        }

        .btn {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 14px 8px;
          font-family: inherit;
          font-size: 14px;
          font-weight: 500;
          color: var(--primary-text-color);
          cursor: pointer;
          border-radius: 14px;
          border: 1px solid var(--divider-color);
          background: color-mix(in srgb, var(--primary-text-color) 4%, transparent);
          transition: background 0.25s ease, border-color 0.25s ease, color 0.25s ease, transform 0.1s ease;
          --mdc-icon-size: 28px;
        }

        .btn:active {
          transform: scale(0.97);
        }

        .btn.active {
          color: #fff;
          border-color: var(--primary-color, #03a9f4);
          background: var(--primary-color, #03a9f4);
          box-shadow: 0 2px 10px color-mix(in srgb, var(--primary-color, #03a9f4) 45%, transparent);
        }

        .btn.na {
          cursor: not-allowed;
          opacity: 0.55;
        }

        /* ---------- Carrés d'infos (icône, titre, valeur, barre) ---------- */

        .tiles {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
          gap: 10px;
        }

        .tile {
          display: flex;
          flex-direction: column;
          padding: 14px;
          border: 1px solid var(--divider-color);
          border-radius: 14px;
          background: color-mix(in srgb, var(--primary-text-color) 3%, transparent);
          transition: border-color 0.3s ease;
        }

        .tile.hidden {
          display: none;
        }

        .tile-head {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 14px;
          line-height: 1.2;
        }

        .tile-head ha-icon {
          flex: none;
          --mdc-icon-size: 26px;
        }

        .tile-value {
          margin-top: 10px;
          font-size: 28px;
          font-weight: 500;
          line-height: 1.1;
          word-break: break-word;
        }

        .tile-value.text {
          font-size: 22px;
        }

        .tile-value small {
          font-size: 16px;
          font-weight: 400;
          color: var(--secondary-text-color);
        }

        .tile-sub {
          margin-top: 4px;
          font-size: 12px;
          color: var(--secondary-text-color);
        }

        .bar {
          margin-top: auto;
          padding-top: 12px;
        }

        .bar-track {
          height: 6px;
          border-radius: 3px;
          overflow: hidden;
          background: color-mix(in srgb, var(--primary-text-color) 12%, transparent);
        }

        .bar-fill {
          height: 100%;
          width: 0;
          border-radius: 3px;
          transition: width 0.4s ease;
        }

        /* Couleurs par carré (comme les carrés colorés de la référence) */
        .tile.heat .tile-head ha-icon { color: var(--warning-color, #ff9800); }
        .tile.heat .bar-fill { background: var(--warning-color, #ff9800); }

        .tile.cold .tile-head ha-icon { color: var(--info-color, #42a5f5); }
        .tile.cold .bar-fill { background: var(--info-color, #42a5f5); }

        .tile.hot .tile-head ha-icon { color: #ff7043; }
        .tile.hot .bar-fill { background: #ff7043; }

        /* Rouge dès qu'il y a au moins une pièce concernée */
        .tile.error {
          border-color: var(--error-color, #f44336);
        }

        .tile.error .tile-head ha-icon,
        .tile.error .tile-value {
          color: var(--error-color, #f44336);
        }

        .tile.error .bar-fill {
          background: var(--error-color, #f44336);
        }

        /* ---------- Températures du jour (optionnelles) ---------- */

        .temps {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
          gap: 10px;
        }

        .temp-tile {
          display: flex;
          flex-direction: column;
          padding: 14px;
          border: 1px solid var(--divider-color);
          border-radius: 14px;
          background: color-mix(in srgb, var(--primary-text-color) 3%, transparent);
        }

        .temp-tile .tile-head ha-icon { color: var(--primary-color, #03a9f4); }

        .temp-range {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          margin-top: 10px;
        }

        .temp-cell {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 22px;
          font-weight: 500;
          line-height: 1.1;
        }

        .temp-cell ha-icon { --mdc-icon-size: 22px; }
        .temp-cell.min ha-icon { color: var(--info-color, #42a5f5); }
        .temp-cell.max ha-icon { color: #ff7043; }

        .temps.hidden,
        .temp-tile.hidden {
          display: none;
        }

      </style>

      <div class="card">

        <div class="banner">
          <ha-icon class="banner-icon" icon="mdi:fire"></ha-icon>
          <div class="banner-text">
            <div class="banner-title">Chauffage</div>
            <div class="banner-sub" data-key="bannerSub">Maison</div>
          </div>
        </div>

        <div class="panel">

          <div class="panel-top">
            <div class="device" data-key="device">
              <svg data-key="deviceBoiler" viewBox="0 0 70 112" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <defs>
                  <linearGradient id="bBody" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0" stop-color="#cfd5de"/>
                    <stop offset="0.18" stop-color="#f7f8fa"/>
                    <stop offset="0.75" stop-color="#eceff3"/>
                    <stop offset="1" stop-color="#b9c0cb"/>
                  </linearGradient>
                  <linearGradient id="bScreen" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stop-color="#1b222c"/>
                    <stop offset="1" stop-color="#0b0f15"/>
                  </linearGradient>
                </defs>
                <rect x="26" y="1" width="18" height="7" rx="2.5" fill="#aab2be"/>
                <rect x="6" y="6" width="58" height="84" rx="11" fill="url(#bBody)"/>
                <rect x="6.5" y="6.5" width="57" height="83" rx="10.5" fill="none" stroke="#ffffff" stroke-opacity="0.7"/>
                <path class="boiler-logo" d="M35 24 C39 29 43 32 43 38 A8 8 0 0 1 27 38 C27 34 30 32 31 28 C32 30 33 30 34 29 C34.5 27 35 26 35 24 Z"/>
                <rect x="16" y="55" width="38" height="15" rx="3.500" fill="url(#bScreen)" stroke="#9aa3b0" stroke-width="1"/>
                <path class="boiler-flame" d="M35 58.500 C37 61 38.500 62 38.500 64.200 A3.500 3.500 0 0 1 31.500 64.200 C31.500 62.800 32.800 62 33.200 60.600 C34 61.300 34.600 61 35 58.500 Z"/>
                <rect x="14" y="90" width="42" height="4" rx="2" fill="#aab2be"/>
                <rect x="18" y="94" width="7" height="15" rx="2" fill="#f0883e"/>
                <rect x="18" y="94" width="7" height="3" rx="1" fill="#c96a26"/>
                <rect x="31.500" y="94" width="7" height="15" rx="2" fill="#9aa3b0"/>
                <rect x="31.500" y="94" width="7" height="3" rx="1" fill="#7d8694"/>
                <rect x="45" y="94" width="7" height="15" rx="2" fill="#4aa3f0"/>
                <rect x="45" y="94" width="7" height="3" rx="1" fill="#2f86d3"/>
              </svg>
              <svg class="hidden" data-key="deviceRad" viewBox="0 0 70 112" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <defs>
                  <linearGradient id="rFin" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0" stop-color="#cfd5de"/>
                    <stop offset="0.35" stop-color="#f7f8fa"/>
                    <stop offset="1" stop-color="#b9c0cb"/>
                  </linearGradient>
                </defs>
                <rect x="4" y="22" width="62" height="7" rx="3.500" fill="#aab2be"/>
                <rect x="9" y="26" width="9" height="62" rx="4.500" fill="url(#rFin)"/>
                <rect x="20" y="26" width="9" height="62" rx="4.500" fill="url(#rFin)"/>
                <rect x="31" y="26" width="9" height="62" rx="4.500" fill="url(#rFin)"/>
                <rect x="42" y="26" width="9" height="62" rx="4.500" fill="url(#rFin)"/>
                <rect x="53" y="26" width="9" height="62" rx="4.500" fill="url(#rFin)"/>
                <rect x="4" y="85" width="62" height="7" rx="3.500" fill="#aab2be"/>
                <rect class="rad-accent" x="52" y="92" width="9" height="12" rx="2.500"/>
                <rect x="9" y="92" width="6" height="8" rx="2" fill="#9aa3b0"/>
                <path class="rad-accent-stroke" d="M22 14 C20 11 24 9 22 6 M35 14 C33 11 37 9 35 6 M48 14 C46 11 50 9 48 6" fill="none" stroke-width="2" stroke-linecap="round"/>
              </svg>
            </div>
            <div class="panel-info">
              <div class="badge" data-key="badge">
                <ha-icon icon="mdi:fire" data-key="badgeIcon"></ha-icon>
                <span data-key="badgeLabel">--</span>
              </div>
              <div class="heat-time hidden" data-key="heatTime">
                <div class="heat-time-label">Temps de chauffe du jour</div>
                <div class="heat-time-value" data-key="heatTimeValue">--</div>
              </div>
            </div>
          </div>

          <div class="buttons">
            <button class="btn na" data-key="offBtn" aria-label="Arrêter le chauffage">
              <ha-icon icon="mdi:power"></ha-icon>
              <span>Arrêt</span>
            </button>
            <button class="btn na" data-key="onBtn" aria-label="Allumer le chauffage">
              <ha-icon icon="mdi:fire"></ha-icon>
              <span>On</span>
            </button>
          </div>

        </div>

        <div class="tiles">

          <div class="tile heat" data-key="heatTile">
            <div class="tile-head">
              <ha-icon icon="mdi:radiator"></ha-icon>
              <span>Pièces en chauffe</span>
            </div>
            <div class="tile-value" data-key="heat">--</div>
            <div class="bar"><div class="bar-track"><div class="bar-fill" data-key="heatBar"></div></div></div>
          </div>

          <div class="tile cold" data-key="froidesTile">
            <div class="tile-head">
              <ha-icon icon="mdi:snowflake-alert"></ha-icon>
              <span>Pièces trop froides</span>
            </div>
            <div class="tile-value" data-key="froides">--</div>
            <div class="bar"><div class="bar-track"><div class="bar-fill" data-key="froidesBar"></div></div></div>
          </div>

          <div class="tile hot" data-key="chaudesTile">
            <div class="tile-head">
              <ha-icon icon="mdi:thermometer-alert"></ha-icon>
              <span>Pièces trop chaudes</span>
            </div>
            <div class="tile-value" data-key="chaudes">--</div>
            <div class="bar"><div class="bar-track"><div class="bar-fill" data-key="chaudesBar"></div></div></div>
          </div>

        </div>

        <div class="temps hidden" data-key="temps">

          <div class="temp-tile hidden" data-key="extTile">
            <div class="tile-head">
              <ha-icon icon="mdi:thermometer"></ha-icon>
              <span>Extérieur aujourd'hui</span>
            </div>
            <div class="temp-range">
              <div class="temp-cell min"><ha-icon icon="mdi:thermometer-low"></ha-icon><span data-key="extMini">--</span></div>
              <div class="temp-cell max"><ha-icon icon="mdi:thermometer-high"></ha-icon><span data-key="extMaxi">--</span></div>
            </div>
          </div>

          <div class="temp-tile hidden" data-key="prevTile">
            <div class="tile-head">
              <ha-icon icon="mdi:weather-partly-cloudy"></ha-icon>
              <span>Prévisions du jour</span>
            </div>
            <div class="temp-range">
              <div class="temp-cell min"><ha-icon icon="mdi:thermometer-low"></ha-icon><span data-key="prevMini">--</span></div>
              <div class="temp-cell max"><ha-icon icon="mdi:thermometer-high"></ha-icon><span data-key="prevMaxi">--</span></div>
            </div>
          </div>

        </div>

      </div>
    `;

    const q = (key) => this.shadowRoot.querySelector(`[data-key="${key}"]`);

    this._els = {
      bannerSub: q("bannerSub"),
      device: q("device"),
      deviceBoiler: q("deviceBoiler"),
      deviceRad: q("deviceRad"),
      badge: q("badge"),
      badgeIcon: q("badgeIcon"),
      badgeLabel: q("badgeLabel"),
      heatTime: q("heatTime"),
      heatTimeValue: q("heatTimeValue"),
      offBtn: q("offBtn"),
      onBtn: q("onBtn"),
      heat: q("heat"),
      heatBar: q("heatBar"),
      froides: q("froides"),
      froidesTile: q("froidesTile"),
      froidesBar: q("froidesBar"),
      chaudes: q("chaudes"),
      chaudesTile: q("chaudesTile"),
      chaudesBar: q("chaudesBar"),
      temps: q("temps"),
      extTile: q("extTile"),
      extMini: q("extMini"),
      extMaxi: q("extMaxi"),
      prevTile: q("prevTile"),
      prevMini: q("prevMini"),
      prevMaxi: q("prevMaxi"),
    };

    this._els.offBtn.addEventListener("click", () => this._setPower(false));
    this._els.onBtn.addEventListener("click", () => this._setPower(true));

    this._built = true;
  }

  // ==========================================================
  // BOUTONS ARRET / ON
  // ==========================================================

  _setPower(on) {

    const id = this._ids().master;
    const st = this._hass?.states?.[id];

    if (!st || st.state === "unavailable" || st.state === "unknown") {
      return;
    }

    const domain = id.split(".")[0];

    this._hass.callService(domain, on ? "turn_on" : "turn_off", {
      entity_id: id,
    });
  }

  // ==========================================================
  // LECTURE D'UN COMPTEUR "n/total"
  // ==========================================================
  //
  // Les capteurs de l'intégration (pièces en chauffe / froides /
  // chaudes) ont pour état un texte "n/total", par exemple "2/6".
  // Un état purement numérique (avec attribut "total") est aussi
  // accepté.
  //
  // ==========================================================

  _readCount(st) {

    if (!st) {
      return { value: null, total: null };
    }

    const raw = String(st.state ?? "").trim();
    const match = raw.match(/^(\d+)\s*\/\s*(\d+)$/);

    if (match) {
      return { value: parseInt(match[1], 10), total: parseInt(match[2], 10) };
    }

    const value = parseInt(raw, 10);

    if (!Number.isFinite(value)) {
      return { value: null, total: null };
    }

    const total = parseInt(st.attributes?.total, 10);

    return { value, total: Number.isFinite(total) ? total : null };
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

    // --- Boutons : celui de l'état actuel passe au bleu ---
    const master = states[ids.master];
    const masterState = master?.state;
    const available = master && masterState !== "unavailable" && masterState !== "unknown";
    const isOn = masterState === "on";

    els.onBtn.classList.toggle("active", available && isOn);
    els.offBtn.classList.toggle("active", available && !isOn);
    els.onBtn.classList.toggle("na", !available);
    els.offBtn.classList.toggle("na", !available);
    els.device.classList.toggle("on", available && isOn);

    // --- Compteurs "n/total" (lus dans l'intégration) ---
    const pieces = this._readCount(states[ids.pieces]);
    const froidesCount = this._readCount(states[ids.froides]);
    const chaudesCount = this._readCount(states[ids.chaudes]);

    const count = pieces.value;
    const total = [pieces.total, froidesCount.total, chaudesCount.total]
      .find((t) => Number.isFinite(t)) ?? null;
    const hasTotal = Number.isFinite(total) && total > 0;

    // --- Badge : En chauffe / Au repos / Éteint ---
    let badgeText = "--";
    let badgeActive = false;

    if (available) {

      if (!isOn) {
        badgeText = "Éteint";
      } else if (Number.isFinite(count) && count > 0) {
        badgeText = "En chauffe";
        badgeActive = true;
      } else {
        badgeText = "Au repos";
      }
    }

    els.badge.classList.toggle("active", badgeActive);
    els.badgeIcon.setAttribute("icon", available && !isOn ? "mdi:fire-off" : "mdi:fire");
    els.badgeLabel.textContent = badgeText;

    // --- Pièces en chauffe : "x / total" + barre ---
    els.heat.innerHTML = !Number.isFinite(count)
      ? "--"
      : `${count}`;
    els.heatBar.style.width = Number.isFinite(count) && hasTotal
      ? `${Math.round(Math.min(count / total, 1) * 100)}%`
      : "0%";

    // --- Pièces trop froides / trop chaudes (lues dans l'intégration) ---
    const froides = froidesCount.value;
    const chaudes = chaudesCount.value;

    const fill = (bar, value) => {
      const ratio = value === null ? 0 : hasTotal ? Math.min(value / total, 1) : value > 0 ? 1 : 0;
      bar.style.width = `${Math.round(ratio * 100)}%`;
    };

    els.froides.innerHTML = froides === null
      ? "--"
      : `${froides}`;
    els.froidesTile.classList.toggle("error", froides !== null && froides > 0);
    fill(els.froidesBar, froides);

    els.chaudes.innerHTML = chaudes === null
      ? "--"
      : `${chaudes}`;
    els.chaudesTile.classList.toggle("error", chaudes !== null && chaudes > 0);
    fill(els.chaudesBar, chaudes);

    // --- Vignette : chaudière si une entité chaudière existe, sinon radiateur (électrique) ---
    const hasBoiler = !!(ids.chaudiere && states[ids.chaudiere]) || !!states[ids.tempsChauffe];

    els.deviceBoiler.classList.toggle("hidden", !hasBoiler);
    els.deviceRad.classList.toggle("hidden", hasBoiler);

    // --- Temps de chauffe du jour de la chaudière (gaz uniquement) ---
    // Lu directement dans l'intégration ; bloc masqué si l'entité n'existe pas.
    const heatTimeState = states[ids.tempsChauffe];

    els.heatTime.classList.toggle("hidden", !heatTimeState);

    if (heatTimeState) {
      els.heatTimeValue.textContent = this._formatHeatTime(heatTimeState);
    }

    // --- Températures du jour (blocs masqués si les capteurs n'existent pas) ---
    const fmtTemp = (id) => {

      const st = states[id];

      if (!st || st.state === "unavailable" || st.state === "unknown") {
        return "--";
      }

      const v = parseFloat(st.state);

      return Number.isFinite(v) ? `${v.toFixed(1)}°` : "--";
    };

    const hasExt = !!(states[ids.extMini] || states[ids.extMaxi]);
    const hasPrev = !!(states[ids.prevMini] || states[ids.prevMaxi]);

    els.extTile.classList.toggle("hidden", !hasExt);
    els.prevTile.classList.toggle("hidden", !hasPrev);
    els.temps.classList.toggle("hidden", !hasExt && !hasPrev);

    if (hasExt) {
      els.extMini.textContent = fmtTemp(ids.extMini);
      els.extMaxi.textContent = fmtTemp(ids.extMaxi);
    }

    if (hasPrev) {
      els.prevMini.textContent = fmtTemp(ids.prevMini);
      els.prevMaxi.textContent = fmtTemp(ids.prevMaxi);
    }

    // --- Mode de la maison (affiché dans le bandeau) ---
    const mode = ids.mode ? states[ids.mode]?.state : null;
    const modeOk = mode && mode !== "unknown" && mode !== "unavailable";

    els.bannerSub.textContent = modeOk ? `Mode ${mode}` : "Maison";
  }

  // ==========================================================
  // FORMAT DU TEMPS DE CHAUFFE
  // ==========================================================
  // Accepte un nombre (unité h / min / s lue dans l'entité, heures
  // par défaut) ou un texte "HH:MM:SS" / "HH:MM".
  // ==========================================================

  _formatHeatTime(st) {

    if (!st || st.state === "unavailable" || st.state === "unknown") {
      return "--";
    }

    let minutes = null;
    const raw = String(st.state).trim();

    if (raw.includes(":")) {

      const parts = raw.split(":").map(Number);

      if (parts.length >= 2 && parts.every(Number.isFinite)) {
        const [h, m, sec = 0] = parts;
        minutes = h * 60 + m + sec / 60;
      }

    } else {

      const n = parseFloat(raw);

      if (Number.isFinite(n)) {
        const unit = String(st.attributes?.unit_of_measurement || "h").toLowerCase();

        if (unit === "s") minutes = n / 60;
        else if (unit === "min") minutes = n;
        else if (unit === "d") minutes = n * 1440;
        else minutes = n * 60;
      }
    }

    if (minutes === null) {
      return raw;
    }

    const total = Math.round(minutes);
    const h = Math.floor(total / 60);
    const m = total % 60;

    return h > 0 ? `${h} h ${String(m).padStart(2, "0")}` : `${m} min`;
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
    return 6;
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
          le switch général de l'intégration. Le temps de chauffe du
          jour de la chaudière est lu automatiquement dans
          l'intégration (chauffage gaz uniquement).
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
//   window_entity: binary_sensor.zzz (optionnel : capteur de fenêtre/porte)
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

    return [c.area, c.name, c.temperature_entity, c.humidity_entity, c.window_entity].join("|");
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
      fenetre: c.window_entity || own(`switch.fenetre_ouverte_${area}`),
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

  // Humidité : Normal = vert, Élevé = jaune, Très élevé = orange,
  // Excessive = rouge (mêmes règles que la carte pièce).
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
  // Déconseillée = rouge (mêmes règles que la carte pièce).
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
          transition: background 0.3s ease, color 0.3s ease;
        }

        .status-chip.hidden {
          display: none;
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
    this._setChipLevel(els.humiditeChip, this._humidityClass(niveau));

    els.aerationChip.classList.toggle("hidden", !ids.aeration);

    if (ids.aeration) {
      const a = states[ids.aeration]?.state;
      els.aeration.textContent = a && a !== "unknown" && a !== "unavailable" ? a : "--";
      this._setChipLevel(els.aerationChip, this._aerationClass(a));
    }

    els.fenetreChip.classList.toggle("hidden", !ids.fenetre);

    if (ids.fenetre) {
      const f = states[ids.fenetre]?.state;
      els.fenetre.textContent = f === "on" ? "Ouverte" : f === "off" ? "Fermée" : "--";

      // Ouverte = rouge, fermée = vert
      this._setChipLevel(
        els.fenetreChip,
        f === "on" ? "error" : f === "off" ? "ok" : ""
      );
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
        <div class="title">Fenêtre / porte (optionnel)</div>
        <ha-selector id="window"></ha-selector>
        <div class="title">Pièce (optionnel, laisser vide pour un appareil)</div>
        <ha-selector id="area"></ha-selector>
        <div class="info">
          Aucun capteur n'est choisi automatiquement : si un champ est
          vide, l'information correspondante n'est pas affichée. Sans
          pièce, la carte n'utilise aucune entité du chauffage de la maison.
          L'aération est lue automatiquement si l'intégration la calcule
          pour la pièce.
        </div>
      </div>
    `;

    this._name = this.shadowRoot.querySelector("#name");
    this._area = this.shadowRoot.querySelector("#area");
    this._temperature = this.shadowRoot.querySelector("#temperature");
    this._humidity = this.shadowRoot.querySelector("#humidity");
    this._window = this.shadowRoot.querySelector("#window");

    this._name.selector = { text: {} };
    this._area.selector = { area: {} };
    this._temperature.selector = { entity: { domain: "sensor", device_class: "temperature" } };
    this._humidity.selector = { entity: { domain: "sensor", device_class: "humidity" } };
    this._window.selector = { entity: { domain: "binary_sensor", device_class: ["door", "window", "garage_door", "opening"] } };

    this._name.addEventListener("value-changed", (e) => this._changed("name", e.detail.value));
    this._area.addEventListener("value-changed", (e) => this._changed("area", e.detail.value));
    this._temperature.addEventListener("value-changed", (e) => this._changed("temperature_entity", e.detail.value));
    this._humidity.addEventListener("value-changed", (e) => this._changed("humidity_entity", e.detail.value));
    this._window.addEventListener("value-changed", (e) => this._changed("window_entity", e.detail.value));

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
    this._window.hass = this._hass;

    this._name.value = this._config.name || "";
    this._area.value = this._config.area || "";
    this._temperature.value = this._config.temperature_entity || "";
    this._humidity.value = this._config.humidity_entity || "";
    this._window.value = this._config.window_entity || "";
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
