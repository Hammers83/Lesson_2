let isLoginMode = true;

// 1. Funzione globale per mostrare / nascondere le password al click dell'occhio
window.togglePasswordVisibility = function(inputId, btn) {
    const input = document.getElementById(inputId);
    const icon = btn.querySelector('i');

    if (!input || !icon) return;

    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
    } else {
        input.type = 'password';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    }
};

// 2. Controllo dei requisiti di sicurezza per la password
function isPasswordStrong(password) {
    // Almeno 8 caratteri, 1 maiuscola, 1 minuscola, 1 numero e 1 simbolo speciale
    const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/;
    return strongPasswordRegex.test(password);
}

document.addEventListener('DOMContentLoaded', async () => {
    // Gestione click sul pulsante "Registrati" / "Accedi"
    document.addEventListener('click', (e) => {
        if (e.target && e.target.id === 'btn-toggle-auth') {
            e.preventDefault();
            isLoginMode = !isLoginMode;
            renderAuthForm();
        }
    });

    const authForm = document.getElementById('auth-form');
    if (authForm) {
        authForm.addEventListener('submit', handleAuthSubmit);
    }

    // Primo rendering sicuro del form
    renderAuthForm();

    // Verifica la sessione utente attiva
    try {
        if (window.supabaseClient && window.supabaseClient.auth) {
            const { data: { session } } = await window.supabaseClient.auth.getSession();
            if (session) {
                const { data: profile } = await window.supabaseClient
                    .from('profiles')
                    .select('is_admin')
                    .eq('id', session.user.id)
                    .single();
                
                if (profile) {
                    window.location.href = profile.is_admin ? 'pages/dashboard-admin.html' : 'pages/dashboard-student.html';
                }
            }
        }
    } catch (err) {
        console.error("Errore durante il controllo della sessione:", err);
    }
});

function renderAuthForm() {
    const headerTitle = document.getElementById('form-header-title');
    const subtitle = document.getElementById('auth-subtitle');
    const submitBtn = document.getElementById('auth-submit-btn');
    const switchText = document.getElementById('auth-switch-text');
    const container = document.getElementById('form-fields-container');
    const errorContainer = document.getElementById('login-error-container');

    if (!container) return;
    if (errorContainer) errorContainer.innerHTML = '';

    if (isLoginMode) {
        if (headerTitle) headerTitle.innerText = "Accedi";
        if (subtitle) subtitle.innerText = "Inserisci le tue credenziali per accedere";
        if (submitBtn) submitBtn.innerText = "Entra";
        if (switchText) {
            switchText.innerHTML = `Non hai un account? <button type="button" id="btn-toggle-auth" class="text-brand-lime font-bold hover:underline ml-1">Registrati</button>`;
        }
        
        container.innerHTML = `
            <div>
                <label class="block text-xs font-bold text-gray-400 uppercase mb-1">Email</label>
                <input type="email" id="auth-email" required class="w-full px-4 py-3 bg-brand-dark border border-brand-border rounded-xl text-white text-sm focus:outline-none focus:border-brand-cyan">
            </div>
            <div>
                <label class="block text-xs font-bold text-gray-400 uppercase mb-1">Password</label>
                <div class="relative">
                    <input type="password" id="auth-password" required class="w-full px-4 py-3 bg-brand-dark border border-brand-border rounded-xl text-white text-sm focus:outline-none focus:border-brand-cyan pr-10">
                    <button type="button" onclick="togglePasswordVisibility('auth-password', this)" class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition">
                        <i class="fa-solid fa-eye"></i>
                    </button>
                </div>
            </div>
        `;
    } else {
        if (headerTitle) headerTitle.innerText = "Registrazione Allieva/o";
        if (subtitle) subtitle.innerText = "Iscriviti per accedere ai corsi di ZUMBA con Angelo";
        if (submitBtn) submitBtn.innerText = "Completa Registrazione";
        if (switchText) {
            switchText.innerHTML = `Hai già un account? <button type="button" id="btn-toggle-auth" class="text-brand-cyan font-bold hover:underline ml-1">Accedi</button>`;
        }
        
        container.innerHTML = `
            <div class="grid grid-cols-2 gap-3">
                <div>
                    <label class="block text-xs font-bold text-gray-400 uppercase mb-1">Nome</label>
                    <input type="text" id="signup-nome" required class="w-full px-3 py-2 bg-brand-dark border border-brand-border rounded-xl text-white text-sm focus:outline-none focus:border-brand-cyan">
                </div>
                <div>
                    <label class="block text-xs font-bold text-gray-400 uppercase mb-1">Cognome</label>
                    <input type="text" id="signup-cognome" required class="w-full px-3 py-2 bg-brand-dark border border-brand-border rounded-xl text-white text-sm focus:outline-none focus:border-brand-cyan">
                </div>
            </div>

            <div>
                <label class="block text-xs font-bold text-gray-400 uppercase mb-1">Data di Nascita</label>
                <input type="date" id="signup-data-nascita" required class="w-full px-4 py-2.5 bg-brand-dark border border-brand-border rounded-xl text-white text-sm focus:outline-none focus:border-brand-cyan">
            </div>

            <div>
                <label class="block text-xs font-bold text-gray-400 uppercase mb-1">Telefono</label>
                <input type="tel" id="signup-telefono" required placeholder="333 0000000" class="w-full px-4 py-2.5 bg-brand-dark border border-brand-border rounded-xl text-white text-sm focus:outline-none focus:border-brand-cyan">
            </div>

            <div>
                <label class="block text-xs font-bold text-gray-400 uppercase mb-1">Email</label>
                <input type="email" id="auth-email" required class="w-full px-4 py-2.5 bg-brand-dark border border-brand-border rounded-xl text-white text-sm focus:outline-none focus:border-brand-cyan">
            </div>

            <div class="space-y-3">
                <div>
                    <label class="block text-xs font-bold text-gray-400 uppercase mb-1">Password</label>
                    <div class="relative">
                        <input type="password" id="auth-password" required class="w-full px-3 py-2 bg-brand-dark border border-brand-border rounded-xl text-white text-sm focus:outline-none focus:border-brand-cyan pr-10">
                        <button type="button" onclick="togglePasswordVisibility('auth-password', this)" class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition">
                            <i class="fa-solid fa-eye"></i>
                        </button>
                    </div>
                </div>
                <div>
                    <label class="block text-xs font-bold text-gray-400 uppercase mb-1">Conferma Password</label>
                    <div class="relative">
                        <input type="password" id="signup-confirm-password" required class="w-full px-3 py-2 bg-brand-dark border border-brand-border rounded-xl text-white text-sm focus:outline-none focus:border-brand-cyan pr-10">
                        <button type="button" onclick="togglePasswordVisibility('signup-confirm-password', this)" class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition">
                            <i class="fa-solid fa-eye"></i>
                        </button>
                    </div>
                </div>
                <p class="text-[10px] text-gray-400">
                    <i class="fa-solid fa-shield-halved text-brand-cyan mr-1"></i> Min. 8 caratteri: 1 maiuscola, 1 minuscola, 1 numero e 1 simbolo.
                </p>
            </div>
        `;
    }
}

async function handleAuthSubmit(e) {
    e.preventDefault();
    if (isLoginMode) {
        await handleLogin();
    } else {
        await handleSignup();
    }
}

async function handleLogin() {
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;

    const { data, error } = await window.supabaseClient.auth.signInWithPassword({ email, password });
    if (error) {
        return showAuthError("Credenziali non valide o utente non trovato.");
    }

    const { data: profile } = await window.supabaseClient
        .from('profiles')
        .select('is_admin')
        .eq('id', data.user.id)
        .single();

    if (profile) {
        window.location.href = profile.is_admin ? 'pages/dashboard-admin.html' : 'pages/dashboard-student.html';
    } else {
        window.location.href = 'pages/dashboard-student.html';
    }
}

async function handleSignup() {
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    const confirmPassword = document.getElementById('signup-confirm-password').value;

    // 1. Controllo corrispondenza password
    if (password !== confirmPassword) {
        showAuthError("Le password non coincidono.");
        return;
    }

    // 2. Controllo requisiti di sicurezza password
    if (!isPasswordStrong(password)) {
        showAuthError("La password non soddisfa i requisiti di sicurezza! Deve contenere almeno 8 caratteri, una lettera maiuscola, una minuscola, un numero e un simbolo.");
        return;
    }

    const nome = document.getElementById('signup-nome').value.trim();
    const cognome = document.getElementById('signup-cognome').value.trim();
    const dataNascita = document.getElementById('signup-data-nascita').value;
    const telefono = document.getElementById('signup-telefono').value.trim();

    // 3. Inserimento utente su Supabase Auth
    const { data: authData, error: authError } = await window.supabaseClient.auth.signUp({
        email: email,
        password: password,
        options: {
            data: { nome: nome, cognome: cognome }
        }
    });

    if (authError) {
        return showAuthError(authError.message);
    }

    if (!authData.user) {
        return showAuthError("Errore durante la creazione dell'account.");
    }

    // 4. Inserimento record nella tabella profiles
    const { error: profileError } = await window.supabaseClient
        .from('profiles')
        .upsert([{
            id: authData.user.id,
            nome: nome,
            cognome: cognome,
            data_nascita: dataNascita,
            telefono: telefono,
            email: email,
            is_admin: false
        }]);

    if (profileError) {
        showAuthError("Account creato, ma errore nel profilo: " + profileError.message);
        return;
    }

    alert("Registrazione completata con successo!");
    window.location.href = 'pages/dashboard-student.html';
}

function showAuthError(msg) {
    const errorContainer = document.getElementById('login-error-container');
    if (errorContainer) {
        errorContainer.innerHTML = `
            <div class="p-3 mb-4 text-xs font-bold text-white bg-brand-pink/20 border border-brand-pink/50 rounded-xl flex items-center gap-2">
                <i class="fa-solid fa-circle-exclamation text-brand-pink"></i> ${msg}
            </div>
        `;
    }
}
