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


function parsePlaylistTextToTracks(rawText = '') {
    const lines = String(rawText || '')
        .split(/\\r?\\n/)
        .map(line => line.replace(/^\\s*(?:[-*•]\\s*|\\d+[.)]\\s*)/, '').trim())
        .filter(Boolean);

    return lines.map(line => {
        // Formato consigliato: Artista - Titolo oppure Titolo - Artista.
        const parts = line.split(/\\s+[–—-]\\s+/);
        if (parts.length >= 2) {
            return { title: parts.slice(1).join(' - ').trim(), artist: parts[0].trim(), url: '' };
        }
        return { title: line, artist: '', url: '' };
    }).filter(track => track.title || track.artist);
}

function fillPlaylistTrackBuilder(tracksContainer, tracks) {
    if (!tracksContainer) return;
    tracksContainer.innerHTML = '';
    tracks.forEach(track => {
        const row = document.createElement('div');
        row.className = 'playlist-track-row grid grid-cols-1 sm:grid-cols-[auto_1fr_1fr_1.2fr_auto] gap-2 items-center bg-brand-dark/60 border border-brand-border rounded-xl p-2';
        const n = document.createElement('span'); n.className = 'track-number w-7 h-7 rounded-lg bg-brand-cyan/10 text-brand-cyan flex items-center justify-center text-[10px] font-black';
        const title = document.createElement('input'); title.type='text'; title.dataset.field='title'; title.placeholder='Titolo brano'; title.value=track.title || ''; title.className='w-full px-3 py-2 bg-brand-dark border border-brand-border rounded-lg text-white text-xs focus:outline-none focus:border-brand-cyan';
        const artist = document.createElement('input'); artist.type='text'; artist.dataset.field='artist'; artist.placeholder='Artista'; artist.value=track.artist || ''; artist.className=title.className;
        const url = document.createElement('input'); url.type='url'; url.dataset.field='url'; url.placeholder='Link YouTube / Spotify (opzionale)'; url.value=track.url || ''; url.className=title.className;
        const actions = document.createElement('div'); actions.className='flex gap-1 justify-end';
        [['up','fa-chevron-up'],['down','fa-chevron-down'],['remove','fa-trash']].forEach(item => {
            const b=document.createElement('button'); b.type='button'; b.dataset.action=item[0]; b.className='px-2 py-2 rounded-lg bg-white/5 text-gray-300 hover:text-white'; b.innerHTML='<i class="fa-solid '+item[1]+'"></i>'; actions.appendChild(b);
        });
        row.append(n,title,artist,url,actions);
        tracksContainer.appendChild(row);
    });
}

async function recognizePlaylistPhoto(file, statusEl) {
    if (!window.Tesseract) throw new Error('OCR non disponibile. Ricarica la pagina e riprova.');
    if (statusEl) statusEl.textContent = 'Lettura della foto in corso...';
    const result = await Tesseract.recognize(file, 'ita+eng', {
        logger: message => {
            if (!statusEl || !message?.status) return;
            const progress = typeof message.progress === 'number' ? Math.round(message.progress * 100) : 0;
            statusEl.textContent = progress ? 'Lettura foto: ' + progress + '%' : 'Lettura della foto in corso...';
        }
    });
    return result?.data?.text || '';
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
        if (path) await sb.storage.from(PLAYLIST_BUCKET).remove([path]).catch(() => {});
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

function parsePlaylistContent(content) {
    if (!content) return { tracks: [], legacyText: '' };
    try { const parsed = JSON.parse(content); if (parsed && Array.isArray(parsed.tracks)) return { tracks: parsed.tracks, legacyText: '' }; } catch (_) {}
    return { tracks: [], legacyText: content };
}

function renderPlaylistItems(playlists, lessonMap = {}, options = {}) {
    const admin = Boolean(options.admin);
    if (!playlists?.length) return '<p class="text-xs text-gray-500 italic">Nessuna playlist caricata.</p>';
    return playlists.map(p => {
        const lesson = lessonMap[p.lesson_id];
        const audio = isAudioPlaylistFile(p.file_name || '');
        const parsed = parsePlaylistContent(p.content);
        const isStructured = parsed.tracks.length > 0;
        const isText = Boolean(p.content);
        const tracksHtml = isStructured ? '<div class="space-y-1.5 max-h-72 overflow-y-auto">' + parsed.tracks.map((track, index) =>
            '<div class="flex items-center gap-3 bg-brand-dark/60 border border-brand-border rounded-xl px-3 py-2">' +
            '<span class="w-6 h-6 shrink-0 rounded-lg bg-brand-cyan/10 text-brand-cyan flex items-center justify-center text-[9px] font-black">' + (index + 1) + '</span>' +
            '<div class="min-w-0 flex-1"><div class="text-xs font-bold text-white truncate">' + playlistEscapeHtml(track.title || 'Brano senza titolo') + '</div>' +
            (track.artist ? '<div class="text-[10px] text-gray-500 truncate">' + playlistEscapeHtml(track.artist) + '</div>' : '') + '</div>' +
            (track.url ? '<a href="' + playlistEscapeHtml(track.url) + '" target="_blank" rel="noopener noreferrer" class="shrink-0 px-2 py-1 rounded-lg bg-brand-cyan/10 text-brand-cyan text-[9px] font-black uppercase"><i class="fa-solid fa-link"></i></a>' : '') +
            '</div>'
        ).join('') + '</div>' : (isText ? '<div class="bg-brand-dark/70 border border-brand-border rounded-xl p-3 text-xs text-gray-200 whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">' + playlistEscapeHtml(parsed.legacyText) + '</div>' : '');
        return '<div class="bg-brand-card/70 border border-brand-border rounded-2xl p-3 space-y-2">' +
            '<div class="flex items-start justify-between gap-3"><div class="min-w-0">' +
            '<div class="text-sm font-black text-white truncate">' + playlistEscapeHtml(p.title) + '</div>' +
            (lesson ? '<div class="text-[10px] text-brand-cyan font-bold uppercase mt-0.5">' + playlistEscapeHtml(lesson) + '</div>' : '') +
            '<div class="text-[10px] text-gray-500 truncate mt-1"><i class="fa-solid fa-music mr-1"></i>' + (isStructured ? parsed.tracks.length + ' brani' : (isText ? 'Playlist testuale' : playlistEscapeHtml(p.file_name || 'File playlist'))) + '</div></div>' +
            '<span class="shrink-0 text-[9px] uppercase font-black px-2 py-1 rounded-full bg-brand-lime/10 text-brand-lime border border-brand-lime/30">' + (isStructured ? 'Playlist' : getPlaylistFileLabel(p.file_name || '')) + '</span></div>' +
            tracksHtml + (audio ? '<audio controls preload="none" class="w-full h-9" src="' + playlistEscapeHtml(p.file_url) + '"></audio>' : '') +
            '<div class="flex gap-2">' + (!isText ? '<a href="' + playlistEscapeHtml(p.file_url) + '" target="_blank" rel="noopener" class="flex-1 text-center px-3 py-2 bg-brand-dark border border-brand-cyan/40 text-brand-cyan rounded-xl text-[10px] font-black uppercase"><i class="fa-solid fa-arrow-up-right-from-square mr-1"></i> ' + (audio ? 'Apri' : 'Apri / Scarica') + '</a>' : '') +
            (admin ? '<button type="button" onclick="editPlaylistById(\'' + p.id + '\')" class="px-3 py-2 bg-brand-cyan/10 border border-brand-cyan/30 text-brand-cyan rounded-xl text-[10px] font-black uppercase"><i class="fa-solid fa-pen"></i></button><button type="button" onclick="deletePlaylistById(\'' + p.id + '\')" class="px-3 py-2 bg-brand-pink/10 border border-brand-pink/30 text-brand-pink rounded-xl text-[10px] font-black uppercase"><i class="fa-solid fa-trash"></i></button>' : '') +
            '</div></div>';
    }).join('');
}
window.editPlaylistById = function(id) {
    const playlist = window.adminPlaylistsData?.find(p => p.id === id);
    if (!playlist) return;
    if (typeof window.openPlaylistEditModal === 'function') window.openPlaylistEditModal(playlist);
};

async function updateLessonPlaylist({ id, lessonId, title, content, userId }) {
    if (!id || !lessonId || !title || !userId) throw new Error('Dati playlist incompleti.');
    const sb = getSupabase();
    const { data, error } = await sb.from('lesson_playlists')
        .update({
            lesson_id: lessonId,
            title: title.trim(),
            content: content || null
        })
        .eq('id', id)
        .select()
        .single();
    if (error) throw error;
    return data;
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
    const titleInput = document.getElementById('playlist-title');
    const fileField = document.getElementById('playlist-file-field');
    const builder = document.getElementById('playlist-builder-field');
    const tracksContainer = document.getElementById('playlist-tracks');
    const addTrackBtn = document.getElementById('btn-add-playlist-track');
    const txtImportInput = document.getElementById('playlist-txt-import');
    const photoInput = document.getElementById('playlist-photo-import');
    const importTxtBtn = document.getElementById('btn-import-playlist-txt');
    const importPhotoBtn = document.getElementById('btn-import-playlist-photo');
    const importStatus = document.getElementById('playlist-import-status');
    const btn = document.getElementById('btn-upload-playlist');

    const refreshNumbers = () => [...tracksContainer.children].forEach((row, i) => row.querySelector('.track-number').textContent = i + 1);
    const addTrack = () => {
        const row = document.createElement('div');
        row.className = 'playlist-track-row grid grid-cols-1 sm:grid-cols-[auto_1fr_1fr_1.2fr_auto] gap-2 items-center bg-brand-dark/60 border border-brand-border rounded-xl p-2';
        const n = document.createElement('span'); n.className = 'track-number w-7 h-7 rounded-lg bg-brand-cyan/10 text-brand-cyan flex items-center justify-center text-[10px] font-black';
        const title = document.createElement('input'); title.type='text'; title.dataset.field='title'; title.placeholder='Titolo brano'; title.className='w-full px-3 py-2 bg-brand-dark border border-brand-border rounded-lg text-white text-xs focus:outline-none focus:border-brand-cyan';
        const artist = document.createElement('input'); artist.type='text'; artist.dataset.field='artist'; artist.placeholder='Artista'; artist.className=title.className;
        const url = document.createElement('input'); url.type='url'; url.dataset.field='url'; url.placeholder='Link YouTube / Spotify (opzionale)'; url.className=title.className;
        const actions = document.createElement('div'); actions.className='flex gap-1 justify-end';
        [['up','fa-chevron-up'],['down','fa-chevron-down'],['remove','fa-trash']].forEach(item => { const b=document.createElement('button'); b.type='button'; b.dataset.action=item[0]; b.className='px-2 py-2 rounded-lg bg-white/5 text-gray-300 hover:text-white'; b.innerHTML='<i class="fa-solid '+item[1]+'"></i>'; actions.appendChild(b); });
        row.append(n,title,artist,url,actions); tracksContainer.appendChild(row); refreshNumbers(); title.focus();
    };
    const importTracks = (tracks, sourceLabel) => {
        if (!tracks.length) {
            alert('Non ho trovato brani nella lista.');
            return;
        }
        fillPlaylistTrackBuilder(tracksContainer, tracks);
        refreshNumbers();
        if (importStatus) importStatus.textContent = sourceLabel + ': ' + tracks.length + ' brani trovati. Controllali prima di salvare.';
    };

    importTxtBtn?.addEventListener('click', () => txtImportInput?.click());
    txtImportInput?.addEventListener('change', async () => {
        const file = txtImportInput.files?.[0];
        if (!file) return;
        try {
            importTracks(parsePlaylistTextToTracks(await file.text()), 'TXT importato');
        } catch (error) {
            console.error(error);
            alert('Errore nella lettura del TXT: ' + error.message);
        } finally {
            txtImportInput.value = '';
        }
    });

    importPhotoBtn?.addEventListener('click', () => photoInput?.click());
    photoInput?.addEventListener('change', async () => {
        const file = photoInput.files?.[0];
        if (!file) return;
        try {
            const text = await recognizePlaylistPhoto(file, importStatus);
            importTracks(parsePlaylistTextToTracks(text), 'Foto convertita');
        } catch (error) {
            console.error(error);
            alert('Errore OCR: ' + error.message);
        } finally {
            photoInput.value = '';
        }
    });

    addTrackBtn.addEventListener('click', addTrack);
    tracksContainer.addEventListener('click', e => { const b=e.target.closest('button[data-action]'); if(!b)return; const row=b.closest('.playlist-track-row'); if(b.dataset.action==='remove')row.remove(); if(b.dataset.action==='up'&&row.previousElementSibling)row.parentElement.insertBefore(row,row.previousElementSibling); if(b.dataset.action==='down'&&row.nextElementSibling)row.parentElement.insertBefore(row.nextElementSibling,row); refreshNumbers(); });
    const syncMode=()=>{ const text=typeInput.value==='text'; builder.classList.toggle('hidden',!text); fileField.classList.toggle('hidden',text); fileInput.required=!text; };
    typeInput.addEventListener('change',syncMode); syncMode(); addTrack();

    (async()=>{ try { const {data,error}=await getSupabase().from('lessons').select('id,title,datetime').order('datetime',{ascending:true}); if(error)throw error; lessonSelect.innerHTML='<option value="">-- Seleziona una lezione --</option>'+(data||[]).map(l=>'<option value="'+l.id+'">'+playlistEscapeHtml(l.title)+' · '+new Date(l.datetime).toLocaleString('it-IT',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})+'</option>').join(''); } catch(e){console.error(e);lessonSelect.innerHTML='<option value="">Errore caricamento lezioni</option>';} })();

    form.onsubmit=async e=>{
        e.preventDefault(); const text=typeInput.value==='text'; const file=fileInput.files?.[0]||null;
        const tracks=[...tracksContainer.querySelectorAll('.playlist-track-row')].map(r=>({title:r.querySelector('[data-field="title"]').value.trim(),artist:r.querySelector('[data-field="artist"]').value.trim(),url:r.querySelector('[data-field="url"]').value.trim()})).filter(t=>t.title||t.artist);
        if(!lessonSelect.value||!titleInput.value.trim()||(text&&!tracks.length)||(!text&&!file)){alert(text?'Aggiungi almeno un brano.':'Seleziona un file.');return;}
        btn.disabled=true; btn.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i> Salvataggio...';
        try { await uploadLessonPlaylist({lessonId:lessonSelect.value,title:titleInput.value,file:text?null:file,content:text?JSON.stringify({version:1,tracks}):'',userId}); form.reset(); tracksContainer.innerHTML=''; addTrack(); syncMode(); await loadAdminPlaylistsSection(); alert('Playlist salvata con successo!'); }
        catch(error){console.error(error);alert('Errore durante il salvataggio: '+error.message);} finally {btn.disabled=false;btn.innerHTML='<i class="fa-solid fa-floppy-disk"></i> Salva Playlist';}
    };
}

/* Modifica playlist esistente */
function initPlaylistEditModal(userId) {
    const modal = document.getElementById('modal-edit-playlist');
    const form = document.getElementById('form-edit-playlist');
    const lessonSelect = document.getElementById('edit-playlist-lesson-id');
    const titleInput = document.getElementById('edit-playlist-title');
    const tracksContainer = document.getElementById('edit-playlist-tracks');
    const addTrackBtn = document.getElementById('btn-add-edit-playlist-track');
    const typeLabel = document.getElementById('edit-playlist-type-label');
    const fileNotice = document.getElementById('edit-playlist-file-notice');
    const builder = document.getElementById('edit-playlist-builder');
    const closeBtn = document.getElementById('btn-close-edit-playlist');
    const cancelBtn = document.getElementById('btn-cancel-edit-playlist');
    const submitBtn = document.getElementById('btn-save-edit-playlist');
    if (!modal || !form || !lessonSelect || !titleInput || !tracksContainer) return;

    let currentPlaylist = null;

    const close = () => modal.classList.add('hidden');
    closeBtn?.addEventListener('click', close);
    cancelBtn?.addEventListener('click', close);
    modal.addEventListener('click', e => { if (e.target === modal) close(); });

    const refreshNumbers = () => [...tracksContainer.children].forEach((row, i) => {
        const n = row.querySelector('.edit-track-number');
        if (n) n.textContent = i + 1;
    });

    const addTrack = (track = {}) => {
        const row = document.createElement('div');
        row.className = 'edit-playlist-track-row grid grid-cols-1 sm:grid-cols-[auto_1fr_1fr_1.2fr_auto] gap-2 items-center bg-brand-dark/60 border border-brand-border rounded-xl p-2';
        const n = document.createElement('span'); n.className = 'edit-track-number w-7 h-7 rounded-lg bg-brand-cyan/10 text-brand-cyan flex items-center justify-center text-[10px] font-black';
        const title = document.createElement('input'); title.type='text'; title.dataset.field='title'; title.placeholder='Titolo brano'; title.value=track.title || ''; title.className='w-full px-3 py-2 bg-brand-dark border border-brand-border rounded-lg text-white text-xs focus:outline-none focus:border-brand-cyan';
        const artist = document.createElement('input'); artist.type='text'; artist.dataset.field='artist'; artist.placeholder='Artista'; artist.value=track.artist || ''; artist.className=title.className;
        const url = document.createElement('input'); url.type='url'; url.dataset.field='url'; url.placeholder='Link YouTube / Spotify (opzionale)'; url.value=track.url || ''; url.className=title.className;
        const actions = document.createElement('div'); actions.className='flex gap-1 justify-end';
        [['up','fa-chevron-up'],['down','fa-chevron-down'],['remove','fa-trash']].forEach(item => {
            const b=document.createElement('button'); b.type='button'; b.dataset.action=item[0]; b.className='px-2 py-2 rounded-lg bg-white/5 text-gray-300 hover:text-white'; b.innerHTML='<i class="fa-solid '+item[1]+'"></i>'; actions.appendChild(b);
        });
        row.append(n,title,artist,url,actions); tracksContainer.appendChild(row); refreshNumbers();
    };

    const loadLessons = async () => {
        const {data,error}=await getSupabase().from('lessons').select('id,title,datetime').order('datetime',{ascending:true});
        if(error) throw error;
        lessonSelect.innerHTML='<option value="">-- Seleziona una lezione --</option>'+(data||[]).map(l=>'<option value="'+l.id+'">'+playlistEscapeHtml(l.title)+' · '+new Date(l.datetime).toLocaleString('it-IT',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})+'</option>').join('');
    };

    tracksContainer.addEventListener('click', e => {
        const b=e.target.closest('button[data-action]'); if(!b)return;
        const row=b.closest('.edit-playlist-track-row'); if(!row)return;
        if(b.dataset.action==='remove') row.remove();
        if(b.dataset.action==='up'&&row.previousElementSibling) row.parentElement.insertBefore(row,row.previousElementSibling);
        if(b.dataset.action==='down'&&row.nextElementSibling) row.parentElement.insertBefore(row.nextElementSibling,row);
        refreshNumbers();
    });
    addTrackBtn?.addEventListener('click', () => addTrack());

    form.addEventListener('submit', async e => {
        e.preventDefault();
        if (!currentPlaylist) return;
        const tracks=[...tracksContainer.querySelectorAll('.edit-playlist-track-row')]
            .map(r=>({title:r.querySelector('[data-field="title"]').value.trim(),artist:r.querySelector('[data-field="artist"]').value.trim(),url:r.querySelector('[data-field="url"]').value.trim()}))
            .filter(t=>t.title||t.artist);
        if(!lessonSelect.value || !titleInput.value.trim()) { alert('Compila lezione e nome playlist.'); return; }
        if(currentPlaylist.content && parsePlaylistContent(currentPlaylist.content).tracks.length && !tracks.length) { alert('La playlist deve contenere almeno un brano.'); return; }
        submitBtn.disabled=true; submitBtn.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i> Salvataggio...';
        try {
            const parsed=parsePlaylistContent(currentPlaylist.content);
            const content=(parsed.tracks.length || parsed.legacyText) ? JSON.stringify({version:1,tracks}) : null;
            await updateLessonPlaylist({id:currentPlaylist.id,lessonId:lessonSelect.value,title:titleInput.value,content,userId});
            close();
            await loadAdminPlaylistsSection();
            alert('Playlist modificata con successo!');
        } catch(error) {
            console.error(error);
            alert('Errore durante la modifica: '+error.message);
        } finally {
            submitBtn.disabled=false; submitBtn.innerHTML='<i class="fa-solid fa-floppy-disk"></i> Salva Modifiche';
        }
    });

    window.openPlaylistEditModal = async function(playlist) {
        currentPlaylist=playlist;
        titleInput.value=playlist.title || '';
        lessonSelect.value=playlist.lesson_id || '';
        tracksContainer.innerHTML='';
        const parsed=parsePlaylistContent(playlist.content);
        const structured=parsed.tracks.length>0;
        typeLabel.textContent=structured ? 'Playlist testuale' : (playlist.content ? 'Testo libero' : 'File');
        if (structured) {
            fileNotice.classList.add('hidden');
            parsed.tracks.forEach(addTrack);
            if (!parsed.tracks.length) addTrack();
        } else if (playlist.content) {
            fileNotice.classList.remove('hidden');
            fileNotice.textContent='Questa playlist usa il vecchio formato testuale. La modifica verrà salvata come elenco brani strutturato.';
            addTrack({title: parsed.legacyText});
        } else {
            builder.classList.add('hidden');
            fileNotice.classList.remove('hidden');
            fileNotice.textContent='Questa è una playlist caricata come file. Puoi modificare nome e lezione; il file esistente resterà invariato.';
        }
        if (structured || playlist.content) builder.classList.remove('hidden');
        modal.classList.remove('hidden');
        try { await loadLessons(); lessonSelect.value=playlist.lesson_id || ''; } catch(error) { console.error(error); alert('Impossibile caricare le lezioni: '+error.message); }
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
