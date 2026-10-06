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

// NAVBAR DINAMICA
function renderNavbar(profile) {
    const navContainer = document.getElementById('nav-links');
    if (!navContainer) return;

    const roleBadge = profile.is_admin 
        ? '<span class="text-brand-cyan text-[10px] font-extrabold uppercase bg-brand-cyan/20 px-2 py-0.5 rounded-full border border-brand-cyan/30">Istruttore</span>' 
        : '';

    navContainer.innerHTML = `
        <div class="flex items-center gap-2">
            <span class="text-xs font-bold uppercase tracking-wider text-gray-300">Ciao, ${profile.nome || 'Utente'}</span>
            ${roleBadge}
        </div>
        <button onclick="logout()" class="bg-brand-pink/20 hover:bg-brand-pink text-brand-pink hover:text-white border border-brand-pink/40 text-xs font-bold py-1.5 px-4 rounded-xl transition">
            Esci
        </button>
    `;
}
