// Gestione presenze lezioni - solo istruttore
async function loadAttendanceHistory() {
    const container = document.getElementById('attendance-history-container');
    if (!container) return;

    const sb = getSupabase();
    const result = await sb
        .from('attendance_records')
        .select('id,status,guest_name,checked_at,lesson_id,user_id')
        .order('checked_at', { ascending: false })
        .limit(200);

    if (result.error) {
        console.error('Errore storico presenze:', result.error);
        container.innerHTML = '<p class="text-xs text-brand-pink">Impossibile caricare lo storico. Applica prima la migrazione Supabase delle presenze.</p>';
        return;
    }

    if (!result.data || result.data.length === 0) {
        container.innerHTML = '<p class="text-xs text-gray-500 italic">Nessuna presenza registrata.</p>';
        return;
    }

    const grouped = {};
    result.data.forEach(function(row) {
        const lesson = (window.lessonsData || []).find(function(l) { return l.id === row.lesson_id; }) || {};
        const key = row.lesson_id || row.id;
        if (!grouped[key]) {
            grouped[key] = { title: lesson.title || 'Lezione', datetime: lesson.datetime, rows: [] };
        }
        grouped[key].rows.push(row);
    });

    container.innerHTML = Object.keys(grouped).map(function(key) {
        const group = grouped[key];
        const date = group.datetime ? new Date(group.datetime) : null;
        const dateLabel = date ? date.toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: 'short' }) : '-';
        const timeLabel = date ? date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : '';
        const present = group.rows.filter(function(r) { return r.status === 'present'; }).length;
        const absent = group.rows.filter(function(r) { return r.status === 'absent'; }).length;

        return '<div class="bg-brand-dark rounded-2xl border border-brand-border p-4">' +
            '<div class="flex flex-wrap justify-between gap-2 items-center mb-3">' +
                '<div><div class="text-sm font-black text-white">' + escapeHtml(group.title) + '</div>' +
                '<div class="text-[10px] text-brand-cyan font-bold uppercase">' + dateLabel + ' ' + timeLabel + '</div></div>' +
                '<div class="flex gap-2 text-[10px] font-black uppercase">' +
                    '<span class="px-2 py-1 rounded-lg bg-brand-lime/10 text-brand-lime">' + present + ' presenti</span>' +
                    '<span class="px-2 py-1 rounded-lg bg-brand-pink/10 text-brand-pink">' + absent + ' assenti</span>' +
                '</div>' +
            '</div>' +
            '<div class="space-y-1.5">' +
                group.rows.map(function(row) {
                    const profile = row.user_id
                        ? (window.lessonsData || []).flatMap(function(l) { return (l.bookings || []).map(function(b) { return b.profiles; }); }).find(function(p) { return p && p.id === row.user_id; })
                        : null;
                    const name = profile
                        ? ((profile.nome || '') + ' ' + (profile.cognome || '')).trim()
                        : (row.guest_name || 'Partecipante');
                    const icon = row.status === 'present' ? 'fa-circle-check text-brand-lime' : 'fa-circle-xmark text-brand-pink';
                    const type = row.user_id ? '' : 'New entry';
                    return '<div class="flex justify-between items-center text-xs bg-brand-card rounded-xl px-3 py-2">' +
                        '<span class="font-bold text-white"><i class="fa-solid ' + icon + ' mr-2"></i>' + escapeHtml(name) + '</span>' +
                        '<span class="text-[9px] text-gray-500 uppercase">' + type + '</span></div>';
                }).join('') +
            '</div></div>';
    }).join('');
}

window.openAttendanceModal = async function(lessonId) {
    const lesson = (window.lessonsData || []).find(function(l) { return l.id === lessonId; });
    const modal = document.getElementById('modal-attendance');
    const list = document.getElementById('attendance-list');
    if (!lesson || !modal || !list) return;

    document.getElementById('attendance-lesson-id').value = lessonId;
    const date = new Date(lesson.datetime);
    document.getElementById('attendance-lesson-title').textContent =
        (lesson.title || 'Lezione') + ' · ' +
        date.toLocaleDateString('it-IT') + ' ' +
        date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

    list.innerHTML = '<p class="text-xs text-gray-500">Caricamento elenco...</p>';

    const sb = getSupabase();
    const bookingsResult = await sb.from('bookings').select('user_id,profiles(id,nome,cognome)').eq('lesson_id', lessonId);
    const recordsResult = await sb.from('attendance_records').select('id,user_id,guest_name,status').eq('lesson_id', lessonId);

    if (bookingsResult.error || recordsResult.error) {
        console.error('Errore caricamento presenze:', bookingsResult.error || recordsResult.error);
        list.innerHTML = '<p class="text-xs text-brand-pink">Errore nel caricamento. Verifica la migrazione Supabase delle presenze.</p>';
        modal.classList.remove('hidden');
        return;
    }

    const recordByUser = {};
    (recordsResult.data || []).forEach(function(r) {
        if (r.user_id) recordByUser[r.user_id] = r;
    });

    let html = '<div class="space-y-2">';
    if ((bookingsResult.data || []).length === 0) {
        html += '<p class="text-xs text-gray-500">Nessuna prenotazione per questa lezione.</p>';
    } else {
        (bookingsResult.data || []).forEach(function(b) {
            const p = b.profiles || {};
            const name = ((p.nome || '') + ' ' + (p.cognome || '')).trim() || 'Allieva';
            const record = recordByUser[b.user_id];
            const checked = record ? record.status === 'present' : false;
            html += '<label class="flex items-center justify-between gap-3 bg-brand-card border border-brand-border rounded-xl p-3 cursor-pointer">' +
                '<span class="text-sm font-bold text-white">' + escapeHtml(name) + ' <span class="text-[9px] text-gray-500 uppercase ml-1">prenotata</span></span>' +
                '<input type="checkbox" class="attendance-registered w-5 h-5" data-user-id="' + escapeHtml(b.user_id) + '"' + (checked ? ' checked' : '') + '>' +
                '</label>';
        });
    }
    html += '</div>';

    const guests = (recordsResult.data || []).filter(function(r) { return !r.user_id; });
    html += '<div class="border-t border-brand-border pt-4 mt-4">' +
        '<div class="flex justify-between items-center mb-2"><div class="text-xs font-black uppercase text-gray-300">Partecipanti extra / New entry</div>' +
        '<button type="button" id="btn-add-attendance-guest" class="px-3 py-2 bg-brand-cyan/10 border border-brand-cyan/30 text-brand-cyan rounded-xl text-[10px] font-black uppercase"><i class="fa-solid fa-plus mr-1"></i>Aggiungi nome</button></div>' +
        '<div id="attendance-guests" class="space-y-2">';

    guests.forEach(function(g) {
        html += '<div class="attendance-guest-row flex items-center gap-2 bg-brand-card border border-brand-border rounded-xl p-2">' +
            '<input type="text" class="attendance-guest-name flex-1 bg-brand-dark border border-brand-border rounded-lg px-3 py-2 text-xs text-white" value="' + escapeHtml(g.guest_name || '') + '">' +
            '<select class="attendance-guest-status bg-brand-dark border border-brand-border rounded-lg px-2 py-2 text-xs text-white">' +
            '<option value="present"' + (g.status === 'present' ? ' selected' : '') + '>Presente</option>' +
            '<option value="absent"' + (g.status === 'absent' ? ' selected' : '') + '>Assente</option></select>' +
            '<button type="button" class="attendance-remove-guest px-2 text-brand-pink" title="Rimuovi"><i class="fa-solid fa-xmark"></i></button></div>';
    });

    html += '</div><p class="text-[10px] text-gray-500 mt-2">Inserisci anche un’allieva già iscritta che non aveva prenotato oppure una nuova partecipante non ancora registrata.</p></div>';
    list.innerHTML = html;

    document.getElementById('btn-add-attendance-guest').onclick = function() {
        const wrap = document.getElementById('attendance-guests');
        const row = document.createElement('div');
        row.className = 'attendance-guest-row flex items-center gap-2 bg-brand-card border border-brand-border rounded-xl p-2';
        row.innerHTML = '<input type="text" class="attendance-guest-name flex-1 bg-brand-dark border border-brand-border rounded-lg px-3 py-2 text-xs text-white" placeholder="Nome e cognome">' +
            '<select class="attendance-guest-status bg-brand-dark border border-brand-border rounded-lg px-2 py-2 text-xs text-white"><option value="present">Presente</option><option value="absent">Assente</option></select>' +
            '<button type="button" class="attendance-remove-guest px-2 text-brand-pink" title="Rimuovi"><i class="fa-solid fa-xmark"></i></button>';
        wrap.appendChild(row);
    };

    list.onclick = function(event) {
        const btn = event.target.closest('.attendance-remove-guest');
        if (btn) btn.closest('.attendance-guest-row').remove();
    };

    modal.classList.remove('hidden');
};

window.saveAttendance = async function() {
    const lessonId = document.getElementById('attendance-lesson-id').value;
    const list = document.getElementById('attendance-list');
    if (!lessonId || !list) return;

    const sb = getSupabase();
    const registered = Array.from(list.querySelectorAll('.attendance-registered'));
    const guests = Array.from(list.querySelectorAll('.attendance-guest-row')).map(function(row) {
        return {
            guest_name: row.querySelector('.attendance-guest-name').value.trim(),
            status: row.querySelector('.attendance-guest-status').value
        };
    }).filter(function(g) { return g.guest_name; });

    const payload = registered.map(function(input) {
        return {
            lesson_id: lessonId,
            user_id: input.dataset.userId,
            status: input.checked ? 'present' : 'absent',
            checked_by: currentSessionData.user.id,
            checked_at: new Date().toISOString()
        };
    });

    const deleteResult = await sb.from('attendance_records').delete().eq('lesson_id', lessonId).is('user_id', null);
    if (deleteResult.error) {
        alert('Errore nel salvataggio dei partecipanti extra: ' + deleteResult.error.message);
        return;
    }

    if (payload.length) {
        const upsertResult = await sb.from('attendance_records').upsert(payload, { onConflict: 'lesson_id,user_id' });
        if (upsertResult.error) {
            alert('Errore nel salvataggio delle presenze: ' + upsertResult.error.message);
            return;
        }
    }

    if (guests.length) {
        const insertResult = await sb.from('attendance_records').insert(guests.map(function(g) {
            return {
                lesson_id: lessonId,
                guest_name: g.guest_name,
                status: g.status,
                checked_by: currentSessionData.user.id,
                checked_at: new Date().toISOString()
            };
        }));
        if (insertResult.error) {
            alert('Errore nel salvataggio delle new entry: ' + insertResult.error.message);
            return;
        }
    }

    document.getElementById('modal-attendance').classList.add('hidden');
    await loadAttendanceHistory();
    alert('Presenze salvate correttamente.');
};
