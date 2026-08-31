/*
 * ==========================================================
 * SYSTEME DE CHAUFFAGE
 * ETAPE 2 : VISUEL + CONFIGURATION GRAPHIQUE
 * ==========================================================
 *
 * La carte permet maintenant de choisir les entités
 * directement dans l'éditeur visuel de Home Assistant.
 *
 */


class SystemeChauffageCard extends HTMLElement {


  // ========================================================
  // CONSTRUCTEUR
  // ========================================================

  constructor() {

    super();


    // ------------------------------------------------------
    // CREATION DU SHADOW DOM
    // ------------------------------------------------------

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
           CARTE PRINCIPALE
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
               TEMPERATURE EXTERIEURE
               =============================================== -->

          <div class="box">

            <div class="label">
              Extérieur
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


    this._consigne =
      this.shadowRoot.querySelector(".consigne");


    this._exterieur =
      this.shadowRoot.querySelector(".exterieur");


    this._etat =
      this.shadowRoot.querySelector(".etat");

  }


  // ========================================================
  // CONFIGURATION DE LA CARTE
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
    // Pour l'instant, on affiche uniquement le titre.
    // Les entités seront utilisées dans une prochaine étape.
    // ------------------------------------------------------

    if (!this.config) {

      return;

    }


    this._title.textContent =
      this.config.title || "Chauffage";

  }


  // ========================================================
  // TAILLE DE LA CARTE
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
        // THERMOSTAT
        // --------------------------------------------------

        {
          name: "climate_entity",

          required: true,

          selector: {

            entity: {

              filter: {
                domain: "climate"
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
        // COEFFICIENT
        // --------------------------------------------------

        {
          name: "coefficient_entity",

          required: true,

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

          climate_entity:
            "Thermostat",

          outside_temperature_entity:
            "Température extérieure",

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
            "Capteur de température de la pièce.",

          climate_entity:
            "Thermostat utilisé pour récupérer la consigne.",

          outside_temperature_entity:
            "Capteur de température extérieure.",

          coefficient_entity:
            "Input number utilisé pour le calcul."

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
// INFORMATIONS POUR L'EDITEUR HOME ASSISTANT
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
