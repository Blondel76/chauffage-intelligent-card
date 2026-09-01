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

      .empty {
        margin-top: 16px;
        color: var(--secondary-text-color, #999999);
        font-size: 14px;
      }

    `;

    this.shadowRoot.appendChild(style);
  }

  // ==========================================================
  // CONFIGURATION
  // ==========================================================

  setConfig(config) {

    this.config = config || {};

    /*
     * UNE SEULE configuration :
     *
     * type: custom:systeme-chauffage-card
     * area: bureau
     *
     * Aucun entity_xxx.
     * Aucun calcul.
     * Aucun champ obligatoire.
     */

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
  // RÉCUPÉRATION DES ENTITÉS DE LA PIÈCE
  // ==========================================================

  _getAreaEntities() {

    if (!this._hass || !this.config?.area) {
      return [];
    }

    const areaId = this.config.area;

    /*
     * Home Assistant expose les associations pièce → entité
     * dans le registre des entités.
     */

    const entityRegistry =
      this._hass.entities ||
      {};

    const entities = [];

    Object.values(entityRegistry).forEach((entity) => {

      if (entity.area_id === areaId) {
        entities.push(entity);
      }

    });

    return entities;
  }

  // ==========================================================
  // VALEUR D'UNE ENTITÉ
  // ==========================================================

  _getState(entityId) {

    const stateObj = this._hass?.states?.[entityId];

    if (!stateObj) {
      return {
        state: "--",
        unit: "",
      };
    }

    return {
      state: stateObj.state,
      unit:
        stateObj.attributes?.unit_of_measurement || "",
    };
  }

  // ==========================================================
  // NOM DE L'ENTITÉ
  // ==========================================================

  _getEntityName(entityId) {

    const stateObj = this._hass?.states?.[entityId];

    if (!stateObj) {
      return entityId;
    }

    return (
      stateObj.attributes?.friendly_name ||
      entityId
    );
  }

  // ==========================================================
  // ICÔNE
  // ==========================================================

  _getEntityIcon(entityId) {

    const stateObj = this._hass?.states?.[entityId];

    if (!stateObj) {
      return "mdi:help-circle-outline";
    }

    return (
      stateObj.attributes?.icon ||
      this._getDefaultIcon(stateObj.entity_id)
    );
  }

  _getDefaultIcon(entityId) {

    if (entityId.startsWith("sensor.")) {
      return "mdi:eye";
    }

    if (entityId.startsWith("climate.")) {
      return "mdi:radiator";
    }

    if (entityId.startsWith("switch.")) {
      return "mdi:toggle-switch";
    }

    if (entityId.startsWith("light.")) {
      return "mdi:lightbulb";
    }

    if (entityId.startsWith("binary_sensor.")) {
      return "mdi:checkbox-marked-circle-outline";
    }

    if (entityId.startsWith("input_number.")) {
      return "mdi:numeric";
    }

    if (entityId.startsWith("input_text.")) {
      return "mdi:form-textbox";
    }

    if (entityId.startsWith("fan.")) {
      return "mdi:fan";
    }

    return "mdi:home-assistant";
  }

  // ==========================================================
  // COULEUR DE L'ICÔNE
  // ==========================================================

  _getIconColor(entityId) {

    const stateObj = this._hass?.states?.[entityId];

    if (!stateObj) {
      return "var(--secondary-text-color, #999999)";
    }

    const state = stateObj.state;

    if (
      state === "on" ||
      state === "heat" ||
      state === "heating"
    ) {
      return "#ff9800";
    }

    return "var(--secondary-text-color, #999999)";
  }

  // ==========================================================
  // RENDU
  // ==========================================================

  render() {

    if (!this._hass || !this.config) {
      return;
    }

    const areaId = this.config.area;

    if (!areaId) {

      this._renderMessage(
        "Aucune pièce configurée"
      );

      return;
    }

    const entities = this._getAreaEntities();

    /*
     * On trie les entités par nom.
     */

    entities.sort((a, b) => {

      const nameA =
        this._getEntityName(a.entity_id).toLowerCase();

      const nameB =
        this._getEntityName(b.entity_id).toLowerCase();

      return nameA.localeCompare(nameB);
    });

    const boxesHtml = entities
      .map((entity) => {

        const entityId = entity.entity_id;

        const data = this._getState(entityId);

        const name =
          this._getEntityName(entityId);

        const icon =
          this._getEntityIcon(entityId);

        const color =
          this._getIconColor(entityId);

        return `
          <div class="box">

            <div class="label">
              ${name}
            </div>

            <div class="value">

              <ha-icon
                icon="${icon}"
                style="color: ${color}; margin-right: 6px;"
              ></ha-icon>

              <span>${data.state}</span>

              <span class="unit">
                ${data.unit}
              </span>

            </div>

          </div>
        `;

      })
      .join("");

    const content =
      boxesHtml ||
      `
        <div class="empty">
          Aucune entité trouvée dans cette pièce.
        </div>
      `;

    let container =
      this.shadowRoot.querySelector(".card");

    if (!container) {

      container =
        document.createElement("div");

      container.className = "card";

      this.shadowRoot.appendChild(container);
    }

    container.innerHTML = `

      <div class="header">

        <div class="title">
          ${areaId}
        </div>

        <div class="icon">
          <ha-icon
            icon="mdi:home-thermometer"
          ></ha-icon>
        </div>

      </div>

      <div class="grid">
        ${content}
      </div>

    `;
  }

  // ==========================================================
  // MESSAGE
  // ==========================================================

  _renderMessage(message) {

    let container =
      this.shadowRoot.querySelector(".card");

    if (!container) {

      container =
        document.createElement("div");

      container.className = "card";

      this.shadowRoot.appendChild(container);
    }

    container.innerHTML = `

      <div class="header">

        <div class="title">
          Chauffage
        </div>

        <div class="icon">
          <ha-icon
            icon="mdi:home-thermometer"
          ></ha-icon>
        </div>

      </div>

      <div class="empty">
        ${message}
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
// ENREGISTREMENT
// ==============================================================

if (!customElements.get("systeme-chauffage-card")) {

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
    (card) =>
      card.type === "systeme-chauffage-card"
  )
) {

  window.customCards.push({

    type: "systeme-chauffage-card",

    name: "Système de chauffage",

    description:
      "Affiche automatiquement les entités d'une pièce",

    preview: true,

  });
}
