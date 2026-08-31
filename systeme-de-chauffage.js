/*
 * ==========================================================
 * SYSTEME DE CHAUFFAGE
 * ETAPE 1 : SQUELETTE VISUEL
 * ==========================================================
 */

class SystemeChauffageCard extends HTMLElement {

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


        .card {

          background: #1c1c1c;

          border: 1px solid #333333;

          border-radius: 12px;

          padding: 16px;

          box-sizing: border-box;

          color: white;

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

          color: #ff9800;

        }


        ha-icon {

          --mdc-icon-size: 28px;

        }


        .content {

          margin-top: 15px;

          font-size: 14px;

          color: #aaaaaa;

        }

      </style>


      <!--
        =====================================================
        CARTE
        =====================================================
      -->

      <div class="card">


        <!-- EN-TETE -->

        <div class="header">


          <!-- TITRE -->

          <div class="title">
            Chauffage
          </div>


          <!-- ICONE -->

          <div class="icon">

            <ha-icon
              icon="mdi:fire">
            </ha-icon>

          </div>


        </div>


        <!-- CONTENU -->

        <div class="content">

          Système de chauffage

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
  // TAILLE DE LA CARTE
  // --------------------------------------------------------

  getCardSize() {

    return 2;

  }

}


// ----------------------------------------------------------
// ENREGISTREMENT DE LA CARTE
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
// INFORMATIONS POUR HOME ASSISTANT
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
