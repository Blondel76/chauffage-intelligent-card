/*
 * ==========================================================
 * SYSTEME DE CHAUFFAGE
 * ETAPE 3 : DONNER UNE POIGNEE AUX ELEMENTS
 * ==========================================================
 */

class SystemeChauffageCard extends HTMLElement {

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


        .card {

          background: #1c1c1c;

          border: 1px solid #333333;

          border-radius: 12px;

          padding: 16px;

          box-sizing: border-box;

          color: white;

        }


        /* EN-TETE */

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

        }


        ha-icon {

          --mdc-icon-size: 28px;

        }


        /* GRILLE */

        .grid {

          display: grid;

          grid-template-columns: 1fr 1fr;

          gap: 10px;

          margin-top: 16px;

        }


        /* BLOCS */

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

          font-weight: 400;

        }


        .unit {

          font-size: 14px;

          color: #999999;

        }

      </style>


      <!-- =================================================
           CARTE
           ================================================= -->

      <div class="card">


        <!-- EN-TETE -->

        <div class="header">

          <div class="title">
            Chauffage
          </div>

          <div class="icon">

            <ha-icon
              icon="mdi:fire">
            </ha-icon>

          </div>

        </div>


        <!-- =================================================
             GRILLE
             ================================================= -->

        <div class="grid">


          <!-- TEMPERATURE INTERIEURE -->

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


          <!-- CONSIGNE -->

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


          <!-- EXTERIEUR -->

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


          <!-- ETAT -->

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
    // ON RECUPERE NOS ELEMENTS HTML
    // ------------------------------------------------------

    this._temperature =
      this.shadowRoot.querySelector(".temperature");


    this._consigne =
      this.shadowRoot.querySelector(".consigne");


    this._exterieur =
      this.shadowRoot.querySelector(".exterieur");


    this._etat =
      this.shadowRoot.querySelector(".etat");

  }


  // --------------------------------------------------------
  // CONFIGURATION
  // --------------------------------------------------------

  setConfig(config) {

    this.config = config;

  }


  // --------------------------------------------------------
  // TAILLE
  // --------------------------------------------------------

  getCardSize() {

    return 3;

  }

}


// ----------------------------------------------------------
// ENREGISTREMENT
// ----------------------------------------------------------

if (
  !customElements.get("systeme-chauffage-card")
) {

  customElements.define(
    "systeme-chauffage-card",
    SystemeChauffageCard
  );

}


// ----------------------------------------------------------
// HOME ASSISTANT
// ----------------------------------------------------------

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
      "Système de chauffage personnalisé",

    preview: true

  });

}
