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
