/* ==========================================================================
   EVENTI ORGANIZZATI - gestione admin/allieve
   ========================================================================== */

function eventEscapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function eventSafeUrl(value) {
    const url = String(value || '').trim();
    return /^https?:\/\//i.test(url) ? url : '';
}

function formatEventDate(value) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('it-IT', {
        weekday: 'short', day: '2-digit', month: 'short', year: 'numeric'
    });
}

function formatEventTime(value) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('it-IT', {
        hour: '2-digit', minute: '2-digit'
    });
}

function formatEventDatetimeLocal(value) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    const pad = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
        'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

function formatEventMoney(value) {
    const n = Number(value || 0);
    return n > 0 ? n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' }) : 'Gratuito';
}

function eventStatusLabel(status) {
    return ({
        draft: 'Bozza',
        open: 'Iscrizioni aperte',
        closed: 'Iscrizioni chiuse',
        cancelled: 'Annullato'
    })[status] || status || 'Iscrizioni aperte';
}

function eventStatusClass(status) {
    return ({
        draft: 'bg-gray-500/20 text-gray-300 border-gray-500/40',
        open: 'bg-brand-lime/20 text-brand-lime border-brand-lime/40',
        closed: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40',
        cancelled: 'bg-brand-pink/20 text-brand-pink border-brand-pink/40'
    })[status] || 'bg-brand-cyan/20 text-brand-cyan border-brand-cyan/40';
}

function eventDeadlinePassed(event) {
    return event.registration_deadline && new Date(event.registration_deadline).getTime() < Date.now();
}

function eventIsBookable(event, bookedCount) {
    return event.status === 'open' &&
        !eventDeadlinePassed(event) &&
        bookedCount < Number(event.capacity || 20);
}

async function notifyEventAttendees(eventId, title, message, type = 'info') {
    const sb = getSupabase();
    if (!sb) return;
    const { error } = await sb.rpc('notify_event_attendees', {
        p_event_id: eventId, p_title: title, p_message: message, p_type: type
    });
    if (error) console.error('Errore notifica partecipanti evento:', error);
}

function eventCardMeta(event) {
    const location = event.location ? '<p class="text-[10px] text-brand-cyan font-bold uppercase mt-2"><i class="fa-solid fa-location-dot mr-1"></i>' + eventEscapeHtml(event.location) + '</p>' : '';
    const address = event.address ? '<p class="text-[10px] text-gray-400 mt-1"><i class="fa-solid fa-map-pin mr-1"></i>' + eventEscapeHtml(event.address) + '</p>' : '';
    const price = '<span class="text-[10px] font-bold text-white">' + eventEscapeHtml(formatEventMoney(event.price)) + '</span>';
    return location + address + '<div class="flex flex-wrap gap-3 mt-2 items-center">' + price + '</div>';
}

async function loadAdminEvents() {
    const container = document.getElementById('admin-events-container');
    if (!container) return;
    const sb = getSupabase();
    if (!sb) return;

    const { data, error } = await sb
        .from('events')
        .select('*, event_bookings(user_id, profiles(id,nome,cognome,telefono,email))')
        .order('datetime', { ascending: true });

    if (error) {
        console.error('Errore caricamento eventi:', error);
        container.innerHTML = '<p class="text-xs text-brand-pink">Errore caricamento eventi: ' + eventEscapeHtml(error.message) + '</p>';
        return;
    }

    window.eventsData = data || [];
    if (!data?.length) {
        container.innerHTML = '<p class="text-xs text-gray-500 italic">Nessun evento programmato.</p>';
        return;
    }

    container.innerHTML = data.map(function(event) {
        const bookings = (event.event_bookings || []).filter(b => b.profiles).map(b => b.profiles);
        const capacity = Number(event.capacity || 20);
        const cover = eventSafeUrl(event.cover_url);
        return '<div class="bg-brand-dark p-5 rounded-2xl border border-brand-pink/30 space-y-3">' +
            (cover ? '<img src="' + eventEscapeHtml(cover) + '" alt="" class="w-full h-36 object-cover rounded-xl border border-brand-border">' : '') +
            '<div class="flex justify-between items-start border-b border-brand-border pb-2 gap-3">' +
                '<div><h4 class="text-base font-black text-white">' + eventEscapeHtml(event.title) + '</h4>' +
                '<span class="text-xs text-brand-pink font-bold">' + formatEventDate(event.datetime) + ' · ' + formatEventTime(event.datetime) + '</span></div>' +
                '<div class="flex items-center gap-2 shrink-0">' +
                    '<button onclick="openEditEventModal(\'' + event.id + '\')" class="px-2.5 py-1 bg-brand-cyan/10 hover:bg-brand-cyan hover:text-black text-brand-cyan border border-brand-cyan/40 text-xs font-bold rounded-lg"><i class="fa-solid fa-pen"></i></button>' +
                    '<button onclick="deleteEvent(\'' + event.id + '\')" class="px-2.5 py-1 bg-brand-pink/10 hover:bg-brand-pink text-brand-pink hover:text-white border border-brand-pink/40 text-xs font-bold rounded-lg" title="Elimina evento"><i class="fa-solid fa-trash"></i></button>' +
                '</div>' +
            '</div>' +
            '<div class="flex flex-wrap gap-2">' +
                '<span class="px-2 py-1 rounded-lg border text-[10px] font-black ' + eventStatusClass(event.status) + '">' + eventEscapeHtml(eventStatusLabel(event.status)) + '</span>' +
                '<span class="px-2 py-1 rounded-lg bg-brand-card border border-brand-border text-[10px] font-bold text-white">' + bookings.length + ' / ' + capacity + ' posti</span>' +
            '</div>' +
            (event.description ? '<p class="text-xs text-gray-300 whitespace-pre-line leading-relaxed">' + eventEscapeHtml(event.description) + '</p>' : '') +
            eventCardMeta(event) +
            (event.registration_deadline ? '<p class="text-[10px] text-gray-500">Iscrizioni fino al ' + formatEventDate(event.registration_deadline) + ' · ' + formatEventTime(event.registration_deadline) + '</p>' : '') +
            '<div><p class="text-xs font-bold text-gray-400 uppercase mb-2">Allieve iscritte:</p>' +
                (bookings.length ? '<ul class="space-y-1.5 max-h-40 overflow-y-auto pr-1">' +
                    bookings.map(function(student) {
                        const booking = (event.event_bookings || []).find(b => b.user_id === student.id);
                        return '<li class="text-xs bg-brand-card p-2 rounded-xl flex justify-between items-center gap-2 border border-brand-border/50">' +
                            '<span class="font-bold text-white"><i class="fa-solid fa-user text-brand-pink mr-1.5"></i>' + eventEscapeHtml((student.nome || '') + ' ' + (student.cognome || '')) + '</span>' +
                            '<div class="flex items-center gap-2"><span class="text-[10px] text-gray-400">' + eventEscapeHtml(student.telefono || student.email || '') + '</span>' +
                            '<button onclick="removeEventBooking(\'' + event.id + '\', \'' + (booking?.user_id || '') + '\')" class="text-brand-pink hover:text-white" title="Rimuovi iscrizione"><i class="fa-solid fa-user-minus"></i></button></div></li>';
                    }).join('') + '</ul>' : '<p class="text-xs italic text-gray-500">Nessuna iscrizione al momento.</p>') +
            '</div></div>';
    }).join('');
}

window.openEditEventModal = function(eventId) {
    const event = (window.eventsData || []).find(item => item.id === eventId);
    if (!event) return;
    document.getElementById('edit-event-id').value = event.id;
    document.getElementById('edit-event-title').value = event.title || '';
    document.getElementById('edit-event-datetime').value = formatEventDatetimeLocal(event.datetime);
    document.getElementById('edit-event-location').value = event.location || '';
    document.getElementById('edit-event-address').value = event.address || '';
    document.getElementById('edit-event-capacity').value = event.capacity || 20;
    document.getElementById('edit-event-price').value = event.price ?? 0;
    document.getElementById('edit-event-deadline').value = formatEventDatetimeLocal(event.registration_deadline);
    document.getElementById('edit-event-status').value = event.status || 'open';
    document.getElementById('edit-event-cover').value = event.cover_url || '';
    document.getElementById('edit-event-description').value = event.description || '';
    document.getElementById('modal-edit-event').classList.remove('hidden');
};

async function uploadEventCover(file, userId) {
    if (!file) return null;
    if (!file.type || !file.type.startsWith('image/')) {
        throw new Error('La copertina deve essere un file immagine.');
    }
    if (file.size > 5 * 1024 * 1024) {
        throw new Error('La copertina non può superare 5 MB.');
    }
    const sb = getSupabase();
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const path = userId + '/' + Date.now() + '_' + Math.random().toString(36).slice(2) + '.' + ext;
    const { error } = await sb.storage.from('event-covers').upload(path, file, { upsert: false, contentType: file.type });
    if (error) throw error;
    const { data } = sb.storage.from('event-covers').getPublicUrl(path);
    return data?.publicUrl || null;
}

async function handleCreateEvent(e) {
    e.preventDefault();
    const sb = getSupabase();
    const userId = (typeof currentSessionData !== 'undefined' ? currentSessionData?.user?.id : null) || window.currentUser?.id;
    const title = document.getElementById('event-title').value.trim();
    const datetimeValue = document.getElementById('event-datetime').value;
    const datetime = datetimeValue ? new Date(datetimeValue).toISOString() : null;
    const location = document.getElementById('event-location').value.trim();
    const address = document.getElementById('event-address').value.trim();
    const description = document.getElementById('event-description').value.trim();
    const capacity = parseInt(document.getElementById('event-capacity').value, 10);
    const price = Math.max(0, Number(document.getElementById('event-price').value || 0));
    const deadlineValue = document.getElementById('event-deadline').value;
    const registration_deadline = deadlineValue ? new Date(deadlineValue).toISOString() : null;
    const status = document.getElementById('event-status').value;
    let cover_url = document.getElementById('event-cover').value.trim() || null;
    const coverFile = document.getElementById('event-cover-file')?.files?.[0];

    if (!userId || !title || !datetime || !capacity || capacity < 1 || !status) {
        alert('Compila i campi obbligatori.');
        return;
    }

    if (registration_deadline && new Date(registration_deadline) > new Date(datetime)) {
        alert('La scadenza iscrizioni non può essere dopo la data dell’evento.');
        return;
    }

    if (coverFile) {
        try {
            cover_url = await uploadEventCover(coverFile, userId);
        } catch (uploadError) {
            alert('Errore caricamento copertina: ' + uploadError.message);
            return;
        }
    }

    const { error } = await sb.from('events').insert([{
        title, description, datetime, location: location || null, address: address || null,
        capacity, price, registration_deadline, status, cover_url, created_by: userId
    }]);

    if (error) {
        alert('Errore durante la creazione dell’evento: ' + error.message);
        return;
    }

    document.getElementById('form-create-event').reset();
    document.getElementById('event-capacity').value = 20;
    document.getElementById('event-price').value = 0;
    document.getElementById('event-status').value = 'open';
    document.getElementById('modal-create-event').classList.add('hidden');
    await loadAdminEvents();
    alert('Evento creato con successo!');
}

async function handleUpdateEvent(e) {
    e.preventDefault();
    const sb = getSupabase();
    const id = document.getElementById('edit-event-id').value;
    const title = document.getElementById('edit-event-title').value.trim();
    const datetimeValue = document.getElementById('edit-event-datetime').value;
    const datetime = datetimeValue ? new Date(datetimeValue).toISOString() : null;
    const location = document.getElementById('edit-event-location').value.trim();
    const address = document.getElementById('edit-event-address').value.trim();
    const description = document.getElementById('edit-event-description').value.trim();
    const capacity = parseInt(document.getElementById('edit-event-capacity').value, 10);
    const price = Math.max(0, Number(document.getElementById('edit-event-price').value || 0));
    const deadlineValue = document.getElementById('edit-event-deadline').value;
    const registration_deadline = deadlineValue ? new Date(deadlineValue).toISOString() : null;
    const status = document.getElementById('edit-event-status').value;
    let cover_url = document.getElementById('edit-event-cover').value.trim() || null;
    const coverFile = document.getElementById('edit-event-cover-file')?.files?.[0];

    if (!id || !title || !datetime || !capacity || capacity < 1 || !status) {
        alert('Compila i campi obbligatori.');
        return;
    }
    if (registration_deadline && new Date(registration_deadline) > new Date(datetime)) {
        alert('La scadenza iscrizioni non può essere dopo la data dell’evento.');
        return;
    }

    if (coverFile) {
        try {
            cover_url = await uploadEventCover(coverFile, (typeof currentSessionData !== 'undefined' ? currentSessionData?.user?.id : null));
        } catch (uploadError) {
            alert('Errore caricamento copertina: ' + uploadError.message);
            return;
        }
    }

    const { error } = await sb.from('events').update({
        title, description, datetime, location: location || null, address: address || null,
        capacity, price, registration_deadline, status, cover_url, updated_at: new Date().toISOString()
    }).eq('id', id);

    if (error) {
        alert('Errore durante la modifica: ' + error.message);
        return;
    }

    await notifyEventAttendees(id, 'Evento aggiornato', 'L’evento "' + title + '" è stato aggiornato. Controlla i nuovi dettagli.', 'info');
    document.getElementById('modal-edit-event').classList.add('hidden');
    await loadAdminEvents();
    alert('Evento aggiornato con successo!');
}

window.deleteEvent = async function(eventId) {
    const event = (window.eventsData || []).find(item => item.id === eventId);
    if (!event) return;
    if (!confirm('Eliminare definitivamente "' + event.title + '"? Le iscrizioni verranno cancellate.')) return;

    const sb = getSupabase();
    await notifyEventAttendees(eventId, 'Evento annullato', 'L’evento "' + event.title + '" è stato annullato.', 'warning');
    const { error } = await sb.from('events').delete().eq('id', eventId);
    if (error) {
        alert('Errore eliminazione evento: ' + error.message);
        return;
    }
    await loadAdminEvents();
};

window.removeEventBooking = async function(eventId, userId) {
    if (!eventId || !userId || !confirm('Rimuovere questa iscrizione?')) return;
    const sb = getSupabase();
    const { error } = await sb.from('event_bookings').delete().eq('event_id', eventId).eq('user_id', userId);
    if (error) {
        alert('Impossibile rimuovere l’iscrizione: ' + error.message);
        return;
    }
    await notifyEventAttendees(eventId, 'Iscrizione evento rimossa', 'La tua iscrizione a un evento è stata rimossa dall’istruttore.', 'warning');
    await loadAdminEvents();
};

async function loadAvailableEvents(userId) {
    const container = document.getElementById('student-events-list');
    if (!container) return;
    const sb = getSupabase();

    const { data: events, error } = await sb
        .from('events')
        .select('*, event_bookings(user_id)')
        .gte('datetime', new Date().toISOString())
        .order('datetime', { ascending: true });

    if (error) {
        console.error('Errore recupero eventi:', error);
        container.innerHTML = '<p class="text-xs text-brand-pink">Errore caricamento eventi: ' + eventEscapeHtml(error.message) + '</p>';
        return;
    }

    if (!events?.length) {
        container.innerHTML = '<p class="text-xs text-gray-500 italic">Nessun evento in programma.</p>';
        return;
    }

    const eventIds = events.map(e => e.id);
    const participantsResult = await sb.rpc('get_event_participants', { p_event_ids: eventIds });
    if (participantsResult.error) {
        console.error('Errore caricamento partecipanti eventi:', participantsResult.error);
    }

    const participantsByEvent = {};
    (participantsResult.data || []).forEach(function(p) {
        if (!participantsByEvent[p.event_id]) participantsByEvent[p.event_id] = [];
        participantsByEvent[p.event_id].push(p);
    });

    container.innerHTML = events.map(function(event) {
        const bookings = event.event_bookings || [];
        const participants = participantsByEvent[event.id] || [];
        const isBooked = bookings.some(b => b.user_id === userId);
        const bookedCount = bookings.length;
        const capacity = Number(event.capacity || 20);
        const deadlinePassed = eventDeadlinePassed(event);
        const canBook = eventIsBookable(event, bookedCount) && !isBooked;
        const cover = eventSafeUrl(event.cover_url);

        let buttonHtml;
        if (isBooked) {
            buttonHtml = '<div class="w-full py-2.5 bg-brand-lime/10 text-brand-lime border border-brand-lime/30 text-xs font-bold rounded-xl text-center"><i class="fa-solid fa-circle-check mr-1"></i> Iscrizione confermata</div>';
        } else if (event.status === 'cancelled') {
            buttonHtml = '<div class="w-full py-2.5 bg-brand-pink/10 text-brand-pink border border-brand-pink/30 text-xs font-bold rounded-xl text-center">Evento annullato</div>';
        } else if (event.status !== 'open') {
            buttonHtml = '<div class="w-full py-2.5 bg-gray-700/50 text-gray-400 text-xs font-bold rounded-xl text-center">' + eventEscapeHtml(eventStatusLabel(event.status)) + '</div>';
        } else if (deadlinePassed) {
            buttonHtml = '<div class="w-full py-2.5 bg-gray-700/50 text-gray-400 text-xs font-bold rounded-xl text-center">Iscrizioni chiuse</div>';
        } else if (!canBook) {
            buttonHtml = '<button disabled class="w-full py-2.5 bg-gray-700 text-gray-400 text-xs uppercase rounded-xl cursor-not-allowed">Sold Out</button>';
        } else {
            buttonHtml = '<button onclick="toggleEventBooking(\'' + event.id + '\', \'' + userId + '\')" class="w-full py-2.5 bg-brand-pink text-white font-black text-xs uppercase rounded-xl transition hover:opacity-90"><i class="fa-solid fa-calendar-plus mr-1"></i> Iscriviti all’evento</button>';
        }

        return '<div class="bg-brand-dark p-5 rounded-2xl border border-brand-pink/30 flex flex-col justify-between space-y-4">' +
            (cover ? '<img src="' + eventEscapeHtml(cover) + '" alt="" class="w-full h-40 object-cover rounded-xl border border-brand-border">' : '') +
            '<div><div class="flex justify-between items-center mb-2 gap-2">' +
                '<span class="text-xs uppercase font-bold text-brand-pink">' + formatEventDate(event.datetime) + ' · ' + formatEventTime(event.datetime) + '</span>' +
                '<span class="text-[10px] px-2 py-0.5 rounded-full font-bold ' + (bookedCount >= capacity ? 'bg-brand-pink/20 text-brand-pink border border-brand-pink/40' : 'bg-brand-lime/20 text-brand-lime border border-brand-lime/40') + '">' + bookedCount + '/' + capacity + ' Posti</span></div>' +
                '<h4 class="text-base font-black text-white">' + eventEscapeHtml(event.title) + '</h4>' +
                '<button type="button" onclick="openParticipantsModal(\'event\', \'' + event.id + '\')" class="mt-3 text-[10px] font-black uppercase text-brand-cyan hover:underline"><i class="fa-solid fa-users mr-1"></i> Chi viene? (' + participants.length + ')</button>' +
                eventCardMeta(event) +
                (event.description ? '<p class="text-xs text-gray-300 mt-2 whitespace-pre-line leading-relaxed">' + eventEscapeHtml(event.description) + '</p>' : '') +
                (event.registration_deadline ? '<p class="text-[10px] text-gray-500 mt-2">Iscrizioni fino al ' + formatEventDate(event.registration_deadline) + ' · ' + formatEventTime(event.registration_deadline) + '</p>' : '') +
            '</div><div>' + buttonHtml + '</div></div>';
    }).join('');
}

window.openParticipantsModal = async function(kind, itemId) {
    const modal = document.getElementById('modal-participants');
    const title = document.getElementById('participants-modal-title');
    const list = document.getElementById('participants-modal-list');
    if (!modal || !title || !list) return;

    title.textContent = kind === 'event' ? 'Chi viene all’evento?' : 'Chi viene alla lezione?';
    list.innerHTML = '<p class="text-xs text-gray-500 italic text-center py-4"><i class="fa-solid fa-spinner fa-spin mr-1"></i> Caricamento partecipanti...</p>';
    modal.classList.remove('hidden');

    const sb = getSupabase();
    const rpcName = kind === 'event' ? 'get_event_participants' : 'get_lesson_participants';
    const argName = kind === 'event' ? 'p_event_ids' : 'p_lesson_ids';
    const { data, error } = await sb.rpc(rpcName, { [argName]: [itemId] });

    if (error) {
        console.error('Errore elenco partecipanti:', error);
        list.innerHTML = '<p class="text-xs text-brand-pink text-center py-4">Non è stato possibile caricare l’elenco delle partecipanti.</p>';
        return;
    }

    const participants = data || [];
    if (!participants.length) {
        list.innerHTML = '<p class="text-xs text-gray-500 italic text-center py-4">Ancora nessuna prenotazione.</p>';
        return;
    }

    list.innerHTML = '<div class="space-y-2">' + participants.map(function(p) {
        const fullName = ((p.nome || '') + ' ' + (p.cognome || '')).trim() || 'Allieva';
        return '<div class="flex items-center gap-3 bg-brand-card border border-brand-border rounded-xl p-3">' +
            '<div class="w-8 h-8 rounded-full bg-brand-pink/10 border border-brand-pink/30 flex items-center justify-center shrink-0">' +
                '<i class="fa-solid fa-user text-brand-pink text-xs"></i>' +
            '</div>' +
            '<span class="text-sm font-bold text-white">' + eventEscapeHtml(fullName) + '</span>' +
        '</div>';
    }).join('') + '</div>' +
    '<p class="text-[10px] text-gray-500 mt-3 text-center"><i class="fa-solid fa-car-side mr-1"></i> Usa questo elenco per accordarti privatamente con le altre partecipanti sul viaggio. Nessun numero di telefono o altro recapito viene mostrato.</p>';
};

window.toggleEventBooking = async function(eventId, userId) {
    const sb = getSupabase();
    if (!sb) return;
    try {
        const { error } = await sb.rpc('book_event', { p_event_id: eventId });
        if (error) throw error;

        const { data: event } = await sb.from('events').select('title').eq('id', eventId).single();
        if (typeof createNotification === 'function' && event) {
            await createNotification(userId, 'Iscrizione evento confermata', 'La tua iscrizione a "' + event.title + '" è stata registrata.', 'success');
        }
        await loadAvailableEvents(userId);
        if (typeof loadNotifications === 'function') await loadNotifications(userId);
    } catch (error) {
        console.error('Errore iscrizione evento:', error);
        alert('Impossibile completare l’iscrizione: ' + (error.message || error));
    }
};

function subscribeToEventRealtime(mode, userId) {
    const sb = getSupabase();
    if (!sb || window.eventRealtimeChannel) return;
    const channel = sb.channel('events-dashboard-' + mode + '-' + userId);
    channel
        .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, async () => {
            if (mode === 'admin') await loadAdminEvents();
            else await loadAvailableEvents(userId);
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'event_bookings' }, async () => {
            if (mode === 'admin') await loadAdminEvents();
            else await loadAvailableEvents(userId);
        })
        .subscribe();
    window.eventRealtimeChannel = channel;
}

document.addEventListener('DOMContentLoaded', function() {
    const createModal = document.getElementById('modal-create-event');
    const editModal = document.getElementById('modal-edit-event');
    document.getElementById('btn-open-create-event-modal')?.addEventListener('click', () => createModal?.classList.remove('hidden'));
    document.getElementById('btn-close-create-event')?.addEventListener('click', () => createModal?.classList.add('hidden'));
    document.getElementById('btn-cancel-create-event')?.addEventListener('click', () => createModal?.classList.add('hidden'));
    document.getElementById('btn-close-edit-event')?.addEventListener('click', () => editModal?.classList.add('hidden'));
    document.getElementById('btn-cancel-edit-event')?.addEventListener('click', () => editModal?.classList.add('hidden'));
    document.getElementById('btn-close-participants')?.addEventListener('click', () => document.getElementById('modal-participants')?.classList.add('hidden'));
    document.getElementById('btn-close-participants-bottom')?.addEventListener('click', () => document.getElementById('modal-participants')?.classList.add('hidden'));
    document.getElementById('form-create-event')?.addEventListener('submit', handleCreateEvent);
    document.getElementById('form-edit-event')?.addEventListener('submit', handleUpdateEvent);
});

window.loadAvailableEvents = loadAvailableEvents;
window.loadAdminEvents = loadAdminEvents;
window.subscribeToEventRealtime = subscribeToEventRealtime;
