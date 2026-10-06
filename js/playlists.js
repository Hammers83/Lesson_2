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
            '<div class="flex gap-2">' + (!isText ? '<a href="' + playlistEscapeHtml(p.file_url) + '" target="_blank" rel="noopener" class="flex-1 text-center px-3 py-2 bg-brand-dark border border-brand-cyan/40 text-brand-cyan rounded-xl text-[10px] font-black uppercase"><i class="fa-solid fa-arrow-up-right-from-square mr-1"></i> ' + (audio ? 'Apri' : 'Apri / Scarica') + '</a>' : '<div class="flex-1 text-center px-3 py-2 bg-brand-dark border border-brand-border text-brand-cyan rounded-xl text-[10px] font-black uppercase"><i class="fa-solid fa-eye mr-1"></i> Visibile online</div>') +
            (admin ? '<button type="button" onclick="deletePlaylistById(\'' + p.id + '\')" class="px-3 py-2 bg-brand-pink/10 border border-brand-pink/30 text-brand-pink rounded-xl text-[10px] font-black uppercase"><i class="fa-solid fa-trash"></i></button>' : '') +
            '</div></div>';
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
    const titleInput = document.getElementById('playlist-title');
    const fileField = document.getElementById('playlist-file-field');
    const builder = document.getElementById('playlist-builder-field');
    const tracksContainer = document.getElementById('playlist-tracks');
    const addTrackBtn = document.getElementById('btn-add-playlist-track');
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
