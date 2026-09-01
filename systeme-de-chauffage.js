class SystemeChauffageCard extends HTMLElement {

  constructor() {
    super();

    this.attachShadow({ mode: "open" });

    this._hass = null;
    this.config = null;
    this._entities = [];
    this._loading = false;
    this._built = false;

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
      }

      ha-icon {
        --mdc-icon-size: 28px;
      }

      .grid {
        display: flex;
        flex-wrap: wrap;
        gap: 16px;
        margin-top: 16px;
      }

      .box {
        min-width: 120px;
        box-sizing: border-box;
      }

      .label {
        font-size: 13px;
        color: var(--secondary-text-color, #999999);
      }

      .value {
        display: flex;
        align-items: center;
        margin-top: 5px;
        font-size: 22px;
        font-weight: 400;
      }

      .unit {
        margin-left: 4px;
        font-size: 14px;
        color: var(--secondary-text-color, #999999);
      }

      .message {
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
     * La seule configuration nécessaire est :
     *
     * type: custom:systeme-chauffage-card
     * area: bureau
     *
     * Aucun entity_xxx.
     * Aucun calcul.
     * Aucun éditeur.
     */

    this.render();

    if (this._hass) {
      this._loadAreaEntities();
    }
  }


  // ==========================================================
  // HASS
  // ==========================================================

  set hass(hass) {

    this._hass = hass;

    if (!this.config) {
      return;
    }

    /*
     * On charge le registre une seule fois.
     *
     * Il ne faut surtout pas refaire une requête à chaque
     * changement d'état d'une entité.
     */

    if (!this._entities.length && !this._loading) {
      this._loadAreaEntities();
    }

    this.render();
  }


  get hass() {
    return this._hass;
  }


  // ==========================================================
  // RÉCUPÉRATION DU REGISTRE DES ENTITÉS
  // ==========================================================

  async _loadAreaEntities() {

    if (!this._hass) {
      return;
    }

    if (!this.config?.area) {
      return;
    }

    if (this._loading) {
      return;
    }

    this._loading = true;

    try {

      /*
       * Demande à Home Assistant le registre complet
       * des entités.
       */

      const entities =
        await this._hass.callWS({
          type: "config/entity_registry/list"
        });


      /*
       * On garde uniquement les entités appartenant
       * à la pièce configurée.
       */

      this._entities = entities.filter(
        (entity) =>
          entity.area_id === this.config.area
      );


      this.render();

    } catch (error) {

      console.error(
        "systeme-chauffage-card : impossible de récupérer le registre des entités",
        error
      );

      this._entities = [];

      this.render();

    } finally {

      this._loading = false;
    }
  }


  // ==========================================================
  // RÉCUPÉRATION D'UNE ENTITÉ
  // ==========================================================

  _getState(entityId) {

    const stateObj =
      this._hass?.states?.[entityId];

    if (!stateObj) {

      return {
        state: "--",
        unit: ""
      };

    }

    return {

      state: stateObj.state,

      unit:
        stateObj.attributes?.unit_of_measurement || ""

    };
  }


  // ==========================================================
  // NOM AFFICHÉ
  // ==========================================================

  _getName(entity) {

    const stateObj =
      this._hass?.states?.[entity.entity_id];

    /*
     * Le friendly_name est prioritaire.
     *
     * Si aucune valeur n'est disponible,
     * on utilise le nom original du registre.
     */

    return (
      stateObj?.attributes?.friendly_name ||
      entity.name ||
      entity.entity_id
    );
  }


  // ==========================================================
  // ICÔNE
  // ==========================================================

  _getIcon(entity) {

    const stateObj =
      this._hass?.states?.[entity.entity_id];

    if (stateObj?.attributes?.icon) {
      return stateObj.attributes.icon;
    }

    const domain =
      entity.entity_id.split(".")[0];

    switch (domain) {

      case "climate":
        return "mdi:radiator";

      case "sensor":
        return "mdi:gauge";

      case "binary_sensor":
        return "mdi:checkbox-marked-circle-outline";

      case "switch":
        return "mdi:toggle-switch";

      case "light":
        return "mdi:lightbulb";

      case "fan":
        return "mdi:fan";

      case "input_number":
        return "mdi:numeric";

      case "input_text":
        return "mdi:form-textbox";

      default:
        return "mdi:home-assistant";
    }
  }


  // ==========================================================
  // COULEUR ICÔNE
  // ==========================================================

  _getIconColor(entity) {

    const stateObj =
      this._hass?.states?.[entity.entity_id];

    if (!stateObj) {
      return "var(--secondary-text-color, #999999)";
    }

    const state =
      stateObj.state;

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

    if (!this.config) {
      return;
    }

    let container =
      this.shadowRoot.querySelector(".card");

    if (!container) {

      container =
        document.createElement("div");

      container.className = "card";

      this.shadowRoot.appendChild(container);
    }


    // --------------------------------------------------------
    // PAS DE PIÈCE
    // --------------------------------------------------------

    if (!this.config.area) {

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

        <div class="message">
          Aucune pièce configurée.
        </div>

      `;

      return;
    }


    // --------------------------------------------------------
    // ENTÊTE
    // --------------------------------------------------------

    let title =
      this.config.area;


    // --------------------------------------------------------
    // ENTITÉS
    // --------------------------------------------------------

    if (this._loading && !this._entities.length) {

      container.innerHTML = `

        <div class="header">

          <div class="title">
            ${title}
          </div>

          <div class="icon">
            <ha-icon
              icon="mdi:home-thermometer"
            ></ha-icon>
          </div>

        </div>

        <div class="message">
          Chargement des entités...
        </div>

      `;

      return;
    }


    if (!this._entities.length) {

      container.innerHTML = `

        <div class="header">

          <div class="title">
            ${title}
          </div>

          <div class="icon">
            <ha-icon
              icon="mdi:home-thermometer"
            ></ha-icon>
          </div>

        </div>

        <div class="message">
          Aucune entité trouvée dans cette pièce.
        </div>

      `;

      return;
    }


    // --------------------------------------------------------
    // TRI
    // --------------------------------------------------------

    const entities =
      [...this._entities].sort(
        (a, b) =>
          this._getName(a).localeCompare(
            this._getName(b),
            "fr",
            {
              sensitivity: "base"
            }
          )
      );


    // --------------------------------------------------------
    // BOX
    // --------------------------------------------------------

    const boxesHtml =
      entities.map((entity) => {

        const data =
          this._getState(entity.entity_id);

        const name =
          this._getName(entity);

        const icon =
          this._getIcon(entity);

        const color =
          this._getIconColor(entity);


        return `

          <div class="box">

            <div class="label">
              ${name}
            </div>

            <div class="value">

              <ha-icon
                icon="${icon}"
                style="
                  color: ${color};
                  margin-right: 6px;
                "
              ></ha-icon>

              <span>
                ${data.state}
              </span>

              ${
                data.unit
                  ? `
                    <span class="unit">
                      ${data.unit}
                    </span>
                  `
                  : ""
              }

            </div>

          </div>

        `;

      }).join("");


    // --------------------------------------------------------
    // AFFICHAGE
    // --------------------------------------------------------

    container.innerHTML = `

      <div class="header">

        <div class="title">
          ${title}
        </div>

        <div class="icon">
          <ha-icon
            icon="mdi:home-thermometer"
          ></ha-icon>
        </div>

      </div>

      <div class="grid">

        ${boxesHtml}

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
// DÉCLARATION HOME ASSISTANT
// =============================================================

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
      "Affiche automatiquement les entités d'une pièce",

    preview:
      true

  });
}
