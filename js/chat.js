window.selectedRecipientId = null;
window.chatInterval = null;

function getSb() {
    return window.supabaseClient || window.supabase;
}

// Inizializzazione della chat
async function initChat(profile) {
    window.currentUserProfile = profile;
    setupChatListeners();
    await loadChatMessages();
    await updateNotificationBadge();
    
    // Aggiornamento automatico ogni 3 secondi
    if (window.chatInterval) clearInterval(window.chatInterval);
    window.chatInterval = setInterval(async () => {
        await loadChatMessages();
    }, 3000);
}

// Gestione eventi UI
function setupChatListeners() {
    const chatTypeSelect = document.getElementById('chat-type-select');
    const studentWrapper = document.getElementById('student-selector-wrapper');
    const studentSelect = document.getElementById('student-private-select');
    const chatForm = document.getElementById('chat-form');

    if (chatTypeSelect) {
        chatTypeSelect.onchange = async (e) => {
            const isPrivate = (e.target.value === 'private');

            // Solo l'admin deve visualizzare la tendina per selezionare l'allieva
            if (isPrivate && window.currentUserProfile?.is_admin) {
                if (studentWrapper) studentWrapper.classList.remove('hidden');
                await loadStudentsDropdown();
            } else {
                if (studentWrapper) studentWrapper.classList.add('hidden');
                window.selectedRecipientId = null;
            }
            await loadChatMessages();
        };
    }

    if (studentSelect && window.currentUserProfile?.is_admin) {
        studentSelect.onchange = async (e) => {
            window.selectedRecipientId = e.target.value || null;
            await loadChatMessages();
        };
    }

    if (chatForm) {
        chatForm.onsubmit = async (e) => {
            e.preventDefault();
            await sendChatMessage();
        };
    }
}

// Tendina allieve per l'Admin
async function loadStudentsDropdown() {
    const select = document.getElementById('student-private-select');
    if (!select) return;

    try {
        const sb = getSb();
        const { data: students, error } = await sb
            .from('profiles')
            .select('id, nome, cognome')
            .eq('is_admin', false)
            .order('nome', { ascending: true });

        if (error) throw error;

        let options = '<option value="">-- Seleziona un\'allieva --</option>';
        if (students && students.length > 0) {
            options += students.map(s => `<option value="${s.id}">${s.nome || ''} ${s.cognome || ''}</option>`).join('');
        }
        select.innerHTML = options;
    } catch (err) {
        console.error("Errore recupero allieve:", err);
    }
}

// Lettura dei messaggi
async function loadChatMessages() {
    const container = document.getElementById('chat-messages-container');
    if (!container || !window.currentUserProfile) return;

    const chatTypeSelect = document.getElementById('chat-type-select');
    const isPrivate = chatTypeSelect ? (chatTypeSelect.value === 'private') : false;

    if (isPrivate && window.currentUserProfile.is_admin && !window.selectedRecipientId) {
        container.innerHTML = `<p class="text-xs text-gray-400 text-center py-6">Seleziona un'allieva dal menu in alto per vedere la conversazione.</p>`;
        return;
    }

    try {
        const sb = getSb();
        let messages = [];

        if (!isPrivate) {
            // Chat Pubblica / Gruppo
            const { data, error } = await sb
                .from('messages')
                .select('*')
                .eq('is_private', false)
                .order('created_at', { ascending: true });

            if (error) throw error;
            messages = data || [];

        } else {
            // Chat Privata
            const myId = window.currentUserProfile.id;

            const { data, error } = await sb
                .from('messages')
                .select('*')
                .eq('is_private', true)
                .or(`sender_id.eq.${myId},recipient_id.eq.${myId}`)
                .order('created_at', { ascending: true });

            if (error) throw error;

            if (window.currentUserProfile.is_admin) {
                const studentId = window.selectedRecipientId;
                messages = (data || []).filter(m => 
                    (m.sender_id === myId && m.recipient_id === studentId) ||
                    (m.sender_id === studentId && (m.recipient_id === myId || !m.recipient_id))
                );
            } else {
                messages = data || [];
            }
        }

        // Mappa i nomi dei mittenti
        let profilesMap = {};
        if (messages.length > 0) {
            const senderIds = [...new Set(messages.map(m => m.sender_id))];
            const { data: profiles } = await sb.from('profiles').select('id, nome, cognome').in('id', senderIds);
            if (profiles) {
                profiles.forEach(p => { profilesMap[p.id] = p; });
            }
        }

        renderMessages(messages, profilesMap);

    } catch (err) {
        console.error("Errore lettura messaggi:", err);
    }
}

// Display messaggi a schermo
function renderMessages(messages, profilesMap = {}) {
    const container = document.getElementById('chat-messages-container');
    if (!container) return;

    if (!messages || messages.length === 0) {
        container.innerHTML = `<p class="text-xs text-gray-500 text-center py-6">Nessun messaggio presente in questa chat.</p>`;
        return;
    }

    const myId = window.currentUserProfile?.id;

    container.innerHTML = messages.map(msg => {
        const isMe = (msg.sender_id === myId);
        const profile = profilesMap[msg.sender_id];
        const senderName = isMe ? 'Tu' : (profile ? `${profile.nome || ''} ${profile.cognome || ''}`.trim() : 'Utente');
        const time = new Date(msg.created_at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

        return `
            <div class="flex flex-col ${isMe ? 'items-end' : 'items-start'} my-1.5">
                <span class="text-[10px] text-gray-400 mb-0.5 px-1">${senderName} - ${time}</span>
                <div class="max-w-[80%] px-3.5 py-2 rounded-2xl text-xs font-medium ${
                    isMe 
                    ? 'bg-brand-cyan text-black rounded-tr-none' 
                    : 'bg-brand-card text-white border border-brand-border rounded-tl-none'
                }">
                    ${msg.content}
                </div>
            </div>
        `;
    }).join('');

    container.scrollTop = container.scrollHeight;
}

// Invio messaggio
async function sendChatMessage() {
    const input = document.getElementById('chat-input');
    const text = input?.value.trim();
    if (!text) return;

    const chatTypeSelect = document.getElementById('chat-type-select');
    const isPrivate = chatTypeSelect ? (chatTypeSelect.value === 'private') : false;

    try {
        const sb = getSb();
        let targetRecipientId = null;

        if (isPrivate) {
            if (window.currentUserProfile?.is_admin) {
                if (!window.selectedRecipientId) {
                    alert("Seleziona un'allieva dal menu a tendina prima di inviare un messaggio privato.");
                    return;
                }
                targetRecipientId = window.selectedRecipientId;
            } else {
                // L'allieva assegna in automatico l'ID dell'Admin
                const { data: admin } = await sb.from('profiles').select('id').eq('is_admin', true).limit(1).maybeSingle();
                if (admin) targetRecipientId = admin.id;
            }
        }

        const payload = {
            sender_id: window.currentUserProfile.id,
            content: text,
            is_private: isPrivate,
            recipient_id: targetRecipientId
        };

        const { error } = await sb.from('messages').insert([payload]);

        if (error) throw error;

        input.value = '';
        await loadChatMessages();

    } catch (err) {
        alert("Errore durante l'invio del messaggio: " + (err.message || "Errore sconosciuto"));
    }
}
