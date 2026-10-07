/* Gestione eventi organizzati */
function eventEscapeHtml(value) {
    if (!value) return '';
    return String(value)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function formatEventDate(value) {
    const d = new Date(value);
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString('it-IT', {
        weekday: 'short', day: '2-digit', month: 'short'
    });
}

function formatEventTime(value) {
    const d = new Date(value);
    return isNaN(d.getTime()) ? '' : d.toLocaleTimeString('it-IT', {
        hour: '2-digit', minute: '2-digit'
    });
}

async function loadAdminEvents() {
    const container = document.getElementById('admin-events-container');
    if (!container) return;
    const sb = getSupabase();

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

    if (!data || !data.length) {
        container.innerHTML = '<p class="text-xs text-gray-500 italic">Nessun evento programmato.</p>';
        return;
    }

    container.innerHTML = data.map(function(event) {
        const bookings = (event.event_bookings || []).map(function(b) { return b.profiles; }).filter(Boolean);
        const capacity = event.capacity || 20;
        const full = bookings.length >= capacity;
        return '<div class="bg-brand-dark p-5 rounded-2xl border border-brand-pink/30 space-y-3">' +
            '<div class="flex justify-between items-start border-b border-brand-border pb-2 gap-3">' +
                '<div><h4 class="text-base font-black text-white">' + eventEscapeHtml(event.title) + '</h4>' +
                '<span class="text-xs text-brand-pink font-bold">' + formatEventDate(event.datetime) + ' · ' + formatEventTime(event.datetime) + '</span></div>' +
                '<div class="flex items-center gap-2 shrink-0">' +
                    '<button onclick="openEditEventModal(\'' + event.id + '\')" class="px-2.5 py-1 bg-brand-cyan/10 hover:bg-brand-cyan hover:text-black text-brand-cyan border border-brand-cyan/40 text-xs font-bold rounded-lg"><i class="fa-solid fa-pen"></i> Modifica</button>' +
                    '<span class="text-xs bg-brand-card px-2.5 py-1 rounded-lg text-white font-bold border border-brand-border">' + bookings.length + ' / ' + capacity + '</span>' +
                '</div>' +
            '</div>' +
            (event.description ? '<p class="text-xs text-gray-400">' + eventEscapeHtml(event.description) + '</p>' : '') +
            (event.location ? '<p class="text-[10px] text-brand-cyan font-bold uppercase"><i class="fa-solid fa-location-dot mr-1"></i>' + eventEscapeHtml(event.location) + '</p>' : '') +
            '<div><p class="text-xs font-bold text-gray-400 uppercase mb-2">Allieve iscritte:</p>' +
                (bookings.length ? '<ul class="space-y-1.5 max-h-36 overflow-y-auto pr-1">' +
                    bookings.map(function(student) {
                        return '<li class="text-xs bg-brand-card p-2 rounded-xl flex justify-between items-center border border-brand-border/50">' +
                            '<span class="font-bold text-white"><i class="fa-solid fa-user text-brand-pink mr-1.5"></i>' + eventEscapeHtml(student.nome + ' ' + student.cognome) + '</span>' +
                            '<span class="text-[10px] text-gray-400">' + eventEscapeHtml(student.telefono || student.email || '') + '</span></li>';
                    }).join('') + '</ul>'
                : '<p class="text-xs italic text-gray-500">Nessuna iscrizione al momento.</p>') +
            '</div></div>';
    }).join('');
}

window.openEditEventModal = function(eventId) {
    const event = (window.eventsData || []).find(function(item) { return item.id === eventId; });
    if (!event) return;
    document.getElementById('edit-event-id').value = event.id;
    document.getElementById('edit-event-title').value = event.title || '';
    document.getElementById('edit-event-datetime').value = formatEventDatetimeLocal(event.datetime);
    document.getElementById('edit-event-location').value = event.location || '';
    document.getElementById('edit-event-capacity').value = event.capacity || 20;
    document.getElementById('edit-event-description').value = event.description || '';
    document.getElementById('modal-edit-event').classList.remove('hidden');
};

function formatEventDatetimeLocal(value) {
    const d = new Date(value);
    if (isNaN(d.getTime())) return '';
    const pad = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
        'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

async function handleCreateEvent(e) {
    e.preventDefault();
    const sb = getSupabase();
    const title = document.getElementById('event-title').value.trim();
    const datetimeValue = document.getElementById('event-datetime').value;
    const datetime = datetimeValue ? new Date(datetimeValue).toISOString() : null;
    const location = document.getElementById('event-location').value.trim();
    const description = document.getElementById('event-description').value.trim();
    const capacity = parseInt(document.getElementById('event-capacity').value, 10);

    if (!title || !datetime || !capacity || capacity < 1) {
        alert('Compila tutti i campi obbligatori.');
        return;
    }

    const { error } = await sb.from('events').insert([{
        title, description, datetime, location: location || null,
        capacity, created_by: currentSessionData.user.id
    }]);

    if (error) {
        alert('Errore durante la creazione dell’evento: ' + error.message);
        return;
    }

    document.getElementById('form-create-event').reset();
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
    const description = document.getElementById('edit-event-description').value.trim();
    const capacity = parseInt(document.getElementById('edit-event-capacity').value, 10);

    if (!id || !title || !datetime || !capacity || capacity < 1) {
        alert('Compila tutti i campi obbligatori.');
        return;
    }

    const { error } = await sb.from('events').update({
        title, description, datetime, location: location || null, capacity
    }).eq('id', id);

    if (error) {
        alert('Errore durante la modifica: ' + error.message);
        return;
    }

    document.getElementById('modal-edit-event').classList.add('hidden');
    await loadAdminEvents();
    alert('Evento aggiornato con successo!');
}

async function loadAvailableEvents(userId) {
    const container = document.getElementById('student-events-list');
    if (!container) return;

    const sb = getSupabase();
    const { data: events, error } = await sb
        .from('events')
        .select('*, event_bookings(user_id)')
        .order('datetime', { ascending: true });

    if (error) {
        console.error('Errore recupero eventi:', error);
        container.innerHTML = '<p class="text-xs text-brand-pink">Errore caricamento eventi: ' + eventEscapeHtml(error.message) + '</p>';
        return;
    }

    if (!events || !events.length) {
        container.innerHTML = '<p class="text-xs text-gray-500 italic">Nessun evento in programma.</p>';
        return;
    }

    container.innerHTML = events.map(function(event) {
        const bookings = event.event_bookings || [];
        const isBooked = bookings.some(function(b) { return b.user_id === userId; });
        const bookedCount = bookings.length;
        const capacity = event.capacity || 20;
        const isFull = bookedCount >= capacity && !isBooked;

        let buttonHtml;
        if (isBooked) {
            buttonHtml = '<div class="w-full py-2.5 bg-brand-pink/10 text-brand-pink border border-brand-pink/30 text-xs font-bold rounded-xl text-center"><i class="fa-solid fa-circle-check mr-1"></i> Iscrizione confermata</div>';
        } else if (isFull) {
            buttonHtml = '<button disabled class="w-full py-2.5 bg-gray-700 text-gray-400 text-xs uppercase rounded-xl cursor-not-allowed">Sold Out</button>';
        } else {
            buttonHtml = '<button onclick="toggleEventBooking(\'' + event.id + '\', \'' + userId + '\')" class="w-full py-2.5 bg-brand-pink text-white font-black text-xs uppercase rounded-xl transition hover:opacity-90"><i class="fa-solid fa-calendar-plus mr-1"></i> Iscriviti all’evento</button>';
        }

        return '<div class="bg-brand-dark p-5 rounded-2xl border border-brand-pink/30 flex flex-col justify-between space-y-4">' +
            '<div>' +
                '<div class="flex justify-between items-center mb-2 gap-2">' +
                    '<span class="text-xs uppercase font-bold text-brand-pink">' + formatEventDate(event.datetime) + ' · ' + formatEventTime(event.datetime) + '</span>' +
                    '<span class="text-[10px] px-2 py-0.5 rounded-full font-bold ' + (isFull ? 'bg-brand-pink/20 text-brand-pink border border-brand-pink/40' : 'bg-brand-lime/20 text-brand-lime border border-brand-lime/40') + '">' +
                        bookedCount + '/' + capacity + ' Posti' +
                    '</span>' +
                '</div>' +
                '<h4 class="text-base font-black text-white">' + eventEscapeHtml(event.title) + '</h4>' +
                (event.location ? '<p class="text-[10px] text-brand-cyan font-bold uppercase mt-2"><i class="fa-solid fa-location-dot mr-1"></i>' + eventEscapeHtml(event.location) + '</p>' : '') +
                (event.description ? '<p class="text-xs text-gray-400 mt-2 leading-relaxed">' + eventEscapeHtml(event.description) + '</p>' : '') +
            '</div><div>' + buttonHtml + '</div></div>';
    }).join('');
}

window.toggleEventBooking = async function(eventId, userId) {
    const sb = getSupabase();
    try {
        const { data: existing } = await sb.from('event_bookings').select('id').eq('event_id', eventId).eq('user_id', userId).maybeSingle();
        if (existing) {
            alert('Sei già iscritta a questo evento.');
            return;
        }

        const { data: event } = await sb.from('events').select('title,capacity,event_bookings(user_id)').eq('id', eventId).single();
        const count = event?.event_bookings?.length || 0;
        if (count >= (event?.capacity || 20)) {
            alert('Evento al completo.');
            return;
        }

        const { error } = await sb.from('event_bookings').insert([{ event_id: eventId, user_id: userId }]);
        if (error) throw error;

        if (typeof createNotification === 'function') {
            await createNotification(userId, 'Iscrizione evento confermata', 'La tua iscrizione a "' + event.title + '" è stata registrata.', 'success');
        }

        await loadAvailableEvents(userId);
        if (typeof loadNotifications === 'function') await loadNotifications(userId);
    } catch (error) {
        console.error('Errore iscrizione evento:', error);
        alert('Impossibile completare l’iscrizione: ' + error.message);
    }
};
