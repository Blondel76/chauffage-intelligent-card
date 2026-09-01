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

    `;

    this.shadowRoot.appendChild(style);
  }


  // ==========================================================
  // CONFIGURATION
  // ==========================================================

  setConfig(config) {

    const missing = SystemeChauffageCard.FIELDS
      .filter((field) => field.required && !config[field.key])
      .map((field) => field.key);

    if (missing.length > 0) {
      throw new Error(
        `systeme-chauffage-card : entité(s) obligatoire(s) manquante(s) : ${missing.join(", ")}`
      );
    }

    this.config = config;

    this._boxes = SystemeChauffageCard.FIELDS
      .filter((field) => !field.isState)
      .map((field) => ({
        label: field.label,
        entity: config[field.key],
        unit: field.unit,
        attribute: field.attribute,
      }));

    if (this._hass) {
      this.render();
    }
  }


  // ==========================================================
  // ÉDITEUR
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
  // LECTURE D'UNE ENTITÉ
  // ==========================================================

  _getState(entityId, attribute) {

    if (!entityId || !this._hass) {
      return "--";
    }

    const stateObj = this._hass.states[entityId];

    if (!stateObj) {
      return "--";
    }

    if (attribute) {

      const value = stateObj.attributes
        ? stateObj.attributes[attribute]
        : undefined;

      if (value === undefined || value === null) {
        return "--";
      }

      return value;
    }

    return stateObj.state;
  }


  // ==========================================================
  // COULEUR DE L'ICÔNE
  // ==========================================================

  _getIconColor() {

    const etat = this._getState(
      this.config.entity_etat
    );

    if (
      etat === "heat" ||
      etat === "on"
    ) {
      return "#ff9800";
    }

    return "var(--secondary-text-color, #999999)";
  }


  // ==========================================================
  // AFFICHAGE
  // ==========================================================

  render() {

    if (!this._hass || !this.config) {
      return;
    }

    const iconColor = this._getIconColor();

    const boxesHtml = this._boxes
      .map((box) => {

        const value = this._getState(
          box.entity,
          box.attribute
        );

        return `
          <div class="box">

            <div class="label">
              ${box.label}
            </div>

            <div class="value">
              <span>${value}</span>
              <span class="unit">${box.unit}</span>
            </div>

          </div>
        `;
      })
      .join("");


    // État du chauffage

    const etat = this._getState(
      this.config.entity_etat
    );

    const etatAffiche =
      etat === "--"
        ? "Indisponible"
        : etat;


    const etatHtml = `

      <div class="box">

        <div class="label">
          État
        </div>

        <div class="value">
          ${etatAffiche}
        </div>

      </div>

    `;


    let container =
      this.shadowRoot.querySelector(".card");


    if (!container) {

      container = document.createElement("div");

      container.className = "card";

      this.shadowRoot.appendChild(container);
    }


    container.innerHTML = `

      <div class="header">

        <div class="title">
          Chauffage
        </div>

        <div
          class="icon"
          style="color: ${iconColor};"
        >
          <ha-icon icon="mdi:fire"></ha-icon>
        </div>

      </div>


      <div class="grid">

        ${boxesHtml}

        ${etatHtml}

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
// ENTITÉS DE LA PIÈCE
// ==============================================================

SystemeChauffageCard.FIELDS = [

  {
    key: "entity_temp_ext",
    label: "Température extérieure",
    unit: "°C",
    required: true,
    domain: "sensor"
  },

  {
    key: "entity_temp_int",
    label: "Température intérieure",
    unit: "°C",
    required: true,
    domain: "sensor"
  },

  {
    key: "entity_consigne",
    label: "Consigne",
    unit: "°C",
    required: true,
    domain: "climate",
    attribute: "temperature"
  },

  {
    key: "entity_coefficient",
    label: "Coefficient",
    unit: "",
    required: true,
    domain: "input_number"
  },

  {
    key: "entity_planning",
    label: "Planning en cours",
    unit: "",
    required: true,
    domain: "input_text"
  },

  {
    key: "entity_derive",
    label: "Dérive",
    unit: "°C/Min",
    required: false
  },

  {
    key: "entity_etat",
    label: "État du chauffage",
    unit: "",
    required: true,
    domain: "climate",
    isState: true
  }

];


// ==============================================================
// ÉDITEUR GRAPHIQUE
// ==============================================================

class SystemeChauffageCardEditor extends HTMLElement {

  constructor() {

    super();

    this.attachShadow({
      mode: "open"
    });

  }


  setConfig(config) {

    this._config = config || {};

    if (!this._built) {
      this._buildForm();
    }

    this._updatePickers();
  }


  set hass(hass) {

    this._hass = hass;

    if (this._built) {
      this._updatePickers();
    }

  }


  get hass() {
    return this._hass;
  }


  // ==========================================================
  // FORMULAIRE
  // ==========================================================

  _buildForm() {

    this.shadowRoot.innerHTML = `

      <style>

        .grid {

          display: grid;

          grid-template-columns:
            repeat(
              auto-fit,
              minmax(220px, 1fr)
            );

          gap: 12px;

          padding:
            4px 0 12px 0;
        }


        .tile {

          background:
            var(
              --secondary-background-color,
              #242424
            );

          border:
            1px solid
            var(
              --divider-color,
              #333333
            );

          border-radius: 10px;

          padding: 10px 12px;
        }


        .tile-label {

          font-size: 13px;

          color:
            var(
              --secondary-text-color,
              #999999
            );

          margin-bottom: 6px;

          display: flex;

          align-items: center;

          gap: 4px;
        }


        .required-mark {
          color: #ff5252;
        }

      </style>


      <div class="grid">

        ${SystemeChauffageCard.FIELDS
          .map((field) => `

            <div class="tile">

              <div class="tile-label">

                ${field.label}

                ${
                  field.required
                    ? '<span class="required-mark">*</span>'
                    : ""
                }

              </div>

              <ha-entity-picker
                data-key="${field.key}">
              </ha-entity-picker>

            </div>

          `)
          .join("")}

      </div>

    `;


    const pickers =
      this.shadowRoot.querySelectorAll(
        "ha-entity-picker"
      );


    pickers.forEach((picker) => {

      const key =
        picker.dataset.key;


      picker.addEventListener(
        "value-changed",
        (ev) => {

          ev.stopPropagation();

          this._updateConfig(
            key,
            ev.detail.value
          );

        }
      );

    });


    this._built = true;
  }


  // ==========================================================
  // MISE À JOUR DES PICKERS
  // ==========================================================

  _updatePickers() {

    if (
      !this._hass ||
      !this._config
    ) {
      return;
    }


    const pickers =
      this.shadowRoot.querySelectorAll(
        "ha-entity-picker"
      );


    pickers.forEach((picker) => {

      const key =
        picker.dataset.key;


      const field =
        SystemeChauffageCard.FIELDS.find(
          (f) => f.key === key
        );


      if (!field) {
        return;
      }


      const newValue =
        this._config[key] || "";


      picker.hass =
        this._hass;


      picker.required =
        !!field.required;


      picker.label =
        field.label;


      if (field.domain) {

        picker.includeDomains = [
          field.domain
        ];

      }


      if (picker.value !== newValue) {

        picker.value =
          newValue;

      }

    });

  }


  // ==========================================================
  // CONFIG CHANGÉE
  // ==========================================================

  _updateConfig(key, value) {

    this._config = {

      ...this._config,

      [key]: value

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


// ==============================================================
// ENREGISTREMENT
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
// HOME ASSISTANT
// ==============================================================

window.customCards =
  window.customCards || [];


if (
  !window.customCards.some(
    (card) =>
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
      "Affichage des entités du système de chauffage",

    preview:
      true

  });

}
