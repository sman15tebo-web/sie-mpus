/* ========================================================
   OFFLINE & SYNCHRONIZATION (SQLite)
======================================================== */
const dbName = 'SiEmpusDB';
const dbVersion = 1;
let localDB = null;

function initDB() {
    return new Promise((resolve, reject) => {
        localDB = true; // Mock localDB for SQLite compatibility
        updateNetworkStatus();
        updateSyncBadge();
        resolve(localDB);
    });
}

function saveToLocalDB(storeName, data) {
    return new Promise(async (resolve, reject) => {
        let key = storeName === 'cache' ? data.key : data.id;
        try {
            if (window.electronAPI && window.electronAPI.saveToLocalDB) {
                await window.electronAPI.saveToLocalDB(storeName, key, data);
            } else {
                const storageKey = 'siempus_' + storeName + '_' + (key || Date.now());
                localStorage.setItem(storageKey, JSON.stringify(data));
            }
            resolve();
        } catch (e) {
            resolve();
        }
    });
}

function getFromLocalDB(storeName, key = null) {
    return new Promise(async (resolve, reject) => {
        try {
            if (window.electronAPI && window.electronAPI.getFromLocalDB) {
                const result = await window.electronAPI.getFromLocalDB(storeName, key);
                resolve(result !== undefined && result !== null ? result : (key != null ? null : []));
            } else {
                if (key != null) {
                    const item = localStorage.getItem('siempus_' + storeName + '_' + key);
                    resolve(item ? JSON.parse(item) : null);
                } else {
                    const items = [];
                    for (let i = 0; i < localStorage.length; i++) {
                        const k = localStorage.key(i);
                        if (k && k.startsWith('siempus_' + storeName + '_')) {
                            try { items.push(JSON.parse(localStorage.getItem(k))); } catch(e){}
                        }
                    }
                    resolve(items);
                }
            }
        } catch (e) {
            resolve(key != null ? null : []);
        }
    });
}

function deleteFromLocalDB(storeName, key) {
    return new Promise(async (resolve, reject) => {
        try {
            if (window.electronAPI && window.electronAPI.deleteFromLocalDB) {
                await window.electronAPI.deleteFromLocalDB(storeName, key);
            } else {
                localStorage.removeItem('siempus_' + storeName + '_' + key);
            }
            resolve();
        } catch (e) {
            resolve();
        }
    });
}

async function addToQueue(action, payload) {
    return new Promise(async (resolve, reject) => {
        try {
            const data = { action, payload, timestamp: new Date().getTime() };
            if (window.electronAPI && window.electronAPI.saveToLocalDB) {
                await window.electronAPI.saveToLocalDB('syncQueue', null, data);
            } else {
                const q = JSON.parse(localStorage.getItem('siempus_syncQueue') || '[]');
                data.id = Date.now();
                q.push(data);
                localStorage.setItem('siempus_syncQueue', JSON.stringify(q));
            }
            updateSyncBadge();
            resolve();
        } catch (e) {
            resolve();
        }
    });
}

function updateSyncBadge() {
    getFromLocalDB('syncQueue').then(queue => {
        const badge = document.getElementById('sync-badge');
        const btn = document.getElementById('btn-manual-sync');
        const list = Array.isArray(queue) ? queue : [];
        if (badge && btn) {
            badge.innerText = list.length;
            // Always keep sync button visible
            btn.classList.remove('d-none');
        }
    }).catch(() => {});
}

function updateNetworkStatus() {
    const isOnline = navigator.onLine;
    const el = document.getElementById('network-status');
    if (el) {
        if (window.isElectron) {
            el.className = "me-3 px-3 py-1 rounded-pill fw-bold text-white bg-secondary shadow-sm";
            el.innerHTML = '<i class="fas fa-desktop me-1"></i> Mode Desktop (Offline)';
        } else if (isOnline) {
            el.className = "me-3 px-3 py-1 rounded-pill fw-bold text-white bg-success shadow-sm";
            el.innerHTML = '<i class="fas fa-wifi me-1"></i> Online';
        } else {
            el.className = "me-3 px-3 py-1 rounded-pill fw-bold text-white bg-danger shadow-sm";
            el.innerHTML = '<i class="fas fa-plane me-1"></i> Offline';
        }
    }
}

window.addEventListener('online', updateNetworkStatus);
window.addEventListener('offline', updateNetworkStatus);
initDB();

function manualSync() {
    // Tampilkan pesan loading awal
    
    getFromLocalDB('syncQueue').then(async (queue) => {
        let urlTarget = '';
        if (window.electronAPI && window.electronAPI.getConfig().OFFLINE_EXEC_LINK) {
            urlTarget = window.electronAPI.getConfig().OFFLINE_EXEC_LINK;
        } else {
            // Fallback: Jika admin lupa mengisi config-offline.js
            const savedUrl = localStorage.getItem('siempus_sync_url') || '';
            const { value: promptUrl, isConfirmed } = await Swal.fire({
                title: 'URL Google Apps Script',
                input: 'url',
                inputLabel: 'Masukkan Link Exec (Web App) untuk sinkronisasi:',
                inputValue: savedUrl,
                showCancelButton: true,
                confirmButtonText: '<i class="fas fa-cloud-upload-alt"></i> Proses Sinkronisasi',
                cancelButtonText: 'Batal',
                inputValidator: (value) => {
                    if (!value) return 'Link exec tidak boleh kosong!';
                    if (!value.includes('script.google.com/macros/s/')) return 'Pastikan URL valid dari Google Apps Script';
                }
            });
            if (!isConfirmed) return; // User membatalkan
            urlTarget = promptUrl;
            localStorage.setItem('siempus_sync_url', urlTarget);
        }

        if (urlTarget === 'https://script.google.com/macros/s/GANTI_DENGAN_LINK_EXEC_ANDA/exec') {
             Swal.fire('Error', 'Link Exec di config-offline.js belum diganti dengan link asli instansi Anda!', 'error');
             return;
        }

        // Deklarasi di luar blok agar tetap tersedia saat queue kosong
        let successCount = 0;
        let failCount = 0;

        if (queue.length > 0) {
            Swal.fire({
                title: 'Sinkronisasi...',
                html: 'Mengirim ' + queue.length + ' data ke server.',
                allowOutsideClick: false,
                didOpen: () => Swal.showLoading()
            });
            
            for (let item of queue) {
                try {
                    const payload = item.payload;
                    payload.action = item.action;
                    const res = await fetch(urlTarget, {
                        redirect: 'follow',
                        method: 'POST',
                        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                        body: JSON.stringify(payload)
                    });
                    const data = await res.json();
                    if (data && data.success !== false) { 
                        await deleteFromLocalDB('syncQueue', item.id);
                        successCount++;
                    } else {
                        failCount++;
                    }
                } catch (err) {
                    failCount++;
                }
            }

            if (failCount > 0) {
                Swal.fire('Selesai dengan error', successCount + ' berhasil, ' + failCount + ' gagal dikirim.', 'warning');
                return; // Hentikan jika push gagal agar data tidak inkonsisten
            }
        }
        
        // PULL DATA (DOWNLOAD TERBARU) DARI GOOGLE SHEETS
        Swal.fire({
            title: 'Sinkronisasi...',
            html: 'Menarik data terbaru dari server...',
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading()
        });

        const pullEndpoints = [
            { action: 'getAppConfig' },
            { action: 'getDashboardStats' },
            { action: 'getBookList', page: 1, limit: 10, search: '' }, // Cache first page for UI
            { action: 'getBookList', page: 1, limit: 10000, search: '' }, // Cache all for search
            { action: 'getMemberList', page: 1, limit: 10, search: '' }, 
            { action: 'getMemberList', page: 1, limit: 10000, search: '' },
            { action: 'getHistoryList', page: 1, limit: 10, search: '', isArchive: false },
            { action: 'getHistoryList', page: 1, limit: 500, search: '', isArchive: false }
        ];

        let pullSuccess = 0;
        for (const ep of pullEndpoints) {
            try {
                const res = await fetch(urlTarget, {
                    redirect: 'follow',
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify(ep)
                });
                const data = await res.json();
                if (data && (data.success || data.status !== false)) {
                    // Pastikan key sama persis dengan yang dicari apiHelper
                    const payloadCopy = { ...ep };
                    const cacheKey = ep.action + '_' + JSON.stringify(payloadCopy);
                    await saveToLocalDB('cache', { key: cacheKey, data: data });
                    pullSuccess++;
                }
            } catch (e) {
                console.error("Gagal menarik data " + ep.action, e);
            }
        }
        
        updateSyncBadge();
        
        if (failCount === 0) {
            Swal.fire('Berhasil', 'Semua data offline berhasil disinkronkan ke server!', 'success');
            setTimeout(() => refreshCurrentPage(), 1500);
        } else {
            Swal.fire('Selesai dengan error', successCount + ' berhasil, ' + failCount + ' gagal dikirim.', 'warning');
        }
    });
}

