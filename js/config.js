// CONFIGURAZIONE SUPABASE
// 1. Rimosso /rest/v1/ dall'URL
const SUPABASE_URL = "https://aatelpatdppxdehbsxmz.supabase.co"; 
const SUPABASE_ANON_KEY = "sb_publishable_dA9nfW05M1BFCdjRwkWRMA_XM_SxPuV";

// Inizializzazione globale pulita
window.supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// VERIFICA AUTENTICAZIONE E RUOLI
async function checkAuthAndRedirect(requiredRole = null) {
    // 2. Corretto 'supabase' in 'window.supabaseClient'
    const { data: { session } } = await window.supabaseClient.auth.getSession();
    
    if (!session) {
        if (!window.location.pathname.endsWith('index.html') && window.location.pathname !== '/') {
            window.location.href = '../index.html';
        }
        return null;
    }

    const { data: profile, error } = await window.supabaseClient
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

    if (error || !profile) {
        await window.supabaseClient.auth.signOut();
        window.location.href = '../index.html';
        return null;
    }

    if (requiredRole === 'admin' && !profile.is_admin) {
        window.location.href = 'dashboard-student.html';
    } else if (requiredRole === 'student' && profile.is_admin) {
        window.location.href = 'dashboard-admin.html';
    }

    return { user: session.user, profile };
}

// LOGOUT
async function logout() {
    // Corretto 'supabase' in 'window.supabaseClient'
    await window.supabaseClient.auth.signOut();
    window.location.href = '../index.html';
}


// ============================================================
// AVATAR PROFILO
// ============================================================
const AVATAR_BUCKET = 'avatars';

function getAvatarFallback(profile = {}) {
    const name = [profile.nome, profile.cognome].filter(Boolean).join(' ') || 'Utente';
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=CCFF00&color=000&bold=true`;
}

function setAvatarImage(imgEl, profile = {}) {
    if (!imgEl) return;
    imgEl.src = profile.avatar_url || getAvatarFallback(profile);
    imgEl.onerror = () => {
        imgEl.onerror = null;
        imgEl.src = getAvatarFallback(profile);
    };
}

async function uploadProfileAvatar(file, profile) {
    if (!file || !profile?.id) throw new Error('File o profilo non valido.');

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
        throw new Error('Formato non supportato. Usa JPG, PNG, WEBP o GIF.');
    }
    if (file.size > 5 * 1024 * 1024) {
        throw new Error('L'immagine è troppo grande. Il limite è 5 MB.');
    }

    const sb = window.supabaseClient;
    const { data: sessionData, error: sessionError } = await sb.auth.getSession();
    if (sessionError) throw new Error('Impossibile verificare la sessione utente.');
    const authUser = sessionData?.session?.user;

    if (!authUser?.id) {
        throw new Error('Sessione non valida. Effettua nuovamente il login.');
    }

    // Storage RLS autorizza il percorso in base a auth.uid(), quindi
    // usiamo sempre l'ID dell'utente autenticato come prima cartella.
    const userId = authUser.id;

    const extensionMap = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
        'image/gif': 'gif'
    };
    const extension = extensionMap[file.type] || 'jpg';
    const path = `${userId}/avatar.${extension}`;

    // Elimina eventuali vecchie estensioni per evitare di lasciare file inutilizzati.
    const oldPaths = ['jpg', 'png', 'webp', 'gif']
        .map(ext => `${userId}/avatar.${ext}`)
        .filter(oldPath => oldPath !== path);
    await sb.storage.from(AVATAR_BUCKET).remove(oldPaths).catch(() => {});

    const { error: uploadError } = await sb.storage
        .from(AVATAR_BUCKET)
        .upload(path, file, {
            upsert: true,
            contentType: file.type,
            cacheControl: '3600'
        });

    if (uploadError) {
        throw new Error(`Impossibile caricare l'immagine: ${uploadError.message}`);
    }

    const { data } = sb.storage.from(AVATAR_BUCKET).getPublicUrl(path);
    if (!data?.publicUrl) throw new Error("URL dell'immagine non disponibile.");

    // Il profilo appartiene all'utente autenticato: aggiorniamo usando auth.uid()
    // invece di fidarci di un profile.id eventualmente non sincronizzato.
    const avatarUrl = `${data.publicUrl}?v=${Date.now()}`;
    const { data: updatedProfile, error: updateError } = await sb
        .from('profiles')
        .update({ avatar_url: avatarUrl })
        .eq('id', userId)
        .select('*')
        .single();

    if (updateError) {
        throw new Error(`Impossibile salvare il profilo: ${updateError.message}`);
    }

    return updatedProfile;
}
async function removeProfileAvatar(profile) {
    if (!profile?.id) throw new Error('Profilo non valido.');
    const sb = window.supabaseClient;
    const paths = ['jpg', 'png', 'webp', 'gif'].map(ext => `${profile.id}/avatar.${ext}`);
    const { error: storageError } = await sb.storage.from(AVATAR_BUCKET).remove(paths);
    if (storageError) console.warn('Impossibile eliminare alcuni vecchi avatar:', storageError.message);

    const { data: updatedProfile, error } = await sb
        .from('profiles')
        .update({ avatar_url: null })
        .eq('id', profile.id)
        .select('*')
        .single();

    if (error) throw new Error(`Impossibile rimuovere l'avatar: ${error.message}`);
    return updatedProfile;
}

function renderAvatarEditor(profile, options = {}) {
    const containerId = options.containerId || 'profile-avatar-editor';
    const container = document.getElementById(containerId);
    if (!container || !profile) return;

    const title = options.title || 'La tua foto profilo';
    const inputId = `${containerId}-input`;
    const imgId = `${containerId}-img`;
    const hasAvatar = Boolean(profile.avatar_url);

    container.innerHTML = `
        <div class="flex flex-col sm:flex-row items-center gap-4">
            <div class="relative shrink-0">
                <img id="${imgId}" src="" alt="Foto profilo"
                    class="w-24 h-24 rounded-2xl object-cover border-2 border-brand-lime bg-brand-dark">
                <label for="${inputId}" class="absolute -bottom-2 -right-2 w-9 h-9 rounded-xl bg-brand-lime text-black flex items-center justify-center cursor-pointer shadow-lg hover:scale-105 transition" title="Cambia foto">
                    <i class="fa-solid fa-camera text-sm"></i>
                </label>
            </div>
            <div class="flex-grow text-center sm:text-left">
                <h4 class="text-sm font-black uppercase text-white">${escapeHtml(title)}</h4>
                <p class="text-xs text-gray-400 mt-1">JPG, PNG, WEBP o GIF · massimo 5 MB</p>
                <div class="flex flex-wrap justify-center sm:justify-start gap-2 mt-3">
                    <label for="${inputId}" class="px-3 py-2 bg-brand-lime text-black rounded-xl text-xs font-black uppercase cursor-pointer hover:opacity-90 transition">
                        <i class="fa-solid fa-upload mr-1"></i> ${hasAvatar ? 'Cambia foto' : 'Carica foto'}
                    </label>
                    ${hasAvatar ? `<button type="button" id="${containerId}-remove" class="px-3 py-2 bg-brand-dark border border-brand-pink/40 text-brand-pink rounded-xl text-xs font-black uppercase hover:bg-brand-pink hover:text-white transition"><i class="fa-solid fa-trash mr-1"></i> Rimuovi</button>` : ''}
                </div>
                <input id="${inputId}" type="file" accept="image/jpeg,image/png,image/webp,image/gif" class="hidden">
                <p id="${containerId}-status" class="text-xs mt-2 hidden"></p>
            </div>
        </div>
    `;

    const img = document.getElementById(imgId);
    setAvatarImage(img, profile);

    const input = document.getElementById(inputId);
    input?.addEventListener('change', async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        await handleAvatarUpload(file, profile, containerId);
        input.value = '';
    });

    document.getElementById(`${containerId}-remove`)?.addEventListener('click', async () => {
        if (!confirm('Vuoi rimuovere la foto profilo?')) return;
        await handleAvatarRemove(profile, containerId);
    });
}

async function handleAvatarUpload(file, profile, containerId) {
    const status = document.getElementById(`${containerId}-status`);
    const setStatus = (message, error = false) => {
        if (!status) return;
        status.textContent = message;
        status.className = `text-xs mt-2 ${error ? 'text-brand-pink' : 'text-brand-lime'}`;
    };

    setStatus('Caricamento in corso...');
    try {
        const updatedProfile = await uploadProfileAvatar(file, profile);
        Object.assign(profile, updatedProfile);
        renderAvatarEditor(profile, { containerId });
        window.dispatchEvent(new CustomEvent('profile-avatar-updated', { detail: updatedProfile }));
        const refreshedStatus = document.getElementById(`${containerId}-status`);
        if (refreshedStatus) {
            refreshedStatus.textContent = 'Foto profilo aggiornata!';
            refreshedStatus.className = 'text-xs mt-2 text-brand-lime';
        }
    } catch (error) {
        console.error('Errore avatar:', error);
        setStatus(error.message || 'Errore durante il caricamento.', true);
    }
}

async function handleAvatarRemove(profile, containerId) {
    const status = document.getElementById(`${containerId}-status`);
    if (status) {
        status.textContent = 'Rimozione in corso...';
        status.className = 'text-xs mt-2 text-gray-400';
    }
    try {
        const updatedProfile = await removeProfileAvatar(profile);
        Object.assign(profile, updatedProfile);
        renderAvatarEditor(profile, { containerId });
        window.dispatchEvent(new CustomEvent('profile-avatar-updated', { detail: updatedProfile }));
    } catch (error) {
        console.error('Errore rimozione avatar:', error);
        if (status) {
            status.textContent = error.message || 'Errore durante la rimozione.';
            status.className = 'text-xs mt-2 text-brand-pink';
        }
    }
}

// NAVBAR DINAMICA
function renderNavbar(profile) {
    const navContainer = document.getElementById('nav-links');
    if (!navContainer) return;

    const roleBadge = profile.is_admin 
        ? '<span class="text-brand-cyan text-[10px] font-extrabold uppercase bg-brand-cyan/20 px-2 py-0.5 rounded-full border border-brand-cyan/30">Istruttore</span>' 
        : '';

    navContainer.innerHTML = `
        <div class="flex items-center gap-2">
            <img id="nav-avatar-img" src="" alt="Avatar" class="w-9 h-9 rounded-xl object-cover border border-brand-border bg-brand-dark">
            <div class="hidden sm:block">
                <div class="text-xs font-bold uppercase tracking-wider text-gray-300">Ciao, ${escapeHtml(profile.nome || 'Utente')}</div>
                ${roleBadge}
            </div>
        </div>
        <button onclick="logout()" class="bg-brand-pink/20 hover:bg-brand-pink text-brand-pink hover:text-white border border-brand-pink/40 text-xs font-bold py-1.5 px-4 rounded-xl transition">
            Esci
        </button>
    `;
    setAvatarImage(document.getElementById('nav-avatar-img'), profile);
}

// Accesso uniforme al client Supabase usato dagli altri moduli.
function getSupabase() {
    return window.supabaseClient;
}
window.getSupabase = getSupabase;
