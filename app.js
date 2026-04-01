// Configuration initiale des 3 chantiers demandés
const defaultChantiers = [
    { id: 'antibes', name: 'Chantier Antibes', dateDebut: '', dateFin: '', avancement: 0, imprevus: '', effectifs: '', materiel: '', commandes: '' },
    { id: 'st-laurent', name: 'Chantier Saint-Laurent', dateDebut: '', dateFin: '', avancement: 0, imprevus: '', effectifs: '', materiel: '', commandes: '' },
    { id: 'nice', name: 'Chantier Nice', dateDebut: '', dateFin: '', avancement: 0, imprevus: '', effectifs: '', materiel: '', commandes: '' }
];

// Variables d'états
let chantiersData = [];
let githubToken = localStorage.getItem('coordinateur_github_token') || '';
let githubGistId = localStorage.getItem('coordinateur_github_gist_id') || '';

// Initialisation au lancement de la page
document.addEventListener('DOMContentLoaded', async () => {
    // Initialise l'interface avant de potentiellement charger depuis internet
    setupTabs();
    setupAddChantier();
    setupCloudSettings();

    // Charger les données (Local, puis Cloud si configuré)
    await loadData();
    
    // Affichage des données récupérées
    renderChantiers();
    renderEffectifs();
});

// Chargement des données (Local + Cloud Sync)
async function loadData() {
    // 1. Chargement instantané depuis le cache local (localStorage)
    const savedChantiers = localStorage.getItem('coordinateur_chantiers');
    if (savedChantiers) {
        parseAndApplyData(savedChantiers);
    } else {
        chantiersData = JSON.parse(JSON.stringify(defaultChantiers)); // Deep copy par défaut
    }

    // 2. Si un token est présent, tentative de récupération depuis GitHub
    if (githubToken && githubGistId) {
        updateCloudStatus('syncing', 'Synchro...');
        try {
            const response = await fetch(`https://api.github.com/gists/${githubGistId}`, {
                method: 'GET',
                headers: {
                    'Authorization': `token ${githubToken}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });
            
            if (response.ok) {
                const gist = await response.json();
                const content = gist.files['chantiers.json']?.content;
                if (content && content !== savedChantiers) {
                    // Si on a récupéré une donnée de GitHub différente, on l'applique
                    parseAndApplyData(content);
                    localStorage.setItem('coordinateur_chantiers', JSON.stringify(chantiersData));
                    
                    // On re-render car les données viennent de changer
                    renderChantiers();
                    renderEffectifs();
                    showToast("☁️ Données synchronisées depuis GitHub");
                }
                updateCloudStatus('online', 'En ligne');
            } else {
                console.error('Erreur Sync GitHub:', response.status);
                updateCloudStatus('offline', 'Erreur Sync');
            }
        } catch (error) {
            console.error('Network Error:', error);
            updateCloudStatus('offline', 'Hors ligne');
        }
    } else {
        updateCloudStatus('offline', 'Local');
    }
}

function parseAndApplyData(jsonString) {
    chantiersData = JSON.parse(jsonString);
    chantiersData.forEach(chantier => {
        if(chantier.effectifs === undefined) chantier.effectifs = '';
        if(chantier.materiel === undefined) chantier.materiel = '';
        if(chantier.commandes === undefined) chantier.commandes = '';
        if (chantier.name === "Chantier St Laurent" || chantier.name === "Chantier St Lauren") {
            chantier.name = "Chantier Saint-Laurent";
        }
    });
}

// Fonction pour sauvegarder les données
function saveData() {
    localStorage.setItem('coordinateur_chantiers', JSON.stringify(chantiersData));
    showToast("💾 Modifications sauvegardées automatiquement");
    
    // Si GitHub est configuré, déclencher la sauvegarde distante
    if (githubToken) {
        debounceGitHubSave();
    }
}

// Technique de 'debounce' (anti-rebond) Local (700ms)
let timeoutId;
function debounceSave() {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(saveData, 700);
}

// Technique de 'debounce' Cloud (3 secondes pour éviter de spammer l'API)
let githubTimeoutId;
function debounceGitHubSave() {
    clearTimeout(githubTimeoutId);
    updateCloudStatus('syncing', 'En attente...');
    githubTimeoutId = setTimeout(saveToGitHub, 3000);
}

async function saveToGitHub() {
    if (!githubToken) return;
    
    updateCloudStatus('syncing', 'Sauvegarde...');
    const contentToSave = JSON.stringify(chantiersData, null, 2);
    
    try {
        let url = 'https://api.github.com/gists';
        let method = 'POST';
        
        if (githubGistId) {
            url = `https://api.github.com/gists/${githubGistId}`;
            method = 'PATCH';
        }
        
        const response = await fetch(url, {
            method: method,
            headers: {
                'Authorization': `token ${githubToken}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                description: 'Sauvegarde Coordinateur de Travaux',
                files: {
                    'chantiers.json': {
                        content: contentToSave
                    }
                }
            })
        });
        
        if (response.ok) {
            const data = await response.json();
            if (!githubGistId) {
                // S'il vient d'être créé, sauvegarder son ID
                githubGistId = data.id;
                localStorage.setItem('coordinateur_github_gist_id', githubGistId);
                const gistInput = document.getElementById('github-gist-id');
                if(gistInput) gistInput.value = githubGistId;
            }
            updateCloudStatus('online', 'En ligne');
        } else {
            console.error('Fail to save on Github');
            updateCloudStatus('offline', 'Erreur Save');
        }
    } catch (e) {
        updateCloudStatus('offline', 'Hors ligne');
    }
}

function updateCloudStatus(status, text) {
    const statusEl = document.getElementById('cloud-status');
    const textEl = statusEl?.querySelector('.cloud-text');
    if (!statusEl || !textEl) return;
    
    statusEl.className = `cloud-status ${status}`;
    textEl.innerText = text;
}

// Configuration de l'interface des paramètres Cloud
function setupCloudSettings() {
    const tokenInput = document.getElementById('github-token');
    const gistInput = document.getElementById('github-gist-id');
    const btnSave = document.getElementById('btn-save-github-config');
    const btnForce = document.getElementById('btn-force-sync');
    
    if (tokenInput) tokenInput.value = githubToken;
    if (gistInput) gistInput.value = githubGistId;
    
    if (btnSave) {
        btnSave.addEventListener('click', () => {
            githubToken = tokenInput.value.trim();
            githubGistId = gistInput.value.trim();
            
            localStorage.setItem('coordinateur_github_token', githubToken);
            localStorage.setItem('coordinateur_github_gist_id', githubGistId);
            
            showToast("✅ Configuration Cloud sauvegardée");
            if (githubToken) {
                saveToGitHub();
            } else {
                updateCloudStatus('offline', 'Local');
            }
        });
    }
    
    if (btnForce) {
        btnForce.addEventListener('click', () => {
            if (!githubToken) {
                alert("Veuillez d'abord configurer votre Personal Access Token.");
                return;
            }
            saveToGitHub();
        });
    }
}

// Logique pour ajouter un nouveau chantier dynamiquement (Onglet C)
function setupAddChantier() {
    const btnSubmit = document.getElementById('btn-submit-nouveau');
    if (btnSubmit) {
        btnSubmit.addEventListener('click', () => {
            const input = document.getElementById('new-chantier-name');
            const nomChantier = input.value.trim();
            if (nomChantier !== '') {
                // Si on a tapé "Monaco", ça écrira "Chantier Monaco", si on a tapé "Chantier X", ça gardera
                const finalName = nomChantier.toLowerCase().startsWith("chantier") ? nomChantier : "Chantier " + nomChantier;

                const newChantier = {
                    id: 'chantier-' + Date.now(),
                    name: finalName,
                    dateDebut: '',
                    dateFin: '',
                    avancement: 0,
                    imprevus: '',
                    effectifs: '',
                    materiel: '',
                    commandes: ''
                };
                chantiersData.push(newChantier);
                saveData(); 
                renderChantiers();
                renderEffectifs();
                
                // Vider l'input et repasser à l'onglet A
                input.value = '';
                document.querySelector('.tab-btn[data-tab="chantiers"]').click();
                showToast("✅ " + finalName + " créé avec succès !");
            } else {
                alert("Veuillez entrer un nom pour le chantier.");
            }
        });
    }
}

// Logique pour supprimer un chantier existant
window.removeChantier = function(index) {
    if (confirm("Êtes-vous sûr de vouloir supprimer ce chantier ? Cette action est irréversible.")) {
        chantiersData.splice(index, 1);
        saveData();
        renderChantiers();
        renderEffectifs();
    }
};

// Génération de l'interface des chantiers (Onglet A)
function renderChantiers() {
    const container = document.getElementById('chantiers-container');
    container.innerHTML = ''; // Nettoyer le conteneur

    // Créer une carte pour chaque chantier
    chantiersData.forEach((chantier, index) => {
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `
            <div class="card-header">
                <h2 class="chantier-title-input" contenteditable="true" data-index="${index}" data-field="name" title="Modifier le nom">${chantier.name}</h2>
                <button class="btn-delete" title="Supprimer ce chantier" onclick="removeChantier(${index})">&times;</button>
            </div>
            
            <div class="form-group">
                <label>Date de début des travaux</label>
                <input type="date" class="input-field" value="${chantier.dateDebut}" data-index="${index}" data-field="dateDebut">
            </div>
            
            <div class="form-group">
                <label>Date de fin des travaux</label>
                <input type="date" class="input-field" value="${chantier.dateFin}" data-index="${index}" data-field="dateFin">
            </div>
            
            <div class="form-group">
                <label>Pourcentage d'avancement</label>
                <div class="range-container">
                    <input type="range" min="0" max="100" value="${chantier.avancement}" class="input-field" data-index="${index}" data-field="avancement">
                    <span class="range-val" id="val-${index}">${chantier.avancement}%</span>
                </div>
            </div>
            
            <div class="form-group">
                <label>Imprévus</label>
                <textarea class="input-field" placeholder="Ex: Fuite d'eau découverte, retard de livraison peinture..." data-index="${index}" data-field="imprevus">${chantier.imprevus}</textarea>
            </div>
        `;
        container.appendChild(card);
    });

    attachChantiersListeners(container);
}

// Génération de l'interface des effectifs (Onglet B)
function renderEffectifs() {
    const container = document.getElementById('effectifs-container');
    container.innerHTML = '';

    chantiersData.forEach((chantier, index) => {
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `
            <div class="card-header">
                <h2 class="chantier-title-input" contenteditable="true" data-index="${index}" data-field="name" title="Modifier le nom">${chantier.name}</h2>
            </div>
            
            <div class="form-group">
                <label>Effectifs et Artisans assignés</label>
                <textarea class="input-field" placeholder="Ex: 2 peintres, 1 chef d'équipe..." data-index="${index}" data-field="effectifs">${chantier.effectifs}</textarea>
            </div>
            
            <div class="form-group">
                <label>Matériel requis</label>
                <textarea class="input-field" placeholder="Ex: 50L peinture blanche, 3 échafaudages, bâches..." data-index="${index}" data-field="materiel">${chantier.materiel}</textarea>
            </div>
            
            <div class="form-group">
                <label>Commandes en cours</label>
                <textarea class="input-field" placeholder="Ex: fournisseur Seigneurie Gauthier en attente..." data-index="${index}" data-field="commandes">${chantier.commandes}</textarea>
            </div>
        `;
        container.appendChild(card);
    });

    attachChantiersListeners(container);
}

// Ajouter les écouteurs d'événements (mise à jour + sauvegarde sur chaque input)
function attachChantiersListeners(container) {
    const titles = container.querySelectorAll('.chantier-title-input');
    const inputs = container.querySelectorAll('.input-field');
    
    // Logique spécifique pour les titres éditables (H2)
    titles.forEach(title => {
        // Enregistrer la modification lorsqu'on clique ailleurs (blur)
        title.addEventListener('blur', (e) => {
             const index = e.target.getAttribute('data-index');
             chantiersData[index].name = e.target.innerText.trim();
             saveData();
             renderChantiers();
             renderEffectifs();
        });
        
        // Empêcher le retour à la ligne si on appuie sur Entrée (validation)
        title.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                e.target.blur(); // Déclenche la sauvegarde
            }
        });
    });

    // Logique pour les autres inputs
    inputs.forEach(input => {
        input.addEventListener('input', (e) => {
            const index = e.target.getAttribute('data-index');
            const field = e.target.getAttribute('data-field');
            const value = e.target.value;

            // Mettre à jour l'état
            chantiersData[index][field] = value;
            
            // Mise à jour visuelle du pourcentage en temps réel si applicable
            if (field === 'avancement') {
                const valEl = document.getElementById(`val-${index}`);
                if(valEl) valEl.innerText = `${value}%`;
            }

            // Déclencher la sauvegarde
            debounceSave();
        });
    });
}

// Logique pour naviguer entre les onglets
function setupTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Retirer l'état actif de tout le monde
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            // Ajouter l'état actif sur le bouton cliqué et son contenu
            btn.classList.add('active');
            const targetId = btn.getAttribute('data-tab');
            document.getElementById(targetId).classList.add('active');
        });
    });
}

// Affichage d'une petite notification élégante en bas de l'écran (Toast)
function showToast(message) {
    let toast = document.getElementById('toast-notification');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast-notification';
        toast.className = 'toast';
        document.body.appendChild(toast);
    }
    toast.innerText = message;
    
    // Forcer le reflow
    void toast.offsetWidth;
    
    toast.classList.add('show');

    // Cacher après 2 secondes
    setTimeout(() => {
        toast.classList.remove('show');
    }, 2000);
}
