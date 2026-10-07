// Configurazione Supabase - versione stabile
const SUPABASE_URL = "https://aatelpatdppxdehbsxmz.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_dA9nfW05M1BFCdjRwkWRMA_XM_SxPuV";

if (!window.supabase || typeof window.supabase.createClient !== "function") {
    console.error("SDK Supabase non disponibile.");
} else {
    window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

function getSupabase() {
    return window.supabaseClient;
}
window.getSupabase = getSupabase;

async function checkAuthAndRedirect(requiredRole) {
    var sb = window.supabaseClient;
    if (!sb || !sb.auth) {
        console.error("Client Supabase non inizializzato.");
        return null;
    }

    var sessionResult = await sb.auth.getSession();
    var session = sessionResult.data && sessionResult.data.session;

    if (!session) {
        if (!window.location.pathname.endsWith("index.html") && window.location.pathname !== "/") {
            window.location.href = "../index.html";
        }
        return null;
    }

    var profileResult = await sb
        .from("profiles")
        .select("*")
        .eq("id", session.user.id)
        .single();

    var profile = profileResult.data;

    if (profileResult.error || !profile) {
        await sb.auth.signOut();
        window.location.href = "../index.html";
        return null;
    }

    if (requiredRole === "admin" && !profile.is_admin) {
        window.location.href = "dashboard-student.html";
        return null;
    }

    if (requiredRole === "student" && profile.is_admin) {
        window.location.href = "dashboard-admin.html";
        return null;
    }

    return { user: session.user, profile: profile };
}

async function logout() {
    var sb = window.supabaseClient;
    if (sb && sb.auth) {
        await sb.auth.signOut();
    }
    window.location.href = "../index.html";
}

function renderNavbar(profile) {
    var nav = document.getElementById("nav-links");
    if (!nav) return;

    var name = "";
    if (profile) {
        name = ((profile.nome || "") + " " + (profile.cognome || "")).trim();
    }

    var dashboardLabel = profile && profile.is_admin ? "Istruttore" : "Allieva";
    var avatarUrl = profile && profile.avatar_url
        ? profile.avatar_url
        : "https://ui-avatars.com/api/?name=" + encodeURIComponent(name || dashboardLabel) + "&background=CCFF00&color=000";

    nav.innerHTML =
        '<div class="flex items-center gap-2">' +
            '<img id="nav-avatar-img" src="' + avatarUrl + '" alt="Profilo" class="w-9 h-9 rounded-xl object-cover border border-brand-border">' +
            '<div class="hidden sm:block text-right leading-tight">' +
                '<div class="text-xs font-black text-white">' + escapeNavbarText(name || dashboardLabel) + '</div>' +
                '<div class="text-[9px] uppercase font-bold text-gray-500">' + dashboardLabel + '</div>' +
            '</div>' +
        '</div>' +
        '<button type="button" onclick="logout()" class="px-3 py-2 bg-brand-dark border border-brand-border text-gray-300 hover:text-white hover:border-brand-pink rounded-xl text-xs font-black uppercase transition flex items-center gap-2" title="Esci e accedi con un altro account">' +
            '<i class="fa-solid fa-right-from-bracket"></i><span class="hidden sm:inline">Esci</span>' +
        '</button>';
}

function escapeNavbarText(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
