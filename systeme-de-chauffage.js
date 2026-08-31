/*
 * ==========================================================
 * SYSTEME DE CHAUFFAGE
 * ETAPE 4 : TEMPERATURE INTERIEURE + EXTERIEURE
 * ==========================================================
 *
 * Les deux entités sont choisies dans l'interface graphique.
 *
 * temperature_entity
 * outside_temperature_entity
 *
 */


class SystemeChauffageCard extends HTMLElement {


  // ========================================================
  // CONSTRUCTEUR
  // ========================================================

  constructor() {

    super();

    this.attachShadow({ mode: "open" });


    // ------------------------------------------------------
    // HTML + CSS
    // ------------------------------------------------------

    this.shadowRoot.innerHTML = `

      <style>

        :host {
          display: block;
        }


        /* ==================================================
           CARTE
           ================================================== */

        .card {

          background: #1c1c1c;

          border: 1px solid #333333;

          border-radius: 12px;

          padding: 16px;

          box-sizing: border-box;

          color: white;

        }


        /* ==================================================
           EN-TETE
           ================================================== */

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

          color: #ff9800;

          display: flex;

          align-items: center;

        }


        ha-icon {

          --mdc-icon-size: 28px;

        }


        /* ==================================================
           GRILLE
           ================================================== */

        .grid {

          display: grid;

          grid-template-columns: 1fr 1fr;

          gap: 10px;

          margin-top: 16px;

        }


        /* ==================================================
           BLOCS
           ================================================== */

        .box {

          background: #242424;

          border: 1px solid #333333;

          border-radius: 10px;

          padding: 12px;

        }


        .label {

          font-size: 13px;

          color: #999999;

        }


        .value {

          margin-top: 5px;

          font-size: 22px;

        }


        .unit {

          font-size: 14px;

          color: #999999;

        }

      </style>


      <!-- ==================================================
           CARTE
           ================================================== -->

      <div class="card">


        <!-- =================================================
             EN-TETE
             ================================================= -->

        <div class="header">


          <div class="title">
            Chauffage
          </div>


          <div class="icon">

            <ha-icon icon="mdi:fire"></ha-icon>

          </div>


        </div>


        <!-- =================================================
             GRILLE
             ================================================= -->

        <div class="grid">


          <!-- ===============================================
               TEMPERATURE INTERIEURE
               =============================================== -->

          <div class="box">

            <div class="label">
              Température intérieure
            </div>


            <div class="value">

              <span class="temperature">
                --
              </span>


              <span class="unit">
                °C
              </span>

            </div>

          </div>


          <!-- ===============================================
               TEMPERATURE EXTERIEURE
               =============================================== -->

          <div class="box">

            <div class="label">
              Température extérieure
            </div>


            <div class="value">

              <span class="exterieur">
                --
              </span>


              <span class="unit">
                °C
              </span>

            </div>

          </div>


          <!-- ===============================================
               CONSIGNE
               =============================================== -->

          <div class="box">

            <div class="label">
              Consigne
            </div>


            <div class="value">

              <span class="consigne">
                --
              </span>


              <span class="unit">
                °C
              </span>

            </div>

          </div>


          <!-- ===============================================
               ETAT
               =============================================== -->

          <div class="box">

            <div class="label">
              État
            </div>


            <div class="value">

              <span class="etat">
                Arrêté
              </span>

            </div>

          </div>


        </div>

      </div>

    `;


    // ------------------------------------------------------
    // POIGNEES VERS LES ELEMENTS HTML
    // ------------------------------------------------------

    this._title =
      this.shadowRoot.querySelector(".title");


    this._temperature =
      this.shadowRoot.querySelector(".temperature");


    this._exterieur =
      this.shadowRoot.querySelector(".exterieur");


    this._consigne =
      this.shadowRoot.querySelector(".consigne");


    this._etat =
      this.shadowRoot.querySelector(".etat");

  }


  // ========================================================
  // CONFIGURATION
  // ========================================================

  setConfig(config) {

    this.config = config;

    this._render();

  }


  // ========================================================
  // DONNEES DE HOME ASSISTANT
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


    // ======================================================
    // TEMPERATURE INTERIEURE
    // ======================================================

    const temperatureEntityId =
      this.config.temperature_entity;


    if (!temperatureEntityId) {

      this._temperature.textContent =
        "--";

    } else {

      const temperatureEntity =
        this._hass.states[
          temperatureEntityId
        ];


      if (!temperatureEntity) {

        this._temperature.textContent =
          "Erreur";

      } else {

        this._temperature.textContent =
          temperatureEntity.state;

      }

    }


    // ======================================================
    // TEMPERATURE EXTERIEURE
    // ======================================================

    const outsideEntityId =
      this.config.outside_temperature_entity;


    if (!outsideEntityId) {

      this._exterieur.textContent =
        "--";

    } else {

      const outsideEntity =
        this._hass.states[
          outsideEntityId
        ];


      if (!outsideEntity) {

        this._exterieur.textContent =
          "Erreur";

      } else {

        this._exterieur.textContent =
          outsideEntity.state;

      }

    }

  }


  // ========================================================
  // TAILLE
  // ========================================================

  getCardSize() {

    return 3;

  }


  // ========================================================
  // EDITEUR VISUEL HOME ASSISTANT
  // ========================================================

  static getConfigForm() {

    return {

      schema: [


        // --------------------------------------------------
        // TITRE
        // --------------------------------------------------

        {
          name: "title",

          required: true,

          selector: {

            text: {}

          }

        },


        // --------------------------------------------------
        // TEMPERATURE INTERIEURE
        // --------------------------------------------------

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

        },


        // --------------------------------------------------
        // TEMPERATURE EXTERIEURE
        // --------------------------------------------------

        {
          name: "outside_temperature_entity",

          required: true,

          selector: {

            entity: {

              filter: {

                domain: "sensor"

              }

            }

          }

        },


        // --------------------------------------------------
        // THERMOSTAT
        // --------------------------------------------------

        {
          name: "climate_entity",

          required: false,

          selector: {

            entity: {

              filter: {

                domain: "climate"

              }

            }

          }

        },


        // --------------------------------------------------
        // COEFFICIENT
        // --------------------------------------------------

        {
          name: "coefficient_entity",

          required: false,

          selector: {

            entity: {

              filter: {

                domain: "input_number"

              }

            }

          }

        }

      ],


      // ====================================================
      // LABELS
      // ====================================================

      computeLabel: (schema) => {

        const labels = {

          title:
            "Titre",

          temperature_entity:
            "Température intérieure",

          outside_temperature_entity:
            "Température extérieure",

          climate_entity:
            "Thermostat",

          coefficient_entity:
            "Coefficient"

        };


        return labels[schema.name];

      },


      // ====================================================
      // AIDES
      // ====================================================

      computeHelper: (schema) => {

        const helpers = {

          title:
            "Titre affiché en haut de la carte.",

          temperature_entity:
            "Capteur de température intérieure.",

          outside_temperature_entity:
            "Capteur de température extérieure.",

          climate_entity:
            "Thermostat du système de chauffage.",

          coefficient_entity:
            "Coefficient utilisé pour les calculs."

        };


        return helpers[schema.name];

      }

    };

  }

}


// ==========================================================
// ENREGISTREMENT DE LA CARTE
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
// INFORMATIONS POUR HOME ASSISTANT
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
      "Système de chauffage personnalisé.",

    preview: true

  });

}
