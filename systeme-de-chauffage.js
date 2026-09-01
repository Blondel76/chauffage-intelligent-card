class SystemeChauffageCard extends HTMLElement {

  constructor() {

    super();

    this.attachShadow({ mode: "open" });

    // On initialise juste le CSS ici (fixe).
    // Le HTML du contenu (les box) sera généré dynamiquement
    // dans render(), une fois qu'on a la config + les données hass.
    this._initStyles();

  }

  // ==========================================================
  // STYLES (inchangés dans leur structure, mais on utilise
  // maintenant les variables CSS de Home Assistant quand elles
  // existent, avec une valeur de secours après la virgule).
  // Ça permet à la carte de s'adapter automatiquement au thème
  // clair/sombre choisi par l'utilisateur, au lieu d'imposer
  // toujours du noir.
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
        /* Couleur par défaut (arrêté) : gris.
           On la change dynamiquement en JS selon l'état
           (voir _getIconColor). */
        color: var(--secondary-text-color, #999999);
        transition: color 0.3s ease;
      }

      ha-icon {
        --mdc-icon-size: 28px;
      }

      /* ==============================
         GRILLE
         ==============================
         auto-fit + minmax : la grille s'adapte à la largeur
         disponible (utile si la carte est placée dans une
         colonne plus large ou plus étroite du dashboard),
         au lieu d'être bloquée sur exactement 2 colonnes. */

      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
        gap: 10px;
        margin-top: 16px;
      }

      /* ==============================
         BLOC
         ============================== */

      .box {
        background: var(--secondary-background-color, #242424);
        border: 1px solid var(--divider-color, #333333);
        border-radius: 10px;
        padding: 12px;
      }

      .label {
        font-size: 13px;
        color: var(--secondary-text-color, #999999);
      }

      .value {
        margin-top: 5px;
        font-size: 22px;
        font-weight: 400;
        /* transition douce quand une valeur change,
           plutôt qu'un changement brutal */
        transition: opacity 0.2s ease;
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
  // Appelé une fois par Home Assistant quand la carte est créée
  // (depuis le YAML/UI du dashboard). C'est ici qu'on définit
  // quelles entités HA alimentent chaque box.
  //
  // Exemple de configuration attendue dans le dashboard :
  //
  // type: custom:systeme-chauffage-card
  // entity_temp_ext: sensor.temperature_exterieure
  // entity_temp_int: sensor.temperature_interieure
  // entity_consigne: climate.chauffage
  // entity_etat: climate.chauffage
  //
  // Tu peux ajouter d'autres clés (entity_temps_chauffe,
  // entity_heure_anticipe, etc.) au fur et à mesure.
  // ==========================================================
  setConfig(config) {

    // Validation minimale : on vérifie qu'au moins une entité
    // essentielle est fournie, sinon on lève une erreur claire.
    // HA affichera automatiquement un message d'erreur dans la
    // carte plutôt qu'un écran blanc silencieux.
    if (!config.entity_temp_ext) {
      throw new Error(
        "systeme-chauffage-card : vous devez définir 'entity_temp_ext' dans la configuration."
      );
    }

    // On définit ici la liste des box à afficher, avec :
    // - label     : le texte affiché
    // - entity    : la clé de config pointant vers l'entity_id (optionnel)
    // - unit      : l'unité affichée
    // - staticKey : pour les box qui n'ont pas encore d'entité HA
    //               (on garde "--" en attendant, plutôt que de planter)
    //
    // Ça remplace les 10 blocs HTML dupliqués : on ne les décrit
    // qu'une fois, ici, et render() se charge de les générer.
    this._boxes = [
      { label: "Température extérieur",     entity: config.entity_temp_ext,        unit: "°C" },
      { label: "Température intérieure",    entity: config.entity_temp_int,        unit: "°C" },
      { label: "Consigne",                  entity: config.entity_consigne,        unit: "°C" },
      { label: "Temps de chauffe",          entity: config.entity_temps_chauffe,   unit: "Min" },
      { label: "Heure anticipé",            entity: config.entity_heure_anticipee, unit: "H" },
      { label: "Heure planning précédent",  entity: config.entity_heure_precedent, unit: "H" },
      { label: "Heure planning",            entity: config.entity_heure_planning,  unit: "H" },
      { label: "Planning en cours",         entity: config.entity_planning,        unit: "" },
      { label: "Coefficient",               entity: config.entity_coefficient,     unit: "Min/°C" },
      { label: "Dérive",                    entity: config.entity_derive,          unit: "°C/Min" },
    ];

    this.config = config;

    // Si hass est déjà disponible (rechargement de carte par ex.),
    // on peut render tout de suite. Sinon on attend le setter hass.
    if (this._hass) {
      this.render();
    }

  }

  // ==========================================================
  // HASS SETTER — le cœur de la connexion à Home Assistant
  // ==========================================================
  // Home Assistant appelle ce setter automatiquement à CHAQUE
  // mise à jour d'état, plusieurs fois par minute en général.
  // C'est ici (et seulement ici) qu'on doit lire les valeurs
  // réelles des entités et rafraîchir l'affichage.
  set hass(hass) {

    this._hass = hass;

    // setConfig() peut être appelé avant que hass n'existe la
    // première fois : on ne render que si la config est prête.
    if (this.config) {
      this.render();
    }

  }

  // Getter correspondant, requis par HA pour lire l'état courant.
  get hass() {
    return this._hass;
  }

  // ==========================================================
  // RÉCUPÉRATION D'UNE VALEUR D'ÉTAT
  // ==========================================================
  // Petite fonction utilitaire : va chercher l'état d'une entité
  // dans hass.states, et renvoie "--" si l'entité n'est pas
  // configurée ou n'existe pas (évite les erreurs JS en pleine
  // figure si une entité est mal orthographiée).
  _getState(entityId) {

    if (!entityId) return "--";

    const stateObj = this._hass.states[entityId];

    if (!stateObj) return "--";

    return stateObj.state;

  }

  // ==========================================================
  // COULEUR DE L'ICÔNE SELON L'ÉTAT
  // ==========================================================
  // Exemple simple : si l'entité d'état contient "heat" ou "on",
  // on colore la flamme en orange, sinon en gris.
  // À adapter selon les vrais états de ton entité climate/switch.
  _getIconColor() {

    const etat = this._getState(this.config.entity_etat);

    if (etat === "heat" || etat === "on") {
      return "#ff9800"; // orange : ça chauffe
    }

    return "var(--secondary-text-color, #999999)"; // gris : arrêté

  }

  // ==========================================================
  // RENDU
  // ==========================================================
  // Reconstruit le contenu de la carte (hors <style>, déjà posé
  // une fois dans le constructeur) à partir de this._boxes et
  // des valeurs actuelles de hass.
  render() {

    const etat = this._getState(this.config.entity_etat);
    const iconColor = this._getIconColor();

    // On génère le HTML des box à partir du tableau this._boxes,
    // au lieu de dupliquer 10 fois le même bloc à la main.
    const boxesHtml = this._boxes
      .map((box) => {

        const value = this._getState(box.entity);

        return `
          <div class="box">
            <div class="label">${box.label}</div>
            <div class="value">
              <span>${value}</span>
              <span class="unit">${box.unit}</span>
            </div>
          </div>
        `;

      })
      .join("");

    // On ajoute la box "État" séparément car son contenu est
    // du texte (Arrêté / Chauffe...) et non une valeur + unité.
    const etatHtml = `
      <div class="box">
        <div class="label">État</div>
        <div class="value">${etat === "--" ? "Arrêté" : etat}</div>
      </div>
    `;

    // On ne remplace QUE le contenu (pas le <style> déjà présent),
    // pour éviter de recréer inutilement les balises de style à
    // chaque mise à jour hass (plusieurs fois par minute).
    let container = this.shadowRoot.querySelector(".card");

    if (!container) {
      container = document.createElement("div");
      container.className = "card";
      this.shadowRoot.appendChild(container);
    }

    container.innerHTML = `

      <div class="header">
        <div class="title">Chauffage</div>
        <div class="icon" style="color: ${iconColor};">
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
  // TAILLE (utilisée par HA pour le placement dans les dashboards
  // en grille type "masonry")
  // ==========================================================
  getCardSize() {
    return 4;
  }

}

// ----------------------------------------------------------
// ENREGISTREMENT DU CUSTOM ELEMENT
// ----------------------------------------------------------

if (!customElements.get("systeme-chauffage-card")) {

  customElements.define(
    "systeme-chauffage-card",
    SystemeChauffageCard
  );

}

// ----------------------------------------------------------
// DÉCLARATION AUPRÈS DE HOME ASSISTANT
// (pour qu'elle apparaisse dans le sélecteur de cartes de l'UI)
// ----------------------------------------------------------

window.customCards = window.customCards || [];

if (
  !window.customCards.some(
    (card) => card.type === "systeme-chauffage-card"
  )
) {

  window.customCards.push({
    type: "systeme-chauffage-card",
    name: "Système de chauffage",
    description: "Système de chauffage personnalisé",
    preview: true,
  });

}
