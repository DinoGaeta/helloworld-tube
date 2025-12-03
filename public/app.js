const state = {
    user: null,
    videos: [],
    currentVideo: null,
    comments: []
};

// Expose state globally for networks.js
window.state = state;

const els = {
    feed: document.getElementById('feed'),
    playerPanel: document.getElementById('player-panel'),
    videoPlayer: document.getElementById('video-player'),
    videoTitle: document.getElementById('video-title'),
    videoDesc: document.getElementById('video-desc'),
    videoUploader: document.getElementById('video-uploader'),
    videoDate: document.getElementById('video-date'),
    authForms: document.getElementById('auth-forms'),
    userInfo: document.getElementById('user-info'),
    userName: document.getElementById('user-name'),
    loginEmail: document.getElementById('login-email'),
    loginPass: document.getElementById('login-pass'),
    btnLogin: document.getElementById('btn-login'),
    btnSignup: document.getElementById('btn-signup'),
    btnLogout: document.getElementById('btn-logout'),
    uploadModal: document.getElementById('upload-modal'),
    btnUpload: document.getElementById('btn-upload'),
    btnCloseModal: document.getElementById('btn-close-modal'),
    uploadForm: document.getElementById('upload-form'),
    commentsList: document.getElementById('comments-list'),
    notesList: document.getElementById('notes-list'),
    commentText: document.getElementById('comment-text'),
    noteText: document.getElementById('note-text'),
    btnComment: document.getElementById('btn-comment'),
    btnNote: document.getElementById('btn-note'),
    tabs: document.querySelectorAll('.tab'),
    tabNotes: document.getElementById('tab-notes'),
    tabComments: document.getElementById('tab-comments'),
    toast: document.getElementById('toast'),
    searchInput: document.getElementById('search-input'),
    btnSearch: document.getElementById('btn-search')
};

async function api(url, options = {}) {
    const res = await fetch(url, {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        ...options,
    });
    if (!res.ok) {
        let msg = 'Errore';
        try {
            const j = await res.json();
            msg = j.error || msg;
        } catch (e) { /* ignore */ }
        throw new Error(msg);
    }
    return res.json();
}

function showToast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.remove('hidden');
    setTimeout(() => els.toast.classList.add('hidden'), 2500);
}

async function fetchMe() {
    const res = await fetch('/api/me', { credentials: 'include' });
    const data = await res.json();
    state.user = data.user;
    updateAuthUI();
}

function updateAuthUI() {
    if (state.user) {
        els.authForms.classList.add('hidden');
        els.userInfo.classList.remove('hidden');
        els.userName.textContent = state.user.displayName || state.user.email;
    } else {
        els.authForms.classList.remove('hidden');
        els.userInfo.classList.add('hidden');
    }
}

async function loadVideos(query = '') {
    const data = await fetch('/api/videos', { credentials: 'include' }).then(r => r.json());
    state.videos = data.filter(v => v.title.toLowerCase().includes(query.toLowerCase()) || (v.description || '').toLowerCase().includes(query.toLowerCase()));
    renderFeed();
}

function renderFeed() {
    els.feed.innerHTML = '';
    state.videos.forEach(video => {
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `
            <div class="card-thumb">PLAY</div>
            <div class="card-title">${video.title}</div>
            <div class="card-meta">
                <span>${video.uploaderName || 'Creator'}</span>
                ${video.fromNetwork ? '<span class="network-badge">🌐 Network</span>' : ''}
                <span>${new Date(video.createdAt).toLocaleDateString()}</span>
            </div>
        `;
        card.addEventListener('click', () => openVideo(video.id));
        els.feed.appendChild(card);
    });
}

async function openVideo(id) {
    const video = state.videos.find(v => v.id === id);
    if (!video) return;
    state.currentVideo = video;
    els.playerPanel.classList.remove('hidden');
    els.videoPlayer.src = `/api/videos/${id}/stream`;
    els.videoTitle.textContent = video.title;
    els.videoDesc.textContent = video.description || '—';
    els.videoUploader.textContent = video.uploaderName || 'Creatore';
    els.videoDate.textContent = new Date(video.createdAt).toLocaleString();
    await loadComments(id);
}

async function loadComments(videoId) {
    const data = await fetch(`/api/videos/${videoId}/comments`, { credentials: 'include' }).then(r => r.json());
    state.comments = data;
    renderComments();
}

function renderComments() {
    const list = els.commentsList;
    const notes = els.notesList;
    list.innerHTML = '';
    notes.innerHTML = '';
    state.comments.forEach(c => {
        const entry = document.createElement('div');
        entry.className = 'comment';
        entry.innerHTML = `<div class="meta">${c.userName} · ${new Date(c.createdAt).toLocaleString()}</div><div>${c.text}</div>`;
        const clone = entry.cloneNode(true);
        list.appendChild(entry);
        notes.appendChild(clone);
    });
}

async function handleLogin() {
    try {
        await api('/api/login', {
            method: 'POST',
            body: JSON.stringify({ email: els.loginEmail.value, password: els.loginPass.value })
        });
        await fetchMe();
        showToast('Bentornato!');
    } catch (e) {
        showToast(e.message);
    }
}

async function handleSignup() {
    try {
        await api('/api/signup', {
            method: 'POST',
            body: JSON.stringify({ email: els.loginEmail.value, password: els.loginPass.value })
        });
        showToast('Registrato! Ora accedi');
    } catch (e) {
        showToast(e.message);
    }
}

async function handleLogout() {
    await api('/api/logout', { method: 'POST' });
    state.user = null;
    updateAuthUI();
    showToast('Logout effettuato');
}

function toggleModal(show) {
    if (show) els.uploadModal.classList.remove('hidden');
    else els.uploadModal.classList.add('hidden');
}

async function requestUploadUrl(file) {
    const res = await api('/api/upload-url', {
        method: 'POST',
        body: JSON.stringify({ filename: file.name, mimetype: file.type, size: file.size })
    });
    return res;
}

async function uploadToPresigned(url, file) {
    const res = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file
    });
    if (!res.ok) throw new Error('Errore upload S3');
}

async function handleUpload(e) {
    e.preventDefault();
    if (!state.user) return showToast('Accedi per caricare');
    const formData = new FormData(els.uploadForm);
    const file = formData.get('video');
    const title = formData.get('title');
    const description = formData.get('description');

    if (!file || file.size === 0) return showToast('Seleziona un video');

    try {
        showToast('Preparazione upload...');

        // 1. Get Presigned URL
        const presignRes = await api('/api/upload-url', {
            method: 'POST',
            body: JSON.stringify({
                filename: file.name,
                mimetype: file.type
            })
        });

        // 2. Upload to S3
        showToast('Caricamento in corso...');
        const uploadRes = await fetch(presignRes.url, {
            method: 'PUT',
            body: file,
            headers: {
                'Content-Type': file.type
            }
        });

        if (!uploadRes.ok) throw new Error('Errore upload su storage');

        // 3. Save Metadata
        showToast('Salvataggio dati...');
        await api('/api/videos', {
            method: 'POST',
            body: JSON.stringify({
                title,
                description,
                s3Key: presignRes.key
            })
        });

        showToast('Video pubblicato!');
        toggleModal(false);
        els.uploadForm.reset();
        await loadVideos(els.searchInput.value);
    } catch (e) {
        console.error(e);
        showToast(e.message || 'Errore durante il caricamento');
    }
}

async function postComment(text, inputEl) {
    if (!state.user) return showToast('Accedi per commentare');
    if (!state.currentVideo) return;

    try {
        await api(`/api/videos/${state.currentVideo.id}/comments`, {
            method: 'POST',
            body: JSON.stringify({ text })
        });
        if (inputEl) inputEl.value = '';
        await loadComments(state.currentVideo.id);
        showToast('Pubblicato!');
    } catch (e) {
        console.error(e);
        showToast(e.message || 'Errore pubblicazione');
    }
}

function setupTabs() {
    els.tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            els.tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const target = tab.dataset.tab;
            els.tabNotes.classList.add('hidden');
            els.tabComments.classList.add('hidden');
            if (target === 'notes') els.tabNotes.classList.remove('hidden');
            if (target === 'comments') els.tabComments.classList.remove('hidden');
        });
    });
}

function setupSearch() {
    const doSearch = () => loadVideos(els.searchInput.value);
    els.btnSearch.addEventListener('click', doSearch);
    els.searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') doSearch();
    });
}

function initEvents() {
    els.btnLogin.addEventListener('click', handleLogin);
    els.btnSignup.addEventListener('click', handleSignup);
    els.btnLogout.addEventListener('click', handleLogout);
    els.btnUpload.addEventListener('click', () => toggleModal(true));
    els.btnCloseModal.addEventListener('click', () => toggleModal(false));
    els.uploadForm.addEventListener('submit', handleUpload);
    els.btnComment.addEventListener('click', async () => {
        if (els.commentText.value.trim().length === 0) return;
        await postComment(els.commentText.value.trim(), els.commentText);
    });
    els.btnNote.addEventListener('click', async () => {
        if (els.noteText.value.trim().length === 0) return;
        await postComment(els.noteText.value.trim(), els.noteText);
    });
    setupTabs();
    setupSearch();

    // Networks navigation
    const btnNetworks = document.getElementById('btn-networks');
    if (btnNetworks) {
        btnNetworks.addEventListener('click', () => {
            els.feed.classList.add('hidden');
            els.playerPanel.classList.add('hidden');
            const networksPage = document.getElementById('networks-page');
            if (networksPage) {
                networksPage.classList.remove('hidden');
                if (typeof loadNetworks === 'function') loadNetworks();
            }
        });
    }
}

async function bootstrap() {
    initEvents();
    await fetchMe();
    await loadVideos();
}

bootstrap().catch(err => console.error(err));
