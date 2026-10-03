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
            reject(e);
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
            reject(e);
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
            reject(e);
        }
    });
}

async function addToQueue(action, payload, offlineTransaction = null) {
    return new Promise(async (resolve, reject) => {
        try {
            const queuedPayload = offlineTransaction
                ? { ...payload, offlineRecord: offlineTransaction.row }
                : payload;
            const data = { action, payload: queuedPayload, timestamp: new Date().getTime() };
            if (offlineTransaction && window.electronAPI?.enqueueOfflineTransaction) {
                await window.electronAPI.enqueueOfflineTransaction(action, queuedPayload, offlineTransaction);
            } else if (window.electronAPI && window.electronAPI.saveToLocalDB) {
                await window.electronAPI.saveToLocalDB('syncQueue', null, data);
                if (offlineTransaction) {
                    await window.electronAPI.saveToLocalDB('offlineTransactions', offlineTransaction.id, offlineTransaction);
                }
            } else {
                const q = JSON.parse(localStorage.getItem('siempus_syncQueue') || '[]');
                data.id = Date.now();
                q.push(data);
                localStorage.setItem('siempus_syncQueue', JSON.stringify(q));
            }
            updateSyncBadge();
            resolve();
        } catch (e) {
            reject(e);
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

async function postSyncRequest(url, payload) {
    const response = await fetch(url, {
        redirect: 'follow',
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
}

async function manualSync() {
    try {
        const queueResult = await getFromLocalDB('syncQueue');
        const queue = Array.isArray(queueResult) ? queueResult : [];
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
        const failedMessages = [];

        if (queue.length > 0) {
            Swal.fire({
                title: 'Sinkronisasi...',
                html: 'Mengirim ' + queue.length + ' data ke server.',
                allowOutsideClick: false,
                didOpen: () => Swal.showLoading()
            });
            
            const blockedOfflineTransactions = new Set();
            for (let item of queue) {
                const isTransaction = item.action === 'prosesPeminjaman' || item.action === 'prosesPengembalian';
                const transactionId = isTransaction
                    ? String(item.payload?.offlineRecord?.[0] || '')
                    : '';
                if (transactionId && blockedOfflineTransactions.has(transactionId)) {
                    failCount++;
                    failedMessages.push(`Transaksi ${transactionId} ditahan karena langkah sebelumnya belum berhasil disinkronkan.`);
                    continue;
                }

                try {
                    const payload = { ...item.payload, action: item.action };
                    const data = await postSyncRequest(urlTarget, payload);
                    if (data &&
                        data.success !== false &&
                        data.status !== false &&
                        (data.success === true || data.status === true)) {
                        await deleteFromLocalDB('syncQueue', item.id);
                        successCount++;
                    } else {
                        failCount++;
                        failedMessages.push(data?.message || `Server menolak aksi ${item.action}.`);
                        if (transactionId) blockedOfflineTransactions.add(transactionId);
                    }
                } catch (err) {
                    failCount++;
                    failedMessages.push(err.message || String(err));
                    if (transactionId) blockedOfflineTransactions.add(transactionId);
                }
            }

        }
        
        Swal.fire({
            title: 'Sinkronisasi...',
            html: 'Menarik seluruh data terbaru dari server...',
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading()
        });

        let pullErrors = [];
        const getData = async (payload) => {
            const data = await postSyncRequest(urlTarget, payload);
            if (!data || data.success === false || data.status === false) {
                throw new Error(data?.message || `Server menolak ${payload.action}.`);
            }
            return data;
        };
        const saveCache = async (payload, data) => {
            const cacheKey = payload.action + '_' + JSON.stringify(payload);
            await saveToLocalDB('cache', { key: cacheKey, data });
        };
        const pullPaged = async (action, isArchive = false) => {
            const limit = 500;
            const rows = [];
            let page = 1;
            let total = 0;
            do {
                const payload = { action, page, limit, search: '' };
                if (action === 'getHistoryList') payload.isArchive = isArchive;
                const result = await getData(payload);
                const pageRows = Array.isArray(result.data) ? result.data : [];
                rows.push(...pageRows);
                total = Number(result.total) || rows.length;
                if (!pageRows.length) break;
                page++;
            } while (rows.length < total);

            for (const cacheLimit of [10000, 10]) {
                const cachePayload = {
                    action,
                    page: 1,
                    limit: cacheLimit,
                    search: ''
                };
                if (action === 'getHistoryList') cachePayload.isArchive = isArchive;
                const resultRows = cacheLimit === 10000 ? rows : rows.slice(0, cacheLimit);
                await saveCache(cachePayload, {
                    success: true,
                    status: true,
                    data: resultRows,
                    total: rows.length,
                    page: 1,
                    limit: cacheLimit
                });
            }
        };

        try {
            const snapshotResponse = await getData({ action: 'getAllBackupData' });
            if (!snapshotResponse.data || typeof snapshotResponse.data !== 'object') {
                throw new Error('Snapshot spreadsheet tidak memiliki format yang benar.');
            }
            await saveToLocalDB('cache', {
                key: 'serverSnapshot',
                data: snapshotResponse.data
            });
        } catch (e) {
            pullErrors.push(`Snapshot seluruh sheet: ${e.message || e}`);
        }

        for (const payload of [
            { action: 'getAppConfig' },
            { action: 'getDashboardStats' }
        ]) {
            try {
                const data = await getData(payload);
                await saveCache(payload, data);
                if (payload.action === 'getAppConfig') {
                    await saveToLocalDB('cache', { key: 'appConfig', data });
                    const configData = data.data && typeof data.data === 'object' && !Array.isArray(data.data)
                        ? data.data
                        : data;
                    localStorage.setItem('offline_app_config', JSON.stringify(configData));
                }
            } catch (e) {
                pullErrors.push(`${payload.action}: ${e.message || e}`);
            }
        }

        for (const action of ['getBookList', 'getMemberList']) {
            try {
                await pullPaged(action);
            } catch (e) {
                pullErrors.push(`${action}: ${e.message || e}`);
            }
        }
        for (const isArchive of [false, true]) {
            try {
                await pullPaged('getHistoryList', isArchive);
            } catch (e) {
                pullErrors.push(`Riwayat ${isArchive ? 'arsip' : 'aktif'}: ${e.message || e}`);
            }
        }
        
        updateSyncBadge();
        
        if (pullErrors.length === 0 && failCount === 0) {
            if (window.electronAPI?.clearLocalDB) {
                await window.electronAPI.clearLocalDB('offlineTransactions');
                await window.electronAPI.clearLocalDB('offlineDeletedHistory');
            }
            Swal.fire('Berhasil', 'Semua perubahan terkirim dan seluruh data server tersimpan di SQLite.', 'success');
            setTimeout(() => refreshCurrentPage(), 1500);
        } else {
            Swal.fire({
                title: 'Sinkronisasi sebagian',
                text: `Perubahan antrean: ${successCount} berhasil, ${failCount} gagal. Gagal mengirim: ${failedMessages.slice(0, 3).join(' ')}. Gagal menarik: ${pullErrors.join(' ')}`,
                icon: 'warning'
            });
        }
    } catch (err) {
        Swal.fire('Sinkronisasi gagal', err.message || String(err), 'error');
    }
}
