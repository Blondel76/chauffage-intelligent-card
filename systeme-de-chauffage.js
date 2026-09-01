/*
 * ==========================================================
 * SYSTEME DE CHAUFFAGE
 * ETAPE 2 : CREER LES ZONES DU VISUEL
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


        /* ==============================
           EN-TETE
           ============================== */

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


        /* ==============================
           GRILLE
           ============================== */

        .grid {

          display: grid;
          
          /*nombre de colonnes dans la grille 1fr 1fr (2colonnes), 1fr 1fr 1fr (3colonne), 1fr 2fr 1fr (3colonne mais la colonne du milieu plus large)*/ 
          grid-template-columns: 1fr 1fr;

          /* espace entre les colonne*/
          gap: 10px;

          /* ajoute 16 px de marge au-dessus de la grille */
          margin-top: 16px;

        }


        /* ==============================
           BLOC
           ============================== */

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


        <!-- ==========================
             EN-TETE
             ========================== -->

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


        <!-- ==========================
             GRILLE
             ========================== -->

        <div class="grid">


          <!-- TEMPERATURE EXTÉRIEUR -->

          <div class="box">

            <div class="label">
              Température extérieur
            </div>

            <div class="value">

              <span>
                --
              </span>

              <span class="unit">
                °C
              </span>

            </div>

          </div>

          

          <!-- TEMPERATURE INTERIEURE -->

          <div class="box">

            <div class="label">
              Température intérieure
            </div>

            <div class="value">

              <span>
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

              <span>
                --
              </span>

              <span class="unit">
                °C
              </span>

            </div>

          </div>


          <!-- TEMPS DE CHAUFFE -->

          <div class="box">

            <div class="label">
              Temps de chauffe
            </div>

            <div class="value">

              <span>
                --
              </span>

              <span class="unit">
                Min
              </span>

            </div>

          </div>

          <!-- HEURE ANTICIPÉ -->

          <div class="box">

            <div class="label">
              Heure anticipé
            </div>

            <div class="value">

              <span>
                --
              </span>

              <span class="unit">
                H
              </span>

            </div>

          </div>

          <!-- HEURE PLANNING PRECEDENT -->

          <div class="box">

            <div class="label">
              Heure planning précédent
            </div>

            <div class="value">

              <span>
                --
              </span>

              <span class="unit">
                H
              </span>

            </div>

          </div>

         <!-- HEURE PLANNING -->

          <div class="box">

            <div class="label">
              Heure planning
            </div>

            <div class="value">

              <span>
                --
              </span>

              <span class="unit">
                H
              </span>

            </div>

          </div>

          <!-- PLANNING EN COURS -->

          <div class="box">

            <div class="label">
             Planning en cours
            </div>

            <div class="value">

              <span>
                --
              </span>

              <span class="unit">
                
              </span>

            </div>

          </div>

          <!-- COEFFICIENT -->

          <div class="box">

            <div class="label">
              Coefficient
            </div>

            <div class="value">

              <span>
                --
              </span>

              <span class="unit">
                Min/°C
              </span>

            </div>

          </div>

          <!-- DERIVE -->

          <div class="box">

            <div class="label">
              Dérive
            </div>

            <div class="value">

              <span>
                --
              </span>

              <span class="unit">
                °C/Min
              </span>

            </div>

          </div>

          <!-- ETAT -->

          <div class="box">

            <div class="label">
              État
            </div>

            <div class="value">

              Arrêté

            </div>

          </div>


        </div>


      </div>

    `;

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
