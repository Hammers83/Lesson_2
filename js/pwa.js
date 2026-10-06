let deferredPrompt;

const isIos = () => {
    const userAgent = window.navigator.userAgent.toLowerCase();
    return /iphone|ipad|ipod/.test(userAgent);
};

const isInStandaloneMode = () => ('standalone' in window.navigator) && (window.navigator.standalone);

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const banner = document.getElementById('pwa-install-banner');
    if (banner) banner.classList.remove('hidden');
});

document.addEventListener('DOMContentLoaded', () => {
    const installBtn = document.getElementById('pwa-install-btn');
    if (installBtn) {
        installBtn.addEventListener('click', async () => {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                await deferredPrompt.userChoice;
                deferredPrompt = null;
                dismissPwaBanner();
            }
        });
    }

    if (isIos() && !isInStandaloneMode()) {
        const iosBanner = document.getElementById('ios-install-banner');
        if (iosBanner) iosBanner.classList.remove('hidden');
    }
});

function dismissPwaBanner() {
    const banner = document.getElementById('pwa-install-banner');
    if (banner) banner.classList.add('hidden');
}

function dismissIosBanner() {
    const banner = document.getElementById('ios-install-banner');
    if (banner) banner.classList.add('hidden');
}
