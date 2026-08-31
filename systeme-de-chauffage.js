/*
 * ==========================================================
 * SYSTEME DE CHAUFFAGE
 * TEST : RECUPERATION D'UNE ENTITE
 * ==========================================================
 */


class SystemeChauffageCard extends HTMLElement {


  // ========================================================
  // CONSTRUCTEUR
  // ========================================================

  constructor() {

    super();

    this.attachShadow({ mode: "open" });


    // ------------------------------------------------------
    // HTML
    // ------------------------------------------------------

    this.shadowRoot.innerHTML = `

      <style>

        :host {
          display: block;
        }

        .card {

          background: #1c1c1c;

          border: 1px solid #333;

          border-radius: 12px;

          padding: 16px;

          color: white;

        }

        .header {

          display: flex;

          align-items: center;

          justify-content: space-between;

        }

        .title {

          font-size: 18px;

        }

        ha-icon {

          --mdc-icon-size: 28px;

          color: #ff9800;

        }

        .box {

          background: #242424;

          border-radius: 10px;

          padding: 12px;

          margin-top: 12px;

        }

        .label {

          color: #999;

          font-size: 13px;

        }

        .value {

          font-size: 22px;

          margin-top: 6px;

        }

      </style>


      <div class="card">


        <div class="header">

          <div class="title">
            Chauffage
          </div>

          <ha-icon icon="mdi:fire"></ha-icon>

        </div>


        <div class="box">

          <div class="label">
            Entité sélectionnée
          </div>

          <div class="value entity-id">
            --
          </div>

        </div>


        <div class="box">

          <div class="label">
            Valeur
          </div>

          <div class="value temperature">
            --
          </div>

        </div>


      </div>

    `;


    // ------------------------------------------------------
    // ELEMENTS HTML
    // ------------------------------------------------------

    this._title =
      this.shadowRoot.querySelector(".title");


    this._entityId =
      this.shadowRoot.querySelector(".entity-id");


    this._temperature =
      this.shadowRoot.querySelector(".temperature");

  }


  // ========================================================
  // CONFIGURATION
  // ========================================================

  setConfig(config) {

    this.config = config;

    this._render();

  }


  // ========================================================
  // DONNEES HOME ASSISTANT
  // ========================================================

  set hass(hass) {

    this._hass = hass;

    this._render();

  }


  // ========================================================
  // AFFICHAGE
  // ========================================================

  _render() {


    // ------------------------------------------------------
    // VERIFICATION
    // ------------------------------------------------------

    if (!this.config) {

      return;

    }


    if (!this._hass) {

      return;

    }


    // ------------------------------------------------------
    // TITRE
    // ------------------------------------------------------

    this._title.textContent =
      this.config.title || "Chauffage";


    // ------------------------------------------------------
    // IDENTIFIANT DE L'ENTITE
    // ------------------------------------------------------

    const entityId =
      this.config.temperature_entity;


    this._entityId.textContent =
      entityId || "Aucune entité sélectionnée";


    // ------------------------------------------------------
    // SI AUCUNE ENTITE N'EST CONFIGUREE
    // ------------------------------------------------------

    if (!entityId) {

      this._temperature.textContent =
        "Pas d'entité";

      return;

    }


    // ------------------------------------------------------
    // RECUPERATION DE L'ENTITE
    // ------------------------------------------------------

    const entity =
      this._hass.states[entityId];


    // ------------------------------------------------------
    // SI L'ENTITE N'EXISTE PAS
    // ------------------------------------------------------

    if (!entity) {

      this._temperature.textContent =
        "Entité introuvable";

      return;

    }


    // ------------------------------------------------------
    // AFFICHAGE DE LA VALEUR
    // ------------------------------------------------------

    this._temperature.textContent =
      entity.state;

  }


  // ========================================================
  // TAILLE
  // ========================================================

  getCardSize() {

    return 2;

  }


  // ========================================================
  // EDITEUR VISUEL
  // ========================================================

  static getConfigForm() {

    return {

      schema: [

        {
          name: "title",

          required: true,

          selector: {

            text: {}

          }

        },


        {
          name: "temperature_entity",

          required: true,

          selector: {

            entity: {

              filter: {

                domain: "sensor"

              }

            }

          }

        }

      ],


      computeLabel: (schema) => {

        if (schema.name === "title") {

          return "Titre";

        }


        if (
          schema.name === "temperature_entity"
        ) {

          return "Température intérieure";

        }


        return schema.name;

      }

    };

  }

}


// ==========================================================
// ENREGISTREMENT
// ==========================================================

if (
  !customElements.get("systeme-chauffage-card")
) {

  customElements.define(
    "systeme-chauffage-card",
    SystemeChauffageCard
  );

}


// ==========================================================
// DECLARATION POUR HOME ASSISTANT
// ==========================================================

window.customCards =
  window.customCards || [];


if (
  !window.customCards.some(
    card =>
      card.type === "systeme-chauffage-card"
  )
) {

  window.customCards.push({

    type: "systeme-chauffage-card",

    name: "Système de chauffage",

    description:
      "Test récupération entité",

    preview: true

  });

}
