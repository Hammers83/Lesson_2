/* ==========================================================================
   SISTEMA NOTIFICHE CONDIVISO
   ========================================================================== */

window.notificationState = window.notificationState || {
    userId: null,
    channel: null,
    pollInterval: null
};

function notificationClient() {
    return window.supabaseClient || window.supabase;
}

function notificationEscapeHtml(value) {
    if (typeof escapeHtml === 'function') return escapeHtml(value);
    return String(value ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

async function initNotifications(userId) {
    if (!userId) return;

    const btn = document.getElementById('btn-notifications');
    const dropdown = document.getElementById('notif-dropdown');

    if (btn && dropdown && !btn.dataset.notificationsBound) {
        btn.dataset.notificationsBound = 'true';
        btn.addEventListener('click', async (event) => {
            event.stopPropagation();
            dropdown.classList.toggle('hidden');
            if (!dropdown.classList.contains('hidden')) {
                await loadNotifications(userId);
            }
        });

        document.addEventListener('click', (event) => {
            if (!btn.contains(event.target) && !dropdown.contains(event.target)) {
                dropdown.classList.add('hidden');
            }
        });
    }

    await loadNotifications(userId);
    subscribeToRealtimeNotifications(userId);

    // Fallback: se il Realtime Supabase non è disponibile, la campanella
    // resta comunque aggiornata senza richiedere un refresh della pagina.
    if (window.notificationState.pollInterval) {
        clearInterval(window.notificationState.pollInterval);
    }
    window.notificationState.pollInterval = setInterval(() => {
        loadNotifications(userId);
    }, 30000);
}

async function loadNotifications(userId) {
    const sb = notificationClient();
    const container = document.getElementById('notif-list-container');
    const badge = document.getElementById('notif-badge');

    if (!sb || !container) return;

    const { data: list, error } = await sb
        .from('notifications')
        .select('id, user_id, title, message, type, is_read, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(15);

    if (error) {
        console.error('Errore caricamento notifiche:', error);
        container.innerHTML = `
            <p class="text-xs text-brand-pink text-center py-4">
                Impossibile caricare le notifiche.
            </p>`;
        if (badge) badge.classList.add('hidden');
        return;
    }

    const notifications = list || [];
    const unreadCount = notifications.filter(n => !n.is_read).length;

    if (badge) {
        if (unreadCount > 0) {
            badge.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }

    if (notifications.length === 0) {
        container.innerHTML = `<p class="text-xs text-gray-500 text-center py-4">Nessuna notifica presente.</p>`;
        return;
    }

    container.innerHTML = notifications.map(n => {
        let iconClass = 'fa-circle-info text-brand-cyan';
        if (n.type === 'warning') iconClass = 'fa-triangle-exclamation text-yellow-400';
        if (n.type === 'success') iconClass = 'fa-circle-check text-brand-lime';
        if (n.type === 'chat') iconClass = 'fa-comment text-brand-pink';

        const createdAt = new Date(n.created_at);
        const date = Number.isNaN(createdAt.getTime())
            ? ''
            : createdAt.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' });
        const time = Number.isNaN(createdAt.getTime())
            ? ''
            : createdAt.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

        return `
            <div class="p-3 rounded-xl border ${n.is_read
                ? 'bg-brand-card/40 border-brand-border/40'
                : 'bg-brand-card border-brand-cyan/40'} flex gap-3 items-start transition">
                <i class="fa-solid ${iconClass} mt-0.5 text-sm"></i>
                <div class="flex-grow space-y-0.5">
                    <div class="flex justify-between items-center gap-2">
                        <h5 class="text-xs font-bold text-white">${notificationEscapeHtml(n.title)}</h5>
                        <span class="text-[9px] text-gray-400 whitespace-nowrap">${date} ${time}</span>
                    </div>
                    <p class="text-[11px] text-gray-300 leading-snug">${notificationEscapeHtml(n.message)}</p>
                </div>
            </div>`;
    }).join('');
}

// Compatibilità con la chat: aggiorna la campanella notifiche.
window.updateNotificationBadge = async function(userId = null) {
    const id = userId || window.notificationState?.userId || window.currentSessionData?.user?.id || window.currentUserProfile?.id;
    if (!id) return;
    await loadNotifications(id);
};

async function createNotification(userId, title, message, type = 'info') {
    const sb = notificationClient();
    if (!sb || !userId) {
        console.error('Notifica non creata: client Supabase o userId mancanti.');
        return { success: false, error: new Error('Client Supabase/userId mancante') };
    }

    const { data, error } = await sb.from('notifications').insert([{
        user_id: userId,
        title,
        message,
        type,
        is_read: false
    }]).select().single();

    if (error) {
        console.error('Errore creazione notifica:', error);
        return { success: false, error };
    }

    return { success: true, data };
}

window.markAllNotificationsAsRead = async function() {
    const userId = window.notificationState?.userId || window.currentSessionData?.user?.id;
    if (!userId) return;

    const sb = notificationClient();
    const { error } = await sb
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', userId)
        .eq('is_read', false);

    if (error) {
        console.error('Errore marcatura notifiche:', error);
        return;
    }

    await loadNotifications(userId);
};


async function checkCertExpirationNotification(userId, profile) {
    const dataScad = profile?.medical_certificate_expiration || profile?.certificato_scadenza;
    if (!dataScad) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const expDate = new Date(dataScad);
    expDate.setHours(0, 0, 0, 0);

    if (Number.isNaN(expDate.getTime())) return;

    const diffDays = Math.ceil((expDate - today) / 86400000);
    if (diffDays > 15) return;

    const sb = notificationClient();
    const since = new Date();
    since.setHours(0, 0, 0, 0);

    // Deduplica per tipo e giorno: una notifica di scadenza non deve
    // bloccare eventuali altre notifiche warning.
    const { data: existing, error } = await sb
        .from('notifications')
        .select('id')
        .eq('user_id', userId)
        .eq('type', 'warning')
        .in('title', ['Certificato Scaduto!', 'Certificato in Scadenza'])
        .gte('created_at', since.toISOString())
        .limit(1);

    if (error) {
        console.error('Errore controllo notifica certificato:', error);
        return;
    }

    if (existing?.length) return;

    if (diffDays <= 0) {
        await createNotification(
            userId,
            'Certificato Scaduto!',
            'Il tuo certificato medico è scaduto. Puoi caricarne uno nuovo dal tuo profilo.',
            'warning'
        );
    } else {
        await createNotification(
            userId,
            'Certificato in Scadenza',
            `Il tuo certificato medico scadrà tra ${diffDays} giorni. Ricordati di rinnovarlo!`,
            'warning'
        );
    }
}

function subscribeToRealtimeNotifications(userId) {
    const sb = notificationClient();
    if (!sb) return;

    if (window.notificationState.channel) {
        sb.removeChannel(window.notificationState.channel);
        window.notificationState.channel = null;
    }

    const channel = sb.channel(`user-notifications-${userId}`);

    channel
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${userId}`
        }, async () => {
            await loadNotifications(userId);
        })
        .subscribe((status, error) => {
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                console.error('Realtime notifiche non disponibile:', error || status);
            }
        });

    window.notificationState = { userId, channel };
}

window.addEventListener('beforeunload', () => {
    const sb = notificationClient();
    const channel = window.notificationState?.channel;
    const pollInterval = window.notificationState?.pollInterval;
    if (pollInterval) clearInterval(pollInterval);
    if (sb && channel) sb.removeChannel(channel);
});
