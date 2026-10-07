let currentSessionData = null;

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Verifica che l'utente sia loggato (ruolo allieva)
    const authData = await checkAuthAndRedirect('student');
    if (!authData) return;

    currentSessionData = authData;

    // 2. Render della Navbar e gestione avatar
    if (typeof renderNavbar === 'function') {
        renderNavbar(authData.profile);
    }
    if (typeof renderAvatarEditor === 'function') {
        renderAvatarEditor(authData.profile, { containerId: 'profile-avatar-editor', title: 'La tua foto profilo' });
    }

    // 3. Carica i dati del profilo e gestisci lo stato del certificato
    renderStudentProfile(authData.profile);
    checkCertificateStatus(authData.profile);
    initCertUploadForm(authData.user);

    // 4. Inizializza Sistema Notifiche
    await initNotifications(authData.user.id);
    await checkCertExpirationNotification(authData.user.id, authData.profile);

    // 5. Carica la lista delle lezioni
    await loadAvailableLessons(authData.user.id, authData.profile);

    // 6. Carica le playlist associate alle lezioni
    if (typeof loadStudentPlaylists === 'function') {
        await loadStudentPlaylists();
    }

    // Carica gli eventi organizzati dall'istruttore.
    if (typeof loadAvailableEvents === 'function') {
        await loadAvailableEvents(authData.user.id);
    }
    if (typeof subscribeToEventRealtime === 'function') {
        subscribeToEventRealtime('student', authData.user.id);
    }

    // 7. Inizializza la chat per l'allieva
    if (typeof initChat === 'function') {
        await initChat(authData.profile);
    }
});

// Helper di utilità per evitare XSS (Escape HTML)
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

window.addEventListener('profile-avatar-updated', (event) => {
    const profile = event.detail;
    if (!profile) return;
    if (typeof setAvatarImage === 'function') {
        setAvatarImage(document.getElementById('nav-avatar-img'), profile);
    }
});

// Mostra i dati del profilo (Nome, Saluto e Stato Certificato)
function renderStudentProfile(profile) {
    const welcomeEl = document.getElementById('student-welcome');
    const certStatusEl = document.getElementById('student-cert-status');
    if (welcomeEl) {
        welcomeEl.innerText = `Ciao, ${profile.nome || 'Allieva'}!`;
    }

    if (certStatusEl) {
        const dataScad = profile.medical_certificate_expiration || profile.certificato_scadenza;
        if (dataScad) {
            const scadenza = new Date(dataScad);
            scadenza.setHours(23, 59, 59, 999); // Imposta fine giornata
            const oggi = new Date();

            if (scadenza >= oggi) {
                certStatusEl.innerHTML = `<span class="text-brand-lime font-bold"><i class="fa-solid fa-circle-check"></i> Certificato Medico Valido</span> (Scadenza: ${scadenza.toLocaleDateString('it-IT')})`;
            } else {
                certStatusEl.innerHTML = `<span class="text-brand-pink font-bold"><i class="fa-solid fa-triangle-exclamation"></i> Certificato Scaduto</span> (${scadenza.toLocaleDateString('it-IT')})`;
            }
        } else {
            certStatusEl.innerHTML = `<span class="text-gray-400 font-bold"><i class="fa-solid fa-circle-info"></i> Certificato Medico Non Caricato</span>`;
        }
    }
}

// Carica le lezioni e controlla lo stato delle prenotazioni
async function loadAvailableLessons(userId, profile = {}) {
    const sb = window.supabaseClient;
    const container = document.getElementById('student-lessons-list');
    if (!container) return;

    const { data: lessons, error } = await sb
        .from('lessons')
        .select('*, bookings(user_id)')
        .gte('datetime', new Date().toISOString())
        .order('datetime', { ascending: true });

    if (error) {
        console.error("Errore recupero lezioni:", error);
        container.innerHTML = `<p class="text-xs text-brand-pink">Errore nel caricamento delle lezioni: ${escapeHtml(error.message)}</p>`;
        return;
    }

    if (!lessons || lessons.length === 0) {
        container.innerHTML = `<p class="text-xs text-gray-400">Nessuna lezione in programma.</p>`;
        return;
    }

    const lessonIds = lessons.map(l => l.id);
    const participantsResult = await sb.rpc('get_lesson_participants', { p_lesson_ids: lessonIds });
    if (participantsResult.error) {
        console.error("Errore caricamento partecipanti lezioni:", participantsResult.error);
    }

    const participantsByLesson = {};
    (participantsResult.data || []).forEach(function(p) {
        if (!participantsByLesson[p.lesson_id]) participantsByLesson[p.lesson_id] = [];
        participantsByLesson[p.lesson_id].push(p);
    });

    container.innerHTML = lessons.map(lesson => {
        const bookingsList = lesson.bookings || [];
        const participants = participantsByLesson[lesson.id] || [];
        const isBooked = bookingsList.some(b => b.user_id === userId);
        const bookedCount = bookingsList.length;
        const capacity = lesson.capacity || 20;
        const isFull = bookedCount >= capacity;

        const date = new Date(lesson.datetime);
        const formattedDate = date.toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: 'short' });
        const formattedTime = date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

        let buttonHtml = '';
        if (isBooked) {
            buttonHtml = `
                <div class="w-full py-2.5 bg-brand-lime/10 text-brand-lime border border-brand-lime/30 text-xs font-bold rounded-xl text-center">
                    <i class="fa-solid fa-circle-check mr-1"></i> Prenotazione confermata
                </div>`;
        } else if (isFull) {
            buttonHtml = `
                <button disabled class="w-full py-2.5 bg-gray-700 text-gray-400 text-xs uppercase rounded-xl cursor-not-allowed">Sold Out</button>`;
        } else {
            buttonHtml = `
                <button onclick="toggleBooking('${lesson.id}', '${userId}', false)" class="w-full py-2.5 btn-gradient text-black font-black text-xs uppercase rounded-xl transition">
                    <i class="fa-solid fa-check mr-1"></i> Prenota Posto
                </button>`;
        }

        return `
            <div class="bg-brand-dark p-5 rounded-2xl border border-brand-border flex flex-col justify-between space-y-4">
                <div>
                    <div class="flex justify-between items-center mb-2">
                        <span class="text-xs uppercase font-bold text-brand-cyan">${formattedDate} - ${formattedTime}</span>
                        <span class="text-[10px] px-2 py-0.5 rounded-full font-bold ${isFull ? 'bg-brand-pink/20 text-brand-pink border border-brand-pink/40' : 'bg-brand-lime/20 text-brand-lime border border-brand-lime/40'}">
                            ${bookedCount}/${capacity} Posti
                        </span>
                    </div>
                    <h4 class="text-base font-black text-white">${escapeHtml(lesson.title || 'Zumba Fitness')}</h4>
                    <button type="button" onclick="openParticipantsModal('lesson', '${lesson.id}')" class="mt-3 text-[10px] font-black uppercase text-brand-cyan hover:underline">
                        <i class="fa-solid fa-users mr-1"></i> Chi viene? (${participants.length})
                    </button>
                </div>
                <div>${buttonHtml}</div>
            </div>`;
    }).join('');
}

// Gestione Prenotazioni
window.toggleBooking = async function(lessonId, userId, isBooked) {
    // Annullamento temporaneamente disabilitato anche a livello logico.
    // Per ripristinarlo in futuro basta rimuovere questo blocco.
    if (isBooked) {
        alert("L'annullamento della prenotazione è temporaneamente disabilitato.");
        return;
    }

    const sb = window.supabaseClient;

    try {
        if (isBooked) {
            const { error } = await sb
                .from('bookings')
                .delete()
                .eq('lesson_id', lessonId)
                .eq('user_id', userId);
            
            if (error) throw error;

            await createNotification(userId, 'Prenotazione Annullata', 'Hai annullato la tua prenotazione per la lezione.', 'warning');
        } else {
            const { error } = await sb
                .from('bookings')
                .insert([{ lesson_id: lessonId, user_id: userId }]);
            
            if (error) throw error;

            await createNotification(userId, 'Prenotazione Confermata!', 'Il tuo posto alla lezione è stato riservato con successo.', 'success');
        }

        const { data: profile } = await sb.from('profiles').select('*').eq('id', userId).single();
        await loadAvailableLessons(userId, profile);
        await loadNotifications(userId);
    } catch (err) {
        console.error("Errore prenotazione:", err);
        alert("Impossibile completare l'operazione: " + (err.message || err));
    }
};

// Gestione Badge Stato Certificato
function checkCertificateStatus(profile) {
    const badge = document.getElementById('cert-status-badge');
    if (!badge) return;

    const dataScad = profile.medical_certificate_expiration || profile.certificato_scadenza;

    if (!dataScad) {
        badge.className = "px-3 py-1 bg-red-500/20 text-red-400 border border-red-500/40 text-xs font-black rounded-full uppercase";
        badge.innerText = "Mancante";
        return;
    }

    const today = new Date();
    today.setHours(0,0,0,0);
    const expDate = new Date(dataScad);
    expDate.setHours(0,0,0,0);
    
    const diffDays = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
        badge.className = "px-3 py-1 bg-red-500/20 text-red-400 border border-red-500/40 text-xs font-black rounded-full uppercase";
        badge.innerText = "Scaduto";
    } else if (diffDays <= 30) {
        badge.className = "px-3 py-1 bg-yellow-500/20 text-yellow-400 border border-yellow-500/40 text-xs font-black rounded-full uppercase";
        badge.innerText = `In Scadenza (${diffDays} gg)`;
    } else {
        badge.className = "px-3 py-1 bg-brand-lime/20 text-brand-lime border border-brand-lime/40 text-xs font-black rounded-full uppercase";
        badge.innerText = "Valido";
    }
}

// Inizializza Evento Submit del Form
function initCertUploadForm(user) {
    const form = document.getElementById('form-upload-cert');
    if (!form) return;

    form.onsubmit = async (e) => {
        e.preventDefault();
        const fileInput = document.getElementById('cert-file-input');
        const expInput = document.getElementById('cert-expiration-date');
        const btn = document.getElementById('btn-upload-cert');

        if (!fileInput.files || fileInput.files.length === 0) {
            alert("Seleziona un file da caricare.");
            return;
        }

        if (!expInput.value) {
            alert("Inserisci la data di scadenza del certificato.");
            return;
        }

        const file = fileInput.files[0];
        const fileExt = file.name.split('.').pop();
        const filePath = `${user.id}/certificato_${Date.now()}.${fileExt}`;

        btn.disabled = true;
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Caricamento in corso...`;

        try {
            const sb = window.supabaseClient;

            const { error: uploadErr } = await sb.storage
                .from('certificates')
                .upload(filePath, file, { upsert: true });

            if (uploadErr) throw uploadErr;

            const { data: urlData } = sb.storage
                .from('certificates')
                .getPublicUrl(filePath);

            const publicUrl = urlData.publicUrl;

            const { error: updateErr } = await sb
                .from('profiles')
                .update({
                    medical_certificate_url: publicUrl,
                    medical_certificate_expiration: expInput.value
                })
                .eq('id', user.id);

            if (updateErr) throw updateErr;

            await createNotification(user.id, 'Certificato Caricato', 'Il tuo certificato medico è stato inviato correttamente.', 'success');

            alert("Certificato medico caricato con successo!");
            location.reload();
        } catch (err) {
            console.error("Errore upload certificato:", err);
            alert("Errore durante il caricamento: " + err.message);
        } finally {
            btn.disabled = false;
            btn.innerHTML = `<i class="fa-solid fa-cloud-arrow-up"></i> Carica Certificato Medico`;
        }
    };
}

