// Networks Frontend Logic

const networksState = {
    networks: [],
    currentNetwork: null,
    userProfile: null
};

// ===== NETWORKS LISTING =====

async function loadNetworks() {
    const data = await fetch('/api/networks').then(r => r.json());
    networksState.networks = data;
    renderNetworks();
}

function renderNetworks() {
    const grid = document.getElementById('networks-grid');
    if (!grid) return;

    grid.innerHTML = '';
    networksState.networks.forEach(network => {
        const card = document.createElement('div');
        card.className = 'network-card';
        card.innerHTML = `
            <div class="network-logo">${network.logoUrl ? `<img src="${network.logoUrl}">` : network.name[0]}</div>
            <h3>${network.name}</h3>
            <p>${network.description || ''}</p>
            <div class="network-meta">
                <span>${network._count.memberships} membri</span>
                <span>${network.themes.join(', ')}</span>
            </div>
        `;
        card.addEventListener('click', () => openNetwork(network.id));
        grid.appendChild(card);
    });
}

// ===== NETWORK DETAIL =====

async function openNetwork(id) {
    const network = await fetch(`/api/networks/${id}`).then(r => r.json());
    networksState.currentNetwork = network;

    document.getElementById('networks-page').classList.add('hidden');
    document.getElementById('network-detail-page').classList.remove('hidden');

    renderNetworkDetail();
}

function renderNetworkDetail() {
    const network = networksState.currentNetwork;
    const infoEl = document.getElementById('network-info');
    const actionsEl = document.getElementById('network-actions');

    infoEl.innerHTML = `
        <h1>${network.name}</h1>
        <p>${network.description || ''}</p>
        <div class="network-themes">${network.themes.map(t => `<span class="tag">${t}</span>`).join('')}</div>
    `;

    // Show actions based on user role
    const globalState = window.state || (typeof state !== 'undefined' ? state : null);
    const isOwner = globalState && globalState.user && network.ownerId === globalState.user.id;
    const isMember = globalState && globalState.user && network.memberships.some(m => m.userId === globalState.user.id);

    if (isOwner) {
        actionsEl.innerHTML = `
            <button class="btn secondary" onclick="editNetwork()">Modifica</button>
            <button class="btn ghost" onclick="deleteNetwork()">Elimina</button>
        `;
    } else if (!isMember && globalState && globalState.user) {
        actionsEl.innerHTML = `<button class="btn primary" onclick="applyToNetwork()">Candidati</button>`;
    }

    renderMembers();
}

function renderMembers() {
    const list = document.getElementById('members-list');
    const network = networksState.currentNetwork;

    list.innerHTML = '';
    network.memberships.forEach(m => {
        const item = document.createElement('div');
        item.className = 'member-item';
        item.innerHTML = `
            <span>${m.user.displayName}</span>
            <span class="role">${m.role}</span>
        `;
        list.appendChild(item);
    });
}

// ===== CREATE/EDIT NETWORK =====

function toggleNetworkModal(show) {
    const modal = document.getElementById('network-modal');
    if (show) modal.classList.remove('hidden');
    else modal.classList.add('hidden');
}

async function handleNetworkForm(e) {
    e.preventDefault();

    // Access global state from app.js
    const globalState = window.state || state;
    if (!globalState || !globalState.user) {
        alert('Accedi per creare una rete');
        return;
    }

    const formData = new FormData(e.target);
    const data = {
        name: formData.get('name'),
        description: formData.get('description'),
        themes: formData.get('themes').split(',').map(t => t.trim()),
        logoUrl: formData.get('logoUrl') || undefined
    };

    try {
        const res = await fetch('/api/networks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(data)
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Errore creazione rete');
        }

        alert('Rete creata!');
        toggleNetworkModal(false);
        e.target.reset();
        await loadNetworks();
    } catch (e) {
        alert(e.message);
    }
}

// ===== APPLICATIONS =====

async function applyToNetwork() {
    const message = prompt('Messaggio di candidatura (opzionale):');

    try {
        const res = await fetch(`/api/networks/${networksState.currentNetwork.id}/apply`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ message })
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Errore candidatura');
        }

        alert('Candidatura inviata!');
    } catch (e) {
        alert(e.message);
    }
}

async function loadApplications() {
    if (!networksState.currentNetwork) return;

    const apps = await fetch(`/api/networks/${networksState.currentNetwork.id}/applications`, {
        credentials: 'include'
    }).then(r => r.json());

    const list = document.getElementById('applications-list');
    list.innerHTML = '';

    apps.forEach(app => {
        const item = document.createElement('div');
        item.className = 'application-item';
        item.innerHTML = `
            <div>
                <strong>${app.applicant.displayName}</strong>
                <p>${app.message || ''}</p>
            </div>
            <div>
                <button class="btn primary" onclick="approveApplication('${app.id}')">Approva</button>
                <button class="btn ghost" onclick="rejectApplication('${app.id}')">Rifiuta</button>
            </div>
        `;
        list.appendChild(item);
    });
}

async function approveApplication(appId) {
    try {
        await api(`/api/networks/${networksState.currentNetwork.id}/applications/${appId}`, {
            method: 'PATCH',
            body: JSON.stringify({ action: 'approve' })
        });
        showToast('Candidatura approvata!');
        await loadApplications();
        await openNetwork(networksState.currentNetwork.id);
    } catch (e) {
        showToast(e.message);
    }
}

async function rejectApplication(appId) {
    try {
        await api(`/api/networks/${networksState.currentNetwork.id}/applications/${appId}`, {
            method: 'PATCH',
            body: JSON.stringify({ action: 'reject' })
        });
        showToast('Candidatura rifiutata');
        await loadApplications();
    } catch (e) {
        showToast(e.message);
    }
}

// ===== PROFILE =====

async function loadUserProfile() {
    if (!state.user) return;

    const profile = await fetch('/api/users/profile', { credentials: 'include' }).then(r => r.json());
    networksState.userProfile = profile;

    // Populate form
    document.getElementById('profile-displayName').value = profile.displayName || '';
    document.getElementById('profile-bio').value = profile.bio || '';
    document.getElementById('profile-contactEmail').value = profile.contactEmail || '';
    document.getElementById('profile-phone').value = profile.phone || '';
    document.getElementById('profile-isPublic').checked = profile.isPublicProfile || false;

    if (profile.socialLinks) {
        document.getElementById('profile-twitter').value = profile.socialLinks.twitter || '';
        document.getElementById('profile-linkedin').value = profile.socialLinks.linkedin || '';
        document.getElementById('profile-instagram').value = profile.socialLinks.instagram || '';
        document.getElementById('profile-website').value = profile.socialLinks.website || '';
    }
}

async function handleProfileForm(e) {
    e.preventDefault();
    const formData = new FormData(e.target);

    const data = {
        bio: formData.get('bio'),
        contactEmail: formData.get('contactEmail'),
        phone: formData.get('phone'),
        isPublicProfile: formData.get('isPublicProfile') === 'on',
        socialLinks: {
            twitter: formData.get('twitter'),
            linkedin: formData.get('linkedin'),
            instagram: formData.get('instagram'),
            website: formData.get('website')
        }
    };

    try {
        await api('/api/users/profile', {
            method: 'PATCH',
            body: JSON.stringify(data)
        });
        showToast('Profilo aggiornato!');
    } catch (e) {
        showToast(e.message);
    }
}

// ===== INIT =====

function initNetworks() {
    const networkForm = document.getElementById('network-form');
    const profileForm = document.getElementById('profile-form');
    const btnCreateNetwork = document.getElementById('btn-create-network');
    const btnCloseNetworkModal = document.getElementById('btn-close-network-modal');

    if (networkForm) networkForm.addEventListener('submit', handleNetworkForm);
    if (profileForm) profileForm.addEventListener('submit', handleProfileForm);
    if (btnCreateNetwork) btnCreateNetwork.addEventListener('click', () => toggleNetworkModal(true));
    if (btnCloseNetworkModal) btnCloseNetworkModal.addEventListener('click', () => toggleNetworkModal(false));
}

// Auto-init if elements exist
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNetworks);
} else {
    initNetworks();
}
