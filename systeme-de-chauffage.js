class SystemeChauffageCard extends HTMLElement {

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._built = false;
  }

  // ==========================================================
  // CONFIGURATION
  // ==========================================================

  setConfig(config) {

    this.config = config || {};

    if (!this.config.area) {
      this.config.area = "";
    }

    if (this._hass) {
      this._render();
    }
  }

  // ==========================================================
  // HASS
  // ==========================================================

  set hass(hass) {

    this._hass = hass;

    if (this.config) {
      this._render();
    }
  }

  get hass() {
    return this._hass;
  }

  // ==========================================================
  // RECUPERATION DES PIECES HOME ASSISTANT
  // ==========================================================

  async _getAreas() {

    if (!this._hass) {
      return [];
    }

    try {

      const result = await this._hass.callWS({
        type: "config/area_registry/list"
      });

      return result || [];

    } catch (error) {

      console.error(
        "systeme-chauffage-card : impossible de récupérer les pièces",
        error
      );

      return [];
    }
  }

  // ==========================================================
  // CONSTRUCTION DES ENTITES
  // ==========================================================
  //
  // Exemple :
  //
  // pièce = bureau_salle_de_jeux
  //
  // devient :
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
  // RENDU
  // ==========================================================

  async _render() {

    if (!this._hass || !this.config) {
      return;
    }

    const areas = await this._getAreas();

    const selectedArea = this.config.area || "";

    // --------------------------------------------------------
    // NOM AFFICHÉ DE LA PIÈCE
    // --------------------------------------------------------

    let selectedAreaName = "Choisir une pièce";

    const selectedAreaObj = areas.find(
      area => area.area_id === selectedArea
    );

    if (selectedAreaObj) {
      selectedAreaName = selectedAreaObj.name;
    }

    // --------------------------------------------------------
    // ENTITES
    // --------------------------------------------------------

    const entities = this._getEntities(selectedArea);

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
    // HTML
    // ========================================================

    this.shadowRoot.innerHTML = `

      <style>

        :host {
          display: block;
        }

        .card {
          background: var(--card-background-color, #1c1c1c);
          border: 1px solid var(--divider-color, #333);
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
          font-size: 14px;
          color: var(--secondary-text-color, #999);
          margin-top: 3px;
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
          color: var(--secondary-text-color, #999);
        }

        .value {
          margin-top: 5px;
          font-size: 22px;
          font-weight: 400;
        }

        .unit {
          font-size: 14px;
          color: var(--secondary-text-color, #999);
        }

        .empty {
          margin-top: 16px;
          color: var(--secondary-text-color, #999);
        }

      </style>

      <div class="card">

        <div class="header">

          <div>
            <div class="title">
              Chauffage
            </div>

            <div class="room">
              ${selectedAreaName}
            </div>
          </div>

          <div class="icon">
            <ha-icon icon="mdi:fire"></ha-icon>
          </div>

        </div>

        <div class="grid">
          ${boxes}
        </div>

      </div>

    `;
  }

  // ==========================================================
  // EDITEUR GRAPHIQUE
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


// ==============================================================
// EDITEUR
// ==============================================================

class SystemeChauffageCardEditor extends HTMLElement {

  constructor() {

    super();

    this.attachShadow({
      mode: "open"
    });

    this._built = false;
    this._areas = [];
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

    this._update();
  }

  // ==========================================================
  // HASS
  // ==========================================================

  set hass(hass) {

    this._hass = hass;

    if (this._built) {
      this._loadAreas();
    }
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
          padding: 8px 0;
        }

        .title {
          font-size: 14px;
          font-weight: 500;
          margin-bottom: 8px;
        }

        select {
          width: 100%;
          box-sizing: border-box;
          padding: 12px;
          border-radius: 8px;
          border: 1px solid
            var(--divider-color, #444);

          background:
            var(--secondary-background-color, #222);

          color:
            var(--primary-text-color, white);

          font-size: 16px;
        }

        .info {
          margin-top: 10px;
          font-size: 12px;
          color:
            var(--secondary-text-color, #999);
        }

      </style>

      <div class="container">

        <div class="title">
          Pièce
        </div>

        <select id="area">

          <option value="">
            Chargement des pièces...
          </option>

        </select>

        <div class="info">
          Les entités de chauffage sont détectées
          automatiquement à partir de la pièce sélectionnée.
        </div>

      </div>

    `;

    this.shadowRoot
      .querySelector("#area")
      .addEventListener("change", (event) => {

        this._config = {
          ...this._config,
          area: event.target.value
        };

        this._fireConfigChanged();

      });

    this._built = true;
  }

  // ==========================================================
  // RECUPERATION DES AREAS
  // ==========================================================

  async _loadAreas() {

    if (!this._hass) {
      return;
    }

    try {

      const areas = await this._hass.callWS({
        type: "config/area_registry/list"
      });

      this._areas = areas || [];

      this._update();

    } catch (error) {

      console.error(
        "systeme-chauffage-card editor : erreur areas",
        error
      );

      const select =
        this.shadowRoot.querySelector("#area");

      if (select) {

        select.innerHTML = `
          <option value="">
            Impossible de charger les pièces
          </option>
        `;
      }
    }
  }

  // ==========================================================
  // MISE A JOUR DU SELECTEUR
  // ==========================================================

  _update() {

    if (!this._built) {
      return;
    }

    const select =
      this.shadowRoot.querySelector("#area");

    if (!select) {
      return;
    }

    const currentValue =
      this._config?.area || "";

    select.innerHTML = "";

    // --------------------------------------------------------
    // OPTION VIDE
    // --------------------------------------------------------

    const emptyOption =
      document.createElement("option");

    emptyOption.value = "";
    emptyOption.textContent =
      "Choisir une pièce...";

    select.appendChild(emptyOption);

    // --------------------------------------------------------
    // PIECES HA
    // --------------------------------------------------------

    this._areas
      .slice()
      .sort((a, b) =>
        a.name.localeCompare(
          b.name,
          "fr",
          { sensitivity: "base" }
        )
      )
      .forEach((area) => {

        const option =
          document.createElement("option");

        option.value = area.area_id;
        option.textContent = area.name;

        if (area.area_id === currentValue) {
          option.selected = true;
        }

        select.appendChild(option);
      });

    // Si aucune pièce n'est encore disponible
    if (this._areas.length === 0) {

      emptyOption.textContent =
        "Aucune pièce trouvée";

    }
  }

  // ==========================================================
  // CONFIG-CHANGED
  // ==========================================================

  _fireConfigChanged() {

    this.dispatchEvent(
      new CustomEvent("config-changed", {

        detail: {
          config: this._config
        },

        bubbles: true,
        composed: true

      })
    );
  }
}


// ==============================================================
// ENREGISTREMENT EDITEUR
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
// ENREGISTREMENT CARTE
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
// DECLARATION HOME ASSISTANT
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

    type: "systeme-chauffage-card",

    name: "Système de chauffage",

    description:
      "Affichage du chauffage par pièce",

    preview: true

  });
}
