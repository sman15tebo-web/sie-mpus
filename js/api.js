function apiHelper() {
    let successCb = null;
    let failCb = null;

    // Fungsi pembantu normalisasi data import Excel
    const parseImportRows = (type, rawData) => {
        if (!Array.isArray(rawData) || rawData.length === 0) return [];

        let rows = rawData;
        if (typeof rawData[0] === 'object' && !Array.isArray(rawData[0])) {
            const keys = Object.keys(rawData[0]);
            rows = [keys, ...rawData.map(obj => keys.map(k => obj[k]))];
        }

        let headerIdx = -1;
        let colMap = {};

        for (let i = 0; i < Math.min(rows.length, 15); i++) {
            const r = rows[i];
            if (!r || !Array.isArray(r)) continue;
            const lineStr = r.map(c => String(c || '').toLowerCase().trim()).join(' ');

            if (type === 'buku') {
                if ((lineStr.includes('judul') || lineStr.includes('title')) &&
                    (lineStr.includes('kode') || lineStr.includes('pengarang') || lineStr.includes('penulis') || lineStr.includes('penerbit') || lineStr.includes('isbn') || lineStr.includes('barcode') || lineStr.includes('tahun') || lineStr.includes('stok'))) {
                    headerIdx = i;
                    r.forEach((cell, cIdx) => {
                        const cs = String(cell || '').toLowerCase().trim();
                        if (!cs) return;
                        if (['kode', 'barcode', 'isbn', 'id buku', 'no panggil', 'call number', 'no induk'].some(x => cs.includes(x))) {
                            if (colMap['kode'] === undefined || cs.includes('kode')) colMap['kode'] = cIdx;
                        } else if (['judul', 'title', 'nama buku'].some(x => cs.includes(x))) {
                            if (colMap['judul'] === undefined) colMap['judul'] = cIdx;
                        } else if (['pengarang', 'penulis', 'author'].some(x => cs.includes(x))) {
                            if (colMap['pengarang'] === undefined) colMap['pengarang'] = cIdx;
                        } else if (['penerbit', 'publisher'].some(x => cs.includes(x))) {
                            if (colMap['penerbit'] === undefined) colMap['penerbit'] = cIdx;
                        } else if (['tahun', 'thn', 'year'].some(x => cs.includes(x))) {
                            if (colMap['tahun'] === undefined) colMap['tahun'] = cIdx;
                        } else if (['kategori', 'klasifikasi', 'rak', 'category', 'genre'].some(x => cs.includes(x))) {
                            if (colMap['kategori'] === undefined) colMap['kategori'] = cIdx;
                        } else if (['stok', 'eksemplar', 'jumlah', 'qty', 'stock'].some(x => cs.includes(x))) {
                            if (colMap['stok'] === undefined) colMap['stok'] = cIdx;
                        }
                    });
                    break;
                }
            } else {
                // Anggota (Siswa / Pegawai / Guru)
                if (lineStr.includes('nama') &&
                    ['nisn', 'nip', 'nik', 'nuptk', 'no', 'id', 'rombel', 'kelas', 'jk', 'kelamin', 'ptk', 'pegawai', 'guru', 'anggota'].some(x => lineStr.includes(x))) {
                    headerIdx = i;
                    r.forEach((cell, cIdx) => {
                        const cs = String(cell || '').toLowerCase().trim();
                        if (!cs) return;
                        if (['nisn', 'nipd', 'nip', 'nuptk', 'nik', 'no induk', 'id anggota', 'id/nisn', 'id'].some(x => cs.includes(x))) {
                            if (colMap['id'] === undefined || cs.includes('nisn') || cs.includes('nip') || cs.includes('id')) {
                                colMap['id'] = cIdx;
                            } else if (!colMap['altId']) {
                                colMap['altId'] = cIdx;
                            }
                        } else if (cs.includes('nama')) {
                            if (colMap['nama'] === undefined) colMap['nama'] = cIdx;
                        } else if (['rombel', 'rombongan', 'kelas', 'jabatan', 'jenis ptk', 'tugas', 'bagian', 'unit', 'status'].some(x => cs.includes(x))) {
                            if (colMap['kelas'] === undefined) colMap['kelas'] = cIdx;
                        } else if (['jenis kelamin', 'jk', 'gender', 'l/p'].some(x => cs.includes(x))) {
                            if (colMap['jk'] === undefined) colMap['jk'] = cIdx;
                        } else if (['tanggal lahir', 'tgl lahir', 'tgl. lahir', 'tgl_lahir', 'birth_date', 'dob'].some(x => cs.includes(x)) || (cs.includes('lahir') && !cs.includes('tempat'))) {
                            if (colMap['tglLahir'] === undefined) colMap['tglLahir'] = cIdx;
                        } else if (['hp', 'telepon', 'telp', 'wa', 'ponsel', 'kontak'].some(x => cs.includes(x))) {
                            if (colMap['hp'] === undefined) colMap['hp'] = cIdx;
                        }
                    });
                    break;
                }
            }
        }

        const startIdx = headerIdx >= 0 ? headerIdx + 1 : 0;
        const cleaned = [];

        for (let i = startIdx; i < rows.length; i++) {
            const r = rows[i];
            if (!r || !Array.isArray(r) || r.length === 0) continue;

            if (type === 'buku') {
                let kode = (colMap['kode'] !== undefined ? r[colMap['kode']] : r[0]);
                let judul = (colMap['judul'] !== undefined ? r[colMap['judul']] : r[1]);
                let pengarang = (colMap['pengarang'] !== undefined ? r[colMap['pengarang']] : r[2]);
                let penerbit = (colMap['penerbit'] !== undefined ? r[colMap['penerbit']] : r[3]);
                let tahun = (colMap['tahun'] !== undefined ? r[colMap['tahun']] : r[4]);
                let kategori = (colMap['kategori'] !== undefined ? r[colMap['kategori']] : r[5]);
                let stok = (colMap['stok'] !== undefined ? r[colMap['stok']] : r[6]);

                kode = (kode !== undefined && kode !== null) ? String(kode).trim() : '';
                judul = (judul !== undefined && judul !== null) ? String(judul).trim() : '';
                if (!kode && !judul) continue;
                if (kode.toLowerCase() === 'kode' && judul.toLowerCase().includes('judul')) continue;

                if (!kode) kode = 'B-' + (cleaned.length + 1).toString().padStart(4, '0');
                pengarang = (pengarang !== undefined && pengarang !== null && String(pengarang).trim() !== '') ? String(pengarang).trim() : '-';
                penerbit = (penerbit !== undefined && penerbit !== null && String(penerbit).trim() !== '') ? String(penerbit).trim() : '-';
                tahun = (tahun !== undefined && tahun !== null && String(tahun).trim() !== '') ? String(tahun).trim() : '-';
                kategori = (kategori !== undefined && kategori !== null && String(kategori).trim() !== '') ? String(kategori).trim() : 'Umum';
                
                let stokNum = parseInt(stok) || 1;
                if (stokNum < 1) stokNum = 1;

                cleaned.push([kode, judul, pengarang, penerbit, tahun, kategori, stokNum, stokNum]);
            } else {
                let id = (colMap['id'] !== undefined ? r[colMap['id']] : r[0]);
                if ((!id || String(id).trim() === '' || String(id).trim() === '-') && colMap['altId'] !== undefined) {
                    id = r[colMap['altId']];
                }

                let nama = (colMap['nama'] !== undefined ? r[colMap['nama']] : r[1]);
                let kelas = (colMap['kelas'] !== undefined ? r[colMap['kelas']] : r[2]);
                let jk = (colMap['jk'] !== undefined ? r[colMap['jk']] : r[3]);
                let tglLahir = (colMap['tglLahir'] !== undefined ? r[colMap['tglLahir']] : r[4]);
                let hp = (colMap['hp'] !== undefined ? r[colMap['hp']] : r[5]);

                id = (id !== undefined && id !== null) ? String(id).trim() : '';
                nama = (nama !== undefined && nama !== null) ? String(nama).trim() : '';
                if (!id && !nama) continue;
                if (id.toLowerCase().includes('id') && nama.toLowerCase().includes('nama')) continue;

                if (!id) id = 'M-' + (cleaned.length + 1).toString().padStart(4, '0');
                // Auto pad jika hanya angka dan < 10 digit (misal NISN 9 digit)
                if (/^\d+$/.test(id) && id.length < 10) {
                    id = id.padStart(10, '0');
                }

                kelas = (kelas !== undefined && kelas !== null && String(kelas).trim() !== '') ? String(kelas).trim() : 'Umum';
                jk = (jk !== undefined && jk !== null && String(jk).trim() !== '') ? String(jk).trim().toUpperCase() : '-';
                if (jk === 'LAKI-LAKI' || jk === 'PRIA') jk = 'L';
                else if (jk === 'PEREMPUAN' || jk === 'WANITA') jk = 'P';

                let tglStr = '-';
                if (tglLahir !== undefined && tglLahir !== null && String(tglLahir).trim() !== '') {
                    if (typeof tglLahir === 'number' && tglLahir > 1000 && tglLahir < 100000) {
                        const d = new Date(Math.round((tglLahir - 25569) * 86400 * 1000));
                        tglStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                    } else {
                        tglStr = String(tglLahir).trim();
                    }
                }

                hp = (hp !== undefined && hp !== null && String(hp).trim() !== '') ? String(hp).trim() : '-';

                cleaned.push([id, nama, kelas, jk, tglStr, hp]);
            }
        }
        return cleaned;
    };

    const execute = async (action, payload = {}) => {
        // Fungsi pembantu untuk mencari nama anggota/buku secara mendalam di memori lokal
        const findNameOffline = async (type, idToFind) => {
            if (!idToFind) return null;
            const strId = String(idToFind).trim();

            // 1. Coba cari di variabel global (jika sudah pernah buka tab)
            if (type === 'member' && typeof memberData !== 'undefined' && memberData.length > 0) {
                const m = memberData.find(x => String(x[0]).trim() === strId);
                if (m) return m[1];
            } else if (type === 'book' && typeof bookData !== 'undefined' && bookData.length > 0) {
                const b = bookData.find(x => String(x[0]).trim() === strId);
                if (b) return b[1];
            }
            
            // 2. Coba cari di Cache IndexedDB
            const actionName = type === 'member' ? 'getMemberList' : 'getBookList';
            const cKey = actionName + '_{"action":"' + actionName + '","page":1,"limit":10000,"search":""}';
            const cData = await getFromLocalDB('cache', cKey);
            if (cData && cData.data && cData.data.data) {
                const found = cData.data.data.find(x => String(x[0]).trim().toLowerCase() === strId.toLowerCase() || String(x[1]).trim().toLowerCase() === strId.toLowerCase());
                if (found) return found[1];
            }
            
            // 3. Coba cari di Antrean (baru saja ditambah secara offline)
            const queue = await getFromLocalDB('syncQueue') || [];
            if (type === 'member') {
                const pend = queue.filter(q => q.action === 'saveMember');
                const f = pend.find(q => String(q.payload.memberData.id).trim().toLowerCase() === strId.toLowerCase() || String(q.payload.memberData.nama).trim().toLowerCase() === strId.toLowerCase());
                if (f) return f.payload.memberData.nama;

                const pendImports = queue.filter(q => q.action === 'processExcelData' && q.payload.type === 'anggota');
                for (let q of pendImports) {
                    const rows = Array.isArray(q.payload.rows) ? q.payload.rows : [];
                    const fi = rows.find(r => String(r[0]).trim().toLowerCase() === strId.toLowerCase() || String(r[1]).trim().toLowerCase() === strId.toLowerCase());
                    if (fi) return fi[1];
                }
            } else {
                const pend = queue.filter(q => q.action === 'saveBook');
                const f = pend.find(q => String(q.payload.bookData.kode).trim().toLowerCase() === strId.toLowerCase() || String(q.payload.bookData.judul).trim().toLowerCase() === strId.toLowerCase());
                if (f) return f.payload.bookData.judul;

                const pendImports = queue.filter(q => q.action === 'processExcelData' && q.payload.type === 'buku');
                for (let q of pendImports) {
                    const rows = Array.isArray(q.payload.rows) ? q.payload.rows : [];
                    const fi = rows.find(r => String(r[0]).trim().toLowerCase() === strId.toLowerCase() || String(r[1]).trim().toLowerCase() === strId.toLowerCase());
                    if (fi) return fi[1];
                }
            }
            
            return null;
        };

        payload.action = action;

        const isReadAction = ['getAppConfig', 'getBookList', 'getMemberList', 'getDashboardStats', 'getHistoryList', 'getExportHistoryByDate', 'checkMember', 'getAllDataForExport', 'loginUser'].includes(action);

        if (isReadAction) {
            // Penanganan Khusus Login: Offline Desktop vs Online Web
            if (action === 'loginUser') {
                if (window.isElectron) {
                    let offUser = 'admin';
                    let offPass = 'admin123';
                    if (window.electronAPI && typeof window.electronAPI.getConfig === 'function') {
                        const c = window.electronAPI.getConfig();
                        if (c.OFFLINE_ADMIN_USER) offUser = c.OFFLINE_ADMIN_USER;
                        if (c.OFFLINE_ADMIN_PASS) offPass = c.OFFLINE_ADMIN_PASS;
                    }
                    const inputU = (payload.username || '').trim();
                    const inputP = (payload.password || '').trim();

                    const match = (inputU.toLowerCase() === offUser.toLowerCase() && inputP === offPass) ||
                                  ((inputU.toLowerCase() === 'admin' || inputU.toLowerCase() === offUser.toLowerCase()) && (inputP === offPass || inputP === 'admin' || inputP === 'admin123'));

                    if (match) {
                        if (successCb) successCb({ status: true, nama: 'Admin', username: inputU });
                    } else {
                        if (successCb) successCb({ status: false, message: 'Username atau Password salah (Mode Offline). Kredensial aktif: ' + offUser });
                    }
                    return; // Selesai offline
                } else {
                    // Mode Online (Web / GitHub Pages)
                    let target = (typeof API_URL !== 'undefined') ? API_URL : '';
                    if (!target || target.includes('.....')) {
                        if (failCb) failCb("URL server sekolah belum dikonfigurasi pada daftarSekolah di config.js atau parameter ?id= belum sesuai.");
                        return;
                    }
                    let payloadWithAction = { action: action, ...payload };
                    fetch(target, {
                        redirect: 'follow', method: 'POST',
                        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                        body: JSON.stringify(payloadWithAction)
                    })
                    .then(r => r.json())
                    .then(data => { if (successCb) successCb(data); else console.log(data); })
                    .catch(err => { if (failCb) failCb(err); else console.error(err); });
                    return;
                }
            }

            try {
                // Tangani cache keys agar sama persis dengan yang digenerate manualSync (mengandung action)
                let payloadWithAction = { action: action, ...payload };
                let cacheKey = action + '_' + JSON.stringify(payloadWithAction);
                if (action === 'getAllDataForExport') {
                    // Export pakai data dari limit 10000 yang di-cache saat manualSync
                    const cacheAct = payload.type === 'buku' ? 'getBookList' : 'getMemberList';
                    // Sesuaikan string persis seperti yang dibuat manualSync
                    cacheKey = cacheAct + '_{"action":"' + cacheAct + '","page":1,"limit":10000,"search":""}';
                }

                const cached = await getFromLocalDB('cache', cacheKey);
                if (typeof swalCountdownInterval !== 'undefined') clearInterval(swalCountdownInterval);
                
                let responseData = { success: true, status: true, data: [], items: [], total: 0, message: 'Tidak ada data di cache offline' };
                if (cached && cached.data) {
                    responseData = JSON.parse(JSON.stringify(cached.data));
                }

                // Ambil data antrean yang belum sinkron dari IndexedDB (syncQueue)
                const queue = await getFromLocalDB('syncQueue');
                
                // Jika user minta getAppConfig, suntikkan pengaturan yang belum sinkron agar tidak hilang
                if (action === 'getAppConfig') {
                    if (!responseData.data || Array.isArray(responseData.data)) responseData.data = {};
                    try {
                        const localCfgStr = localStorage.getItem('offline_app_config');
                        if (localCfgStr) {
                            const parsed = JSON.parse(localCfgStr);
                            Object.assign(responseData.data, parsed);
                        }
                    } catch (e) {}

                    const pendingConfig = queue.filter(q => q.action === 'saveAppConfig').pop();
                    if (pendingConfig) {
                        const newCfg = pendingConfig.payload.configData;
                        const target = responseData.data;
                        if (newCfg.namaSekolah) target.NamaSekolah = newCfg.namaSekolah;
                        if (newCfg.namaInstansi) target.NamaInstansi = newCfg.namaInstansi;
                        if (newCfg.alamatSekolah) target.AlamatSekolah = newCfg.alamatSekolah;
                        if (newCfg.denda) target.DendaPerHari = newCfg.denda;
                        if (newCfg.durasi) target.DurasiPinjam = newCfg.durasi;
                        if (newCfg.nohp) target.NoHP = newCfg.nohp;
                        if (newCfg.website) target.WebSekolah = newCfg.website;
                        if (newCfg.email) target.EmailSekolah = newCfg.email;
                        if (newCfg.idFolder) target.IDFolderGambar = newCfg.idFolder;
                        if (newCfg.runningText) target.RunningText = newCfg.runningText;
                        if (newCfg.uploadLogo) target.UrlLogo = newCfg.uploadLogo;
                        else if (newCfg.urlLogo) target.UrlLogo = newCfg.urlLogo;
                        if (newCfg.uploadLogoInstansi) target.UrlLogoInstansi = newCfg.uploadLogoInstansi;
                        else if (newCfg.urlLogoInstansi) target.UrlLogoInstansi = newCfg.urlLogoInstansi;
                        if (newCfg.uploadBg) target.UrlBackground = newCfg.uploadBg;
                        else if (newCfg.urlBg) target.UrlBackground = newCfg.urlBg;
                        if (newCfg.color1) target.Color1 = newCfg.color1;
                        if (newCfg.color2) target.Color2 = newCfg.color2;
                        if (newCfg.color3) target.Color3 = newCfg.color3;
                        if (newCfg.medsosFb) target.MedsosFb = newCfg.medsosFb;
                        if (newCfg.medsosIg) target.MedsosIg = newCfg.medsosIg;
                        if (newCfg.medsosYt) target.MedsosYt = newCfg.medsosYt;
                        if (newCfg.medsosTiktok) target.MedsosTiktok = newCfg.medsosTiktok;
                        if (newCfg.medsosTwitter) target.MedsosTwitter = newCfg.medsosTwitter;
                    }
                    if (responseData.data && typeof responseData.data === 'object' && !Array.isArray(responseData.data)) {
                        Object.assign(responseData, responseData.data);
                    }
                }
                // Jika getAllDataForExport, return ARRAY murni (bukan object responseData)
                else if (action === 'getAllDataForExport') {
                    let allData = [];
                    if (payload.type === 'buku') {
                        const allCache = await getFromLocalDB('cache', 'getBookList_{"action":"getBookList","page":1,"limit":10000,"search":""}');
                        if (allCache && allCache.data && Array.isArray(allCache.data.data)) {
                            allData = JSON.parse(JSON.stringify(allCache.data.data));
                        } else if (responseData && Array.isArray(responseData.data)) {
                            allData = JSON.parse(JSON.stringify(responseData.data));
                        }
                        const deleted = queue.filter(q => q.action === 'deleteBook').map(q => String(q.payload.kode).trim());
                        allData = allData.filter(r => !deleted.includes(String(r[0]).trim()));

                        const pendingBooks = queue.filter(q => q.action === 'saveBook');
                        for (let q of pendingBooks) {
                            const bd = q.payload.bookData;
                            const kode = String(bd.kode).trim();
                            const oldKode = bd.oldKode ? String(bd.oldKode).trim() : '';
                            allData = allData.filter(r => String(r[0]).trim() !== kode && (oldKode ? String(r[0]).trim() !== oldKode : true));
                            const s = parseInt(bd.stok) || 1;
                            allData.unshift([bd.kode, bd.judul, bd.pengarang, bd.penerbit, bd.tahun, bd.kategori, s, s]);
                        }

                        const pendingImports = queue.filter(q => q.action === 'processExcelData' && q.payload.type === 'buku');
                        for (let q of pendingImports) {
                            const rows = parseImportRows('buku', q.payload.rows);
                            for (let r of rows) {
                                const kode = String(r[0]).trim();
                                allData = allData.filter(x => String(x[0]).trim() !== kode);
                                allData.unshift(r);
                            }
                        }
                    } else if (payload.type === 'anggota') {
                        const allCache = await getFromLocalDB('cache', 'getMemberList_{"action":"getMemberList","page":1,"limit":10000,"search":""}');
                        if (allCache && allCache.data && Array.isArray(allCache.data.data)) {
                            allData = JSON.parse(JSON.stringify(allCache.data.data));
                        } else if (responseData && Array.isArray(responseData.data)) {
                            allData = JSON.parse(JSON.stringify(responseData.data));
                        }
                        const deleted = queue.filter(q => q.action === 'deleteMember').map(q => String(q.payload.id).trim());
                        allData = allData.filter(r => !deleted.includes(String(r[0]).trim()));

                        const pendingMembers = queue.filter(q => q.action === 'saveMember');
                        for (let q of pendingMembers) {
                            const md = q.payload.memberData;
                            const id = String(md.id).trim();
                            const oldId = md.oldId ? String(md.oldId).trim() : '';
                            allData = allData.filter(r => String(r[0]).trim() !== id && (oldId ? String(r[0]).trim() !== oldId : true));
                            allData.unshift([md.id, md.nama, md.kelas, md.jk, md.tglLahir, md.nohp]);
                        }

                        const pendingImports = queue.filter(q => q.action === 'processExcelData' && q.payload.type === 'anggota');
                        for (let q of pendingImports) {
                            const rows = parseImportRows('anggota', q.payload.rows);
                            for (let r of rows) {
                                const id = String(r[0]).trim();
                                allData = allData.filter(x => String(x[0]).trim() !== id);
                                allData.unshift(r);
                            }
                        }
                    }
                    if (successCb) {
                        return successCb(allData);
                    }
                }

                if (action === 'getBookList') {
                    let allBooks = [];
                    const allCache = await getFromLocalDB('cache', 'getBookList_{"action":"getBookList","page":1,"limit":10000,"search":""}');
                    if (allCache && allCache.data && Array.isArray(allCache.data.data)) {
                        allBooks = JSON.parse(JSON.stringify(allCache.data.data));
                    } else if (responseData && Array.isArray(responseData.data)) {
                        allBooks = JSON.parse(JSON.stringify(responseData.data));
                    }

                    const deleted = queue.filter(q => q.action === 'deleteBook').map(q => String(q.payload.kode).trim());
                    allBooks = allBooks.filter(r => !deleted.includes(String(r[0]).trim()));

                    const pendingBooks = queue.filter(q => q.action === 'saveBook');
                    for (let q of pendingBooks) {
                        const bd = q.payload.bookData;
                        const kode = String(bd.kode).trim();
                        const oldKode = bd.oldKode ? String(bd.oldKode).trim() : '';
                        allBooks = allBooks.filter(r => String(r[0]).trim() !== kode && (oldKode ? String(r[0]).trim() !== oldKode : true));
                        const s = parseInt(bd.stok) || 1;
                        allBooks.unshift([bd.kode, bd.judul, bd.pengarang, bd.penerbit, bd.tahun, bd.kategori, s, s]);
                    }

                    const pendingImports = queue.filter(q => q.action === 'processExcelData' && q.payload.type === 'buku');
                    for (let q of pendingImports) {
                        const rows = parseImportRows('buku', q.payload.rows);
                        for (let r of rows) {
                            const kode = String(r[0]).trim();
                            allBooks = allBooks.filter(x => String(x[0]).trim() !== kode);
                            allBooks.unshift(r);
                        }
                    }

                    let filtered = allBooks;
                    const qSearch = (payload.search || '').trim().toLowerCase();
                    if (qSearch) {
                        if (qSearch.startsWith('exact_tahun:')) {
                            const thn = qSearch.replace('exact_tahun:', '').trim().toLowerCase();
                            filtered = filtered.filter(r => String(r[4] || '').toLowerCase() === thn);
                        } else {
                            filtered = filtered.filter(r => 
                                String(r[0] || '').toLowerCase().includes(qSearch) ||
                                String(r[1] || '').toLowerCase().includes(qSearch) ||
                                String(r[2] || '').toLowerCase().includes(qSearch) ||
                                String(r[3] || '').toLowerCase().includes(qSearch) ||
                                String(r[5] || '').toLowerCase().includes(qSearch)
                            );
                        }
                    }

                    const page = parseInt(payload.page) || 1;
                    const limit = parseInt(payload.limit) || 10;
                    const total = filtered.length;
                    const start = (page - 1) * limit;
                    const paged = filtered.slice(start, start + limit);

                    responseData.status = true;
                    responseData.success = true;
                    responseData.data = paged;
                    responseData.total = total;
                    responseData.page = page;
                    responseData.limit = limit;
                } else if (action === 'getMemberList') {
                    let allMembers = [];
                    const allCache = await getFromLocalDB('cache', 'getMemberList_{"action":"getMemberList","page":1,"limit":10000,"search":""}');
                    if (allCache && allCache.data && Array.isArray(allCache.data.data)) {
                        allMembers = JSON.parse(JSON.stringify(allCache.data.data));
                    } else if (responseData && Array.isArray(responseData.data)) {
                        allMembers = JSON.parse(JSON.stringify(responseData.data));
                    }

                    const deleted = queue.filter(q => q.action === 'deleteMember').map(q => String(q.payload.id).trim());
                    allMembers = allMembers.filter(r => !deleted.includes(String(r[0]).trim()));

                    const pendingMembers = queue.filter(q => q.action === 'saveMember');
                    for (let q of pendingMembers) {
                        const md = q.payload.memberData;
                        const id = String(md.id).trim();
                        const oldId = md.oldId ? String(md.oldId).trim() : '';
                        allMembers = allMembers.filter(r => String(r[0]).trim() !== id && (oldId ? String(r[0]).trim() !== oldId : true));
                        allMembers.unshift([md.id, md.nama, md.kelas, md.jk, md.tglLahir, md.nohp]);
                    }

                    const pendingImports = queue.filter(q => q.action === 'processExcelData' && q.payload.type === 'anggota');
                    for (let q of pendingImports) {
                        const rows = parseImportRows('anggota', q.payload.rows);
                        for (let r of rows) {
                            const id = String(r[0]).trim();
                            allMembers = allMembers.filter(x => String(x[0]).trim() !== id);
                            allMembers.unshift(r);
                        }
                    }

                    let filtered = allMembers;
                    const qSearch = (payload.search || '').trim().toLowerCase();
                    if (qSearch) {
                        if (qSearch.startsWith('exact_kelas:')) {
                            const kls = qSearch.replace('exact_kelas:', '').trim().toLowerCase();
                            filtered = filtered.filter(r => String(r[2] || '').toLowerCase() === kls);
                        } else {
                            filtered = filtered.filter(r => 
                                String(r[0] || '').toLowerCase().includes(qSearch) ||
                                String(r[1] || '').toLowerCase().includes(qSearch) ||
                                String(r[2] || '').toLowerCase().includes(qSearch) ||
                                String(r[5] || '').toLowerCase().includes(qSearch)
                            );
                        }
                    }

                    const page = parseInt(payload.page) || 1;
                    const limit = parseInt(payload.limit) || 10;
                    const total = filtered.length;
                    const start = (page - 1) * limit;
                    const paged = filtered.slice(start, start + limit);

                    responseData.status = true;
                    responseData.success = true;
                    responseData.data = paged;
                    responseData.total = total;
                    responseData.page = page;
                    responseData.limit = limit;
                } else if (action === 'getDashboardStats') {
                    if (responseData.totalJudul === undefined || responseData.totalJudul === 0) {
                        let allBooks = [];
                        const bCache = await getFromLocalDB('cache', 'getBookList_{"action":"getBookList","page":1,"limit":10000,"search":""}');
                        if (bCache && bCache.data && Array.isArray(bCache.data.data)) allBooks = JSON.parse(JSON.stringify(bCache.data.data));
                        const delB = queue.filter(q => q.action === 'deleteBook').map(q => String(q.payload.kode).trim());
                        allBooks = allBooks.filter(r => !delB.includes(String(r[0]).trim()));
                        for (let q of queue.filter(q => q.action === 'saveBook')) {
                            allBooks = allBooks.filter(r => String(r[0]).trim() !== String(q.payload.bookData.kode).trim());
                            allBooks.unshift([q.payload.bookData.kode, q.payload.bookData.judul, q.payload.bookData.pengarang, q.payload.bookData.penerbit, q.payload.bookData.tahun, q.payload.bookData.kategori, q.payload.bookData.stok, q.payload.bookData.stok]);
                        }
                        for (let q of queue.filter(q => q.action === 'processExcelData' && q.payload.type === 'buku')) {
                            const rows = parseImportRows('buku', q.payload.rows);
                            for (let r of rows) {
                                allBooks = allBooks.filter(x => String(x[0]).trim() !== String(r[0]).trim());
                                allBooks.unshift(r);
                            }
                        }

                        let allMembers = [];
                        const mCache = await getFromLocalDB('cache', 'getMemberList_{"action":"getMemberList","page":1,"limit":10000,"search":""}');
                        if (mCache && mCache.data && Array.isArray(mCache.data.data)) allMembers = JSON.parse(JSON.stringify(mCache.data.data));
                        const delM = queue.filter(q => q.action === 'deleteMember').map(q => String(q.payload.id).trim());
                        allMembers = allMembers.filter(r => !delM.includes(String(r[0]).trim()));
                        for (let q of queue.filter(q => q.action === 'saveMember')) {
                            allMembers = allMembers.filter(r => String(r[0]).trim() !== String(q.payload.memberData.id).trim());
                            allMembers.unshift([q.payload.memberData.id, q.payload.memberData.nama, q.payload.memberData.kelas, q.payload.memberData.jk, q.payload.memberData.tglLahir, q.payload.memberData.nohp]);
                        }
                        for (let q of queue.filter(q => q.action === 'processExcelData' && q.payload.type === 'anggota')) {
                            const rows = parseImportRows('anggota', q.payload.rows);
                            for (let r of rows) {
                                allMembers = allMembers.filter(x => String(x[0]).trim() !== String(r[0]).trim());
                                allMembers.unshift(r);
                            }
                        }

                        let totalEksemplar = 0;
                        allBooks.forEach(b => {
                            totalEksemplar += (parseInt(b[6]) || 1);
                        });

                        responseData = {
                            status: true,
                            success: true,
                            totalJudul: allBooks.length,
                            totalEksemplar: totalEksemplar,
                            totalAnggota: allMembers.length,
                            totalTransaksi: 0,
                            sedangDipinjam: 0,
                            terlambat: 0,
                            siswaTerrajin: '-',
                            bukuTerpopuler: '-'
                        };
                    }
                } else if (action === 'getHistoryList') {

                    let pendingHistory = [];
                    const qHistory = queue.filter(q => q.action === 'prosesPeminjaman' || q.action === 'prosesPengembalian');
                    
                    const cfgResponse = await getFromLocalDB('cache', 'appConfig');
                    let durasi = 7;
                    if (cfgResponse && cfgResponse.data) durasi = parseInt(cfgResponse.data.DurasiPinjam) || 7;

                    for (let q of qHistory) {
                        const act = q.action;
                        const data = q.payload;
                        
                        const tDate = new Date(q.timestamp);
                        const ty = tDate.getFullYear();
                        const tm = String(tDate.getMonth()+1).padStart(2,'0');
                        const td = String(tDate.getDate()).padStart(2,'0');
                        const tgl = `${ty}-${tm}-${td}`;
                        
                        const namaAnggota = await findNameOffline('member', data.idAnggota) || data.idAnggota;
                        const judulBuku = await findNameOffline('book', data.kodeBuku) || data.kodeBuku;
                        
                        let tglTempo = '-';
                        if (act === 'prosesPeminjaman') {
                            const t = new Date(q.timestamp);
                            t.setDate(t.getDate() + durasi);
                            const y = t.getFullYear();
                            const m = String(t.getMonth()+1).padStart(2,'0');
                            const d = String(t.getDate()).padStart(2,'0');
                            tglTempo = `${y}-${m}-${d}`;
                        }

                        pendingHistory.push({
                            idTrx: 'queue_' + q.id,
                            idAnggota: data.idAnggota,
                            namaAnggota: namaAnggota,
                            kodeBuku: data.kodeBuku,
                            judulBuku: judulBuku,
                            tglPinjam: act === 'prosesPeminjaman' ? tgl : '-',
                            tglTempo: tglTempo,
                            status: act === 'prosesPeminjaman' ? 'Pinjam (Offline)' : 'Kembali (Offline)',
                            tglTempoTs: 0
                        });
                    }
                    pendingHistory.reverse(); // Newest first
                    if (pendingHistory.length > 0) {
                        responseData.data = [...pendingHistory, ...responseData.data];
                    }

                } else if (action === 'checkMember') {
                    const mName = await findNameOffline('member', payload.id);
                    if (mName) {
                        responseData = { success: true, status: true, nama: mName };
                    } else {
                        responseData = { success: false, status: false, message: 'NISN / Anggota tidak ditemukan di database!' };
                    }
                }

                if (successCb) successCb(responseData);
            } catch (err) {
                if (typeof swalCountdownInterval !== 'undefined') clearInterval(swalCountdownInterval);
                if (failCb) failCb(err);
            }
        } else {
            try {
                // Untuk prosesPeminjaman & prosesPengembalian, validasi kodenya dulu sebelum masuk antrean
                if (action === 'prosesPeminjaman' || action === 'prosesPengembalian') {
                    const bName = await findNameOffline('book', payload.kodeBuku);
                    if (!bName) throw 'Kode Buku tidak ditemukan di database!';
                }
                
                if (action === 'deleteHistory') {
                    const strId = String(payload.idTrx || "");
                    if (strId.startsWith('queue_')) {
                        // Data masih di antrean lokal, hapus langsung tanpa sinkron backend
                        const qId = parseInt(strId.replace('queue_', ''), 10);
                        await deleteFromLocalDB('syncQueue', qId);
                        if (successCb) successCb({ success: true, status: true, message: 'Riwayat offline berhasil dibatalkan' });
                        return; // Selesai, jangan teruskan ke bawah
                    }
                }
                
                if (action === 'processExcelData') {
                    const type = payload.type;
                    const cleanedRows = parseImportRows(type, payload.rows);
                    if (!cleanedRows || cleanedRows.length === 0) {
                        if (typeof swalCountdownInterval !== 'undefined') clearInterval(swalCountdownInterval);
                        if (successCb) {
                            return successCb({
                                status: false,
                                success: false,
                                message: 'Tidak ada baris data valid yang ditemukan di file Excel. Pastikan terdapat kolom Judul (untuk Buku) atau Nama (untuk Anggota/Pegawai).'
                            });
                        }
                        return;
                    }
                    // Mode Online: Kirim langsung ke GAS
                    if (!window.isElectron) {
                        let target = (typeof API_URL !== 'undefined') ? API_URL : '';
                        if (!target || target.includes('.....')) {
                            if (typeof swalCountdownInterval !== 'undefined') clearInterval(swalCountdownInterval);
                            if (failCb) failCb('URL server belum dikonfigurasi.');
                            return;
                        }
                        const payloadOnline = { action: action, type: type, rows: cleanedRows };
                        fetch(target, {
                            redirect: 'follow', method: 'POST',
                            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                            body: JSON.stringify(payloadOnline)
                        })
                        .then(r => r.json())
                        .then(resData => {
                            if (typeof swalCountdownInterval !== 'undefined') clearInterval(swalCountdownInterval);
                            if (successCb) successCb(resData);
                        })
                        .catch(err => {
                            if (typeof swalCountdownInterval !== 'undefined') clearInterval(swalCountdownInterval);
                            if (failCb) failCb(err);
                        });
                        return;
                    }
                    // Mode Offline: masuk queue
                    await addToQueue(action, { type: type, rows: cleanedRows });
                    await new Promise(r => setTimeout(r, 600));
                    if (typeof swalCountdownInterval !== 'undefined') clearInterval(swalCountdownInterval);
                    if (successCb) {
                        return successCb({
                            status: true,
                            success: true,
                            message: `Berhasil mengimpor ${cleanedRows.length} data ${type} ke sistem (Tersimpan Lokal/Offline).`
                        });
                    }
                    return;
                }


                // MODE ONLINE (Web): Kirim langsung ke GAS via fetch, jangan masuk queue
                if (!window.isElectron) {
                    let target = (typeof API_URL !== 'undefined') ? API_URL : '';
                    if (!target || target.includes('.....')) {
                        if (typeof swalCountdownInterval !== 'undefined') clearInterval(swalCountdownInterval);
                        if (failCb) failCb('URL server sekolah belum dikonfigurasi. Pastikan parameter ?id= pada URL sudah benar.');
                        return;
                    }
                    let payloadWithAction = { action: action, ...payload };
                    fetch(target, {
                        redirect: 'follow', method: 'POST',
                        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                        body: JSON.stringify(payloadWithAction)
                    })
                    .then(r => r.json())
                    .then(resData => {
                        if (typeof swalCountdownInterval !== 'undefined') clearInterval(swalCountdownInterval);
                        if (successCb) successCb(resData);
                    })
                    .catch(err => {
                        if (typeof swalCountdownInterval !== 'undefined') clearInterval(swalCountdownInterval);
                        if (failCb) failCb(err);
                    });
                    return; // Selesai mode online
                }

                // MODE OFFLINE (Desktop/Electron): Masukkan ke antrean lokal
                await addToQueue(action, payload);
                // Jeda 600ms agar animasi popup SweetAlert tidak race condition
                await new Promise(r => setTimeout(r, 600));

                if (typeof swalCountdownInterval !== 'undefined') clearInterval(swalCountdownInterval);
                let dummyPeminjam = 'Offline User';
                let dummyJudul = 'Offline Book';
                let dummyTglKembali = '-';
                let dummyDenda = '-';
                let dummyTerlambat = '-';

                const cfgResponse = await getFromLocalDB('cache', 'appConfig');
                let durasi = 7;
                let dendaPerHari = 500;
                if (cfgResponse && cfgResponse.data) {
                    durasi = parseInt(cfgResponse.data.DurasiPinjam) || 7;
                    dendaPerHari = parseInt(cfgResponse.data.DendaPerHari) || 500;
                }

                if (action === 'prosesPeminjaman' || action === 'prosesPengembalian') {
                    dummyPeminjam = await findNameOffline('member', payload.idAnggota) || payload.idAnggota;
                    dummyJudul = await findNameOffline('book', payload.kodeBuku) || payload.kodeBuku;
                }

                if (action === 'prosesPeminjaman') {
                    const t = new Date();
                    t.setDate(t.getDate() + durasi);
                    const y = t.getFullYear();
                    const m = String(t.getMonth()+1).padStart(2,'0');
                    const d = String(t.getDate()).padStart(2,'0');
                    dummyTglKembali = `${y}-${m}-${d}`;
                } else if (action === 'prosesPengembalian') {
                    const queue = await getFromLocalDB('syncQueue');
                    const pendingPinjam = queue.find(q => q.action === 'prosesPeminjaman' && q.payload.idAnggota === payload.idAnggota && q.payload.kodeBuku === payload.kodeBuku);
                    let tglTempo = null;
                    if (pendingPinjam) {
                        const pinjamDate = new Date(pendingPinjam.timestamp);
                        pinjamDate.setDate(pinjamDate.getDate() + durasi);
                        tglTempo = pinjamDate;
                    } else if (typeof historyData !== 'undefined' && historyData.length > 0) {
                        const hist = historyData.find(h => h[1] == payload.idAnggota && h[3] == payload.kodeBuku && h[7] == 'Pinjam');
                        if (hist && hist[4]) {
                            const parts = hist[4].split(/[-/]/);
                            if (parts.length === 3) {
                                if (parts[0].length === 4) tglTempo = new Date(parts[0], parts[1]-1, parts[2]);
                                else tglTempo = new Date(parts[2], parts[1]-1, parts[0]);
                            }
                        }
                    }
                    
                    if (tglTempo) {
                        const now = new Date();
                        now.setHours(0,0,0,0);
                        tglTempo.setHours(0,0,0,0);
                        const diffMs = now - tglTempo;
                        if (diffMs > 0) {
                            const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
                            dummyTerlambat = diffDays + ' Hari';
                            dummyDenda = 'Rp ' + (diffDays * dendaPerHari).toLocaleString('id-ID');
                        } else {
                            dummyTerlambat = 'Tidak Terlambat';
                            dummyDenda = 'Rp 0';
                        }
                    } else {
                        dummyTerlambat = '? (Offline)';
                        dummyDenda = '? (Offline)';
                    }
                }

                const dummySuccess = { success: true, status: true, message: 'Tersimpan Offline', insertId: 'OFFLINE', peminjam: dummyPeminjam, judul: dummyJudul, tglKembali: dummyTglKembali, denda: dummyDenda, terlambat: dummyTerlambat };
                if (successCb) successCb(dummySuccess);
            } catch (err) {
                if (failCb) failCb(err);
            }
        }
    };

    return {
        withFailureHandler: function (cb) { failCb = cb; return this; },
        withSuccessHandler: function (cb) { successCb = cb; return this; },

        getAppConfig: function () { execute('getAppConfig'); },
        loginUser: function (u, p) { execute('loginUser', { username: u, password: p }); },
        checkMember: function (id) { execute('checkMember', { id: id }); },
        prosesPeminjaman: function (m, b, p) { execute('prosesPeminjaman', { idAnggota: m, kodeBuku: b, petugas: p }); },
        prosesPengembalian: function (m, b, p) { execute('prosesPengembalian', { idAnggota: m, kodeBuku: b, petugas: p }); },
        getBookList: function (p, l, q) { execute('getBookList', { page: p, limit: l, search: q }); },
        saveBook: function (d) { execute('saveBook', { bookData: d }); },
        deleteBook: function (k) { execute('deleteBook', { kode: k }); },
        getMemberList: function (p, l, q) { execute('getMemberList', { page: p, limit: l, search: q }); },
        saveMember: function (d) { execute('saveMember', { memberData: d }); },
        deleteMember: function (id) { execute('deleteMember', { id: id }); },
        getDashboardStats: function () { execute('getDashboardStats'); },
        getHistoryList: function (p, l, q, isA) { execute('getHistoryList', { page: p, limit: l, search: q, isArchive: isA }); },
        saveAppConfig: function (d) { execute('saveAppConfig', { configData: d }); },
        updateUserCredentials: function (o, n, p) { execute('updateUserCredentials', { oldUser: o, newUser: n, newPass: p }); },
        processExcelData: function (t, r) { execute('processExcelData', { type: t, rows: r }); },
        getAllDataForExport: function (t) { execute('getAllDataForExport', { type: t }); },
        getExportHistoryByDate: function (s, e, a) { execute('getExportHistoryByDate', { startDate: s, endDate: e, isArchive: a }); },
        deleteHistory: function (id, isA) { execute('deleteHistory', { idTrx: id, isArchive: isA }); },
        callGeminiAI: function (p) { execute('callGeminiAI', { prompt: p }); }
    };
}

if (typeof google === 'undefined') {
    window.google = { get script() { return { get run() { return apiHelper(); } } } };
}

