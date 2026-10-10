/* ========================================================
   DETEKSI MODE: DESKTOP (OFFLINE) vs WEB (ONLINE)
======================================================== */
window.isElectron = Boolean(
    (typeof window !== 'undefined' && (window.isElectron === true || typeof window.electronAPI !== 'undefined')) ||
    (typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.toLowerCase().includes('electron')) ||
    (typeof process !== 'undefined' && process.versions && process.versions.electron)
);

const myButton = document.getElementById("btn-back-to-top");
window.onscroll = function () { scrollFunction(); };
function scrollFunction() {
    if (!myButton) return;
    if (document.body.scrollTop > 100 || document.documentElement.scrollTop > 100) { myButton.style.display = "block"; } else { myButton.style.display = "none"; }
}
function scrollToTop() { window.scrollTo({ top: 0, behavior: 'smooth' }); }


/* ========================================================
   ADAPTOR MULTI-TENANT (1 FRONTEND, BANYAK BACKEND)
======================================================== */

// 1. Daftar Sekolah & Link Backend
const daftarSekolah = {
    "sman15tebo": "https://script.google.com/macros/s/AKfycbwbELFRwvURcfwTWMrrs3PxUIbdGI8f-dP3oDvFIVOm3ZJf3d1Lt_M1cY3XZlhUNrYJ/exec",
    "demo": "https://script.google.com/macros/s/AKfycbwbELFRwvURcfwTWMrrs3PxUIbdGI8f-dP3oDvFIVOm3ZJf3d1Lt_M1cY3XZlhUNrYJ/exec"
};

let API_URL = "";
let tenantId = "";

if (window.isElectron) {
    tenantId = "desktop";
    localStorage.setItem('siempus_tenant_id', 'desktop');
    if (window.electronAPI && typeof window.electronAPI.getConfig === 'function') {
        const dConfig = window.electronAPI.getConfig();
        if (dConfig && (dConfig.OFFLINE_EXEC_LINK || dConfig.gasUrl || dConfig.linkExec)) {
            API_URL = dConfig.OFFLINE_EXEC_LINK || dConfig.gasUrl || dConfig.linkExec;
        }
    }
} else {
    // Mode Online Browser
    const urlParams = new URLSearchParams(window.location.search);

    // Prioritas 1: Parameter langsung ?exec=...
    const paramExec = urlParams.get('exec');
    if (paramExec && paramExec.startsWith('http')) {
        API_URL = paramExec;
        localStorage.setItem('siempus_custom_api_url', paramExec);
    }

    // Prioritas 2: Link Exec Kustom dari Pengaturan Sekolah
    if (!API_URL) {
        const customUrl = localStorage.getItem('siempus_custom_api_url') || localStorage.getItem('customSyncLink');
        if (customUrl && customUrl.startsWith('http')) {
            API_URL = customUrl;
        }
    }

    // Prioritas 3: Parameter ?id=...
    const paramId = urlParams.get('id');
    if (paramId) {
        tenantId = paramId.trim().toLowerCase();
        if (daftarSekolah[tenantId]) {
            API_URL = daftarSekolah[tenantId];
        }
        localStorage.setItem('siempus_tenant_id', tenantId);
    } else {
        // Prioritas 4: Memori Tenant Terakhir / Nama Sekolah
        tenantId = localStorage.getItem('siempus_tenant_id');
        if (tenantId && daftarSekolah[tenantId]) {
            API_URL = daftarSekolah[tenantId];
        } else {
            try {
                const conf = JSON.parse(localStorage.getItem('siempus_pengaturan') || localStorage.getItem('appSettings') || '{}');
                const sName = conf.nama_sekolah || conf.namasekolah || '';
                if (sName) {
                    const slug = sName.toLowerCase().replace(/[^a-z0-9]/g, '');
                    if (daftarSekolah[slug]) {
                        API_URL = daftarSekolah[slug];
                        tenantId = slug;
                        localStorage.setItem('siempus_tenant_id', slug);
                    }
                }
            } catch (e) { }
        }
    }

    // Prioritas 5: Fallback
    if (!API_URL) {
        API_URL = daftarSekolah[tenantId] || daftarSekolah["sman15tebo"] || Object.values(daftarSekolah)[0] || "";
    }
}
