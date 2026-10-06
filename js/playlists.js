/* Gestione playlist delle lezioni */
const PLAYLIST_BUCKET = 'playlists';

function playlistEscapeHtml(value) {
    if (!value) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function getPlaylistFileLabel(fileName = '') {
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (['mp3', 'wav', 'm4a', 'aac', 'ogg'].includes(ext)) return 'Audio';
    if (['m3u', 'm3u8'].includes(ext)) return 'Playlist';
    if (ext === 'zip') return 'Archivio';
    return 'File';
}

function isAudioPlaylistFile(fileName = '') {
    const ext = fileName.split('.').pop()?.toLowerCase();
    return ['mp3', 'wav', 'm4a', 'aac', 'ogg'].includes(ext);
}

async function uploadLessonPlaylist({ lessonId, title, file = null, content = '', userId }) {
    if (!lessonId || !title || !userId) throw new Error('Dati playlist incompleti.');
    const textContent = String(content || '').trim();
    if (!file && !textContent) throw new Error('Inserisci il testo della playlist oppure seleziona un file.');
    if (file && file.size > 50 * 1024 * 1024) throw new Error('La playlist non può superare 50 MB.');

    let path = null;
    let fileUrl = null;
    let fileName = null;
    let fileType = null;
    const sb = getSupabase();

    if (file) {
        const allowed = ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'm3u', 'm3u8', 'txt', 'zip'];
        const ext = (file.name.split('.').pop() || '').toLowerCase();
        if (!allowed.includes(ext)) {
            throw new Error('Formato non supportato. Usa audio, M3U/M3U8, TXT o ZIP.');
        }
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        path = `${userId}/${lessonId}/${Date.now()}_${safeName}`;
        const { error: uploadError } = await sb.storage
            .from(PLAYLIST_BUCKET)
            .upload(path, file, { upsert: false, contentType: file.type || undefined });
        if (uploadError) throw uploadError;
        const { data: publicData } = sb.storage.from(PLAYLIST_BUCKET).getPublicUrl(path);
        fileUrl = publicData?.publicUrl || '';
        fileName = file.name;
        fileType = file.type || getPlaylistFileLabel(file.name);
    }

    const { data, error: dbError } = await sb.from('lesson_playlists').insert([{
        lesson_id: lessonId,
        title: title.trim(),
        file_path: path,
        file_name: fileName,
        file_type: fileType || (textContent ? 'text/plain' : null),
        file_url: fileUrl,
        content: textContent || null,
        uploaded_by: userId
    }]).select().single();

    if (dbError) {
        await sb.storage.from(PLAYLIST_BUCKET).remove([path]).catch(() => {});
        throw dbError;
    }
    return data;
}

async function loadLessonPlaylists(lessonIds = []) {
    const sb = getSupabase();
    if (!lessonIds.length) return [];
    const { data, error } = await sb
        .from('lesson_playlists')
        .select('*')
        .in('lesson_id', lessonIds)
        .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
}

async function deleteLessonPlaylist(playlist) {
    const sb = getSupabase();
    const { error: storageError } = playlist.file_path
        ? await sb.storage.from(PLAYLIST_BUCKET).remove([playlist.file_path])
        : { error: null };
    if (storageError) console.warn('File playlist non rimosso:', storageError.message);
    const { error } = await sb.from('lesson_playlists').delete().eq('id', playlist.id);
    if (error) throw error;
}

async function getPlaylistAccessUrl(playlist) {
    const sb = getSupabase();
    // Bucket pubblico: URL già pronto. Se in futuro viene reso privato,
    // il fallback prova comunque a creare un signed URL.
    if (playlist.file_url) return playlist.file_url;
    const { data, error } = await sb.storage.from(PLAYLIST_BUCKET).createSignedUrl(playlist.file_path, 300);
    if (error) throw error;
    return data.signedUrl;
}

function renderPlaylistItems(playlists, lessonMap = {}, options = {}) {
    const admin = Boolean(options.admin);
    if (!playlists?.length) return '<p class="text-xs text-gray-500 italic">Nessuna playlist caricata.</p>';

    return playlists.map(p => {
        const lesson = lessonMap[p.lesson_id];
        const audio = isAudioPlaylistFile(p.file_name || '');
        const isText = Boolean(p.content);
        return `
            <div class="bg-brand-card/70 border border-brand-border rounded-2xl p-3 space-y-2">
                <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0">
                        <div class="text-sm font-black text-white truncate">${playlistEscapeHtml(p.title)}</div>
                        ${lesson ? `<div class="text-[10px] text-brand-cyan font-bold uppercase mt-0.5">${playlistEscapeHtml(lesson)}</div>` : ''}
                        <div class="text-[10px] text-gray-500 truncate mt-1"><i class="fa-solid ${isText ? 'fa-align-left' : 'fa-file-audio'} mr-1"></i>${isText ? 'Playlist testuale' : playlistEscapeHtml(p.file_name || 'File playlist')}</div>
                    </div>
                    <span class="shrink-0 text-[9px] uppercase font-black px-2 py-1 rounded-full bg-brand-lime/10 text-brand-lime border border-brand-lime/30">${getPlaylistFileLabel(p.file_name)}</span>
                </div>
                ${isText ? `<div class="bg-brand-dark/70 border border-brand-border rounded-xl p-3 text-xs text-gray-200 whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">${playlistEscapeHtml(p.content)}</div>` : ''}
                ${audio ? `<audio controls preload="none" class="w-full h-9" src="${playlistEscapeHtml(p.file_url)}"></audio>` : ''}
                <div class="flex gap-2">
                    ${!isText ? `<a href="${playlistEscapeHtml(p.file_url)}" target="_blank" rel="noopener" class="flex-1 text-center px-3 py-2 bg-brand-dark border border-brand-cyan/40 text-brand-cyan rounded-xl text-[10px] font-black uppercase hover:bg-brand-cyan hover:text-black transition"><i class="fa-solid fa-arrow-up-right-from-square mr-1"></i> ${audio ? 'Apri' : 'Apri / Scarica'}</a>` : `<div class="flex-1 text-center px-3 py-2 bg-brand-dark border border-brand-border text-brand-cyan rounded-xl text-[10px] font-black uppercase"><i class="fa-solid fa-eye mr-1"></i> Visibile online</div>`}
                    ${admin ? `<button type="button" onclick="deletePlaylistById('${p.id}')" class="px-3 py-2 bg-brand-pink/10 border border-brand-pink/30 text-brand-pink rounded-xl text-[10px] font-black uppercase hover:bg-brand-pink hover:text-white transition"><i class="fa-solid fa-trash"></i></button>` : ''}
                </div>
            </div>`;
    }).join('');
}

window.deletePlaylistById = async function(id) {
    if (!window.adminPlaylistsData) return;
    const playlist = window.adminPlaylistsData.find(p => p.id === id);
    if (!playlist) return;
    if (!confirm(`Eliminare la playlist "${playlist.title}"?`)) return;
    try {
        await deleteLessonPlaylist(playlist);
        await loadAdminPlaylistsSection();
    } catch (error) {
        console.error(error);
        alert('Impossibile eliminare la playlist: ' + error.message);
    }
};

async function loadAdminPlaylistsSection() {
    const container = document.getElementById('admin-playlists-container');
    if (!container) return;
    try {
        const { data: lessons, error: lessonError } = await getSupabase().from('lessons').select('id,title').order('datetime', { ascending: true });
        if (lessonError) throw lessonError;
        const ids = (lessons || []).map(l => l.id);
        const playlists = await loadLessonPlaylists(ids);
        window.adminPlaylistsData = playlists;
        const map = Object.fromEntries((lessons || []).map(l => [l.id, l.title]));
        container.innerHTML = renderPlaylistItems(playlists, map, { admin: true });
    } catch (error) {
        console.error('Errore playlist admin:', error);
        container.innerHTML = `<p class="text-xs text-brand-pink">Errore caricamento playlist: ${playlistEscapeHtml(error.message)}</p>`;
    }
}

function initPlaylistAdminForm(userId) {
    const form = document.getElementById('form-upload-playlist');
    if (!form) return;
    const lessonSelect = document.getElementById('playlist-lesson-id');
    const fileInput = document.getElementById('playlist-file');
    const typeInput = document.getElementById('playlist-type');
    const contentInput = document.getElementById('playlist-content');
    const fileField = document.getElementById('playlist-file-field');
    const contentField = document.getElementById('playlist-content-field');
    const titleInput = document.getElementById('playlist-title');
    const btn = document.getElementById('btn-upload-playlist');

    (async () => {
        try {
            const { data, error } = await getSupabase().from('lessons').select('id,title,datetime').order('datetime', { ascending: true });
            if (error) throw error;
            lessonSelect.innerHTML = '<option value="">-- Seleziona una lezione --</option>' + (data || []).map(l => {
                const date = new Date(l.datetime).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
                return `<option value="${l.id}">${playlistEscapeHtml(l.title)} · ${date}</option>`;
            }).join('');
        } catch (error) {
            console.error(error);
            lessonSelect.innerHTML = '<option value="">Errore caricamento lezioni</option>';
        }
    })();

    const syncPlaylistInputMode = () => {
        const textMode = typeInput?.value === 'text';
        if (fileField) fileField.classList.toggle('hidden', textMode);
        if (contentField) contentField.classList.toggle('hidden', !textMode);
        if (fileInput) fileInput.required = !textMode;
        if (contentInput) contentInput.required = textMode;
    };
    typeInput?.addEventListener('change', syncPlaylistInputMode);
    syncPlaylistInputMode();

    form.onsubmit = async (e) => {
        e.preventDefault();
        const textMode = typeInput?.value === 'text';
        const file = fileInput.files?.[0] || null;
        const content = contentInput?.value || '';
        if (!lessonSelect.value || !titleInput.value.trim() || (textMode && !content.trim()) || (!textMode && !file)) {
            alert(textMode ? 'Seleziona la lezione, inserisci il titolo e scrivi la playlist.' : 'Seleziona la lezione, inserisci il titolo e scegli il file.');
            return;
        }
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Caricamento...';
        try {
            await uploadLessonPlaylist({ lessonId: lessonSelect.value, title: titleInput.value, file: textMode ? null : file, content: textMode ? content : '', userId });
            form.reset();
            alert('Playlist caricata con successo!');
            await loadAdminPlaylistsSection();
        } catch (error) {
            console.error(error);
            alert('Errore durante il caricamento: ' + error.message);
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Salva Playlist';
        }
    };
}

async function loadStudentPlaylists() {
    const container = document.getElementById('student-playlists-container');
    if (!container) return;
    try {
        const { data: lessons, error: lessonError } = await getSupabase().from('lessons').select('id,title').order('datetime', { ascending: true });
        if (lessonError) throw lessonError;
        const playlists = await loadLessonPlaylists((lessons || []).map(l => l.id));
        const map = Object.fromEntries((lessons || []).map(l => [l.id, l.title]));
        container.innerHTML = renderPlaylistItems(playlists, map, { admin: false });
    } catch (error) {
        console.error('Errore playlist allieva:', error);
        container.innerHTML = `<p class="text-xs text-brand-pink">Errore caricamento playlist: ${playlistEscapeHtml(error.message)}</p>`;
    }
}
