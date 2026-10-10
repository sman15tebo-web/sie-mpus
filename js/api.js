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
                        } else if (['stok tersedia', 'stoktersedia', 'available stock', 'available'].some(x => cs.includes(x))) {
                            if (colMap['stokTersedia'] === undefined) colMap['stokTersedia'] = cIdx;
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
                let stokTersedia = (colMap['stokTersedia'] !== undefined ? r[colMap['stokTersedia']] : r[7]);

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
                let tersediaNum = stokTersedia === undefined || stokTersedia === null || String(stokTersedia).trim() === ''
                    ? stokNum
                    : Math.min(Math.max(parseInt(stokTersedia, 10) || 0, 0), stokNum);

                cleaned.push([kode, judul, pengarang, penerbit, tahun, kategori, stokNum, tersediaNum]);
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
                nama = (nama !== undefined && nama !== null) ? String(nama).trim().toUpperCase() : '';
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

            const snapshot = await getFromLocalDB('cache', 'serverSnapshot');
            const snapshotRows = snapshot?.data?.[type === 'member' ? 'Anggota' : 'Buku'];
            if (Array.isArray(snapshotRows)) {
                const found = snapshotRows.slice(1).find(row =>
                    String(row[0]).trim().toLowerCase() === strId.toLowerCase() ||
                    String(row[1]).trim().toLowerCase() === strId.toLowerCase()
                );
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

        const persistOfflineCatalog = async (type) => {
            if (!window.isElectron || !window.electronAPI?.saveToLocalDB) return;
            if (type !== 'buku' && type !== 'anggota') throw new Error('Jenis katalog lokal tidak valid.');

            const actionName = type === 'buku' ? 'getBookList' : 'getMemberList';
            const cacheKey = `${actionName}_{"action":"${actionName}","page":1,"limit":10000,"search":""}`;
            const cache = await getFromLocalDB('cache', cacheKey);
            const snapshot = await getFromLocalDB('cache', 'serverSnapshot');
            const snapshotRows = snapshot?.data?.[type === 'buku' ? 'Buku' : 'Anggota'];
            const keyOf = row => String(row?.[0] || '').trim();
            const catalogById = new Map();
            if (Array.isArray(snapshotRows)) {
                for (const row of snapshotRows.slice(1)) {
                    if (keyOf(row)) catalogById.set(keyOf(row), [...row]);
                }
            }
            if (Array.isArray(cache?.data?.data)) {
                for (const row of cache.data.data) {
                    if (keyOf(row)) catalogById.set(keyOf(row), [...row]);
                }
            }
            let rows = [...catalogById.values()];
            const normalizeId = value => {
                const id = String(value || '').trim();
                return type === 'anggota' ? id.padStart(10, '0') : id;
            };
            const applyMutation = (mutationAction, mutationPayload) => {
                if (type === 'buku' && mutationAction === 'saveBook' && mutationPayload?.bookData) {
                    const book = mutationPayload.bookData;
                    const id = String(book.kode || '').trim();
                    const oldId = String(book.oldKode || id).trim();
                    const existing = rows.find(row => keyOf(row) === oldId || keyOf(row) === id);
                    const total = parseInt(book.stok, 10) || 1;
                    const oldTotal = Number(existing?.[6]) || 0;
                    const oldAvailable = Number(existing?.[7]) || 0;
                    const available = book.isEdit
                        ? Math.max(0, Math.min(total, total - (oldTotal - oldAvailable)))
                        : total;
                    rows = rows.filter(row => keyOf(row) !== id && keyOf(row) !== oldId);
                    rows.unshift([id, book.judul, book.pengarang, book.penerbit, book.tahun, book.kategori, total, available]);
                    return;
                }

                if (type === 'anggota' && mutationAction === 'saveMember' && mutationPayload?.memberData) {
                    const member = mutationPayload.memberData;
                    const id = normalizeId(member.id);
                    const oldId = normalizeId(member.oldId || id);
                    rows = rows.filter(row => keyOf(row) !== id && keyOf(row) !== oldId);
                    rows.unshift([id, member.nama, member.kelas, member.jk, member.tglLahir, member.nohp]);
                    return;
                }

                if (mutationAction === 'deleteBook' && type === 'buku') {
                    rows = rows.filter(row => keyOf(row) !== String(mutationPayload?.kode || '').trim());
                    return;
                }
                if (mutationAction === 'deleteMember' && type === 'anggota') {
                    const id = normalizeId(mutationPayload?.id);
                    rows = rows.filter(row => keyOf(row) !== id);
                    return;
                }

                if (mutationAction === 'processExcelData' && mutationPayload?.type === type) {
                    const importedRows = parseImportRows(type, mutationPayload.rows);
                    for (const imported of importedRows) {
                        const row = [...imported];
                        row[0] = normalizeId(row[0]);
                        if (!keyOf(row) || rows.some(existing => keyOf(existing) === keyOf(row))) continue;
                        rows.push(row);
                    }
                }
            };

            const queue = await getFromLocalDB('syncQueue') || [];
            for (const item of queue) applyMutation(item.action, item.payload);

            await window.electronAPI.saveToLocalDB('cache', cacheKey, {
                key: cacheKey,
                data: {
                    success: true,
                    status: true,
                    data: rows,
                    total: rows.length,
                    page: 1,
                    limit: 10000
                }
            });
        };

        const recordOfflineTransaction = async () => {
            if (!window.electronAPI || (action !== 'prosesPeminjaman' && action !== 'prosesPengembalian')) return null;

            const idAnggota = String(payload.idAnggota || '').trim();
            const kodeBuku = String(payload.kodeBuku || '').trim();
            const namaAnggota = await findNameOffline('member', idAnggota);
            const judulBuku = await findNameOffline('book', kodeBuku);
            if (!namaAnggota) throw new Error('Anggota tidak ditemukan di data SQLite lokal.');
            if (!judulBuku) throw new Error('Buku tidak ditemukan di data SQLite lokal.');

            const records = await getFromLocalDB('offlineTransactions') || [];
            const snapshot = await getFromLocalDB('cache', 'serverSnapshot');
            const timestamp = Date.now();
            const today = new Date(timestamp);
            today.setHours(0, 0, 0, 0);
            const toIso = date => {
                const d = new Date(date);
                return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            };
            const parseDate = value => {
                if (value instanceof Date) return new Date(value);
                const text = String(value || '').trim();
                const dmy = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
                if (dmy) return new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
                const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
                if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
                return new Date(text);
            };

            if (action === 'prosesPeminjaman') {
                const booksCache = await getFromLocalDB('cache', 'getBookList_{"action":"getBookList","page":1,"limit":10000,"search":""}');
                const bookRows = Array.isArray(booksCache?.data?.data) ? booksCache.data.data : [];
                const book = bookRows.find(row => String(row[0]).trim() === kodeBuku) ||
                    (typeof bookData !== 'undefined' ? bookData.find(row => String(row[0]).trim() === kodeBuku) : null);
                if (!book) throw new Error('Data buku belum tersedia di SQLite. Sinkronkan data sebelum meminjam.');

                let available = Number(book[7] ?? book[6]) || 0;
                for (const record of records) {
                    const row = record.row || [];
                    if (String(row[2]) !== kodeBuku) continue;
                    if (record.localBorrow && row[6] === 'Pinjam') available--;
                    if (record.returnedOffline) available++;
                }
                if (available <= 0) throw new Error('Stok buku habis berdasarkan data lokal.');

                const cfg = await getFromLocalDB('cache', 'appConfig');
                const duration = parseInt(cfg?.data?.DurasiPinjam, 10) || 7;
                const dueDate = new Date(today);
                dueDate.setDate(dueDate.getDate() + duration);
                const row = [
                    `LOCAL-${timestamp}`,
                    idAnggota,
                    kodeBuku,
                    toIso(today),
                    toIso(dueDate),
                    '',
                    'Pinjam',
                    0,
                    payload.petugas || ''
                ];
                const record = { id: row[0], row, localBorrow: true, returnedOffline: false };
                return record;
            }

            let record = records
                .filter(item => String(item.row?.[1]) === idAnggota &&
                    String(item.row?.[2]) === kodeBuku && item.row?.[6] === 'Pinjam')
                .pop();
            if (!record) {
                const rows = snapshot?.data?.Transaksi;
                if (Array.isArray(rows)) {
                    const activeRow = rows.slice(1).filter(row =>
                        String(row[1]) === idAnggota && String(row[2]) === kodeBuku && String(row[6]) === 'Pinjam'
                    ).pop();
                    if (activeRow) record = {
                        id: String(activeRow[0]),
                        row: [...activeRow],
                        localBorrow: String(activeRow[0]).startsWith('LOCAL-'),
                        returnedOffline: false
                    };
                }
            }
            if (!record) {
                const historyCache = await getFromLocalDB('cache', 'getHistoryList_{"action":"getHistoryList","page":1,"limit":10000,"search":"","isArchive":false}');
                const cachedRows = historyCache?.data?.data;
                if (Array.isArray(cachedRows)) {
                    const active = cachedRows.filter(row =>
                        String(row.idAnggota) === idAnggota && String(row.kodeBuku) === kodeBuku && row.status === 'Pinjam'
                    ).pop();
                    if (active) {
                        record = {
                            id: String(active.idTrx),
                            row: [active.idTrx, idAnggota, kodeBuku, active.tglPinjam, active.tglTempo, active.tglKembali, active.status, active.denda, active.petugas],
                            localBorrow: String(active.idTrx).startsWith('LOCAL-'),
                            returnedOffline: false
                        };
                    }
                }
            }
            if (!record && typeof historyData !== 'undefined' && Array.isArray(historyData)) {
                const active = historyData.filter(row =>
                    String(row.idAnggota) === idAnggota && String(row.kodeBuku) === kodeBuku && row.status === 'Pinjam'
                ).pop();
                if (active) {
                    record = {
                        id: String(active.idTrx),
                        row: [active.idTrx, idAnggota, kodeBuku, active.tglPinjam, active.tglTempo, active.tglKembali, active.status, active.denda, active.petugas],
                        localBorrow: String(active.idTrx).startsWith('LOCAL-'),
                        returnedOffline: false
                    };
                }
            }
            if (!record) throw new Error('Peminjaman aktif tidak ditemukan di data SQLite lokal.');

            const dueDate = parseDate(record.row[4]);
            const lateDays = Number.isNaN(dueDate.getTime()) ? 0 : Math.max(0, Math.floor((today - dueDate) / 86400000));
            const cfg = await getFromLocalDB('cache', 'appConfig');
            const finePerDay = parseInt(cfg?.data?.DendaPerHari, 10) || 500;
            record.row[5] = toIso(today);
            record.row[6] = 'Kembali';
            record.row[7] = lateDays * finePerDay;
            record.row[8] = payload.petugas || record.row[8] || '';
            record.returnedOffline = !record.localBorrow;
            return record;
        };

        const applyOfflineStockChanges = async (books) => {
            const transactions = await getFromLocalDB('offlineTransactions') || [];
            for (const transaction of transactions) {
                const row = transaction.row || [];
                const book = books.find(item => String(item[0]).trim() === String(row[2]).trim());
                if (!book) continue;
                let available = Number(book[7] ?? book[6]) || 0;
                if (transaction.localBorrow && row[6] === 'Pinjam') available--;
                if (transaction.returnedOffline) available++;
                book[7] = Math.min(Number(book[6]) || available, Math.max(0, available));
            }
            return books;
        };

        payload.action = action;

        // Nama anggota selalu disimpan HURUF KAPITAL (input manual maupun edit)
        if (action === 'saveMember' && payload.memberData && typeof payload.memberData.nama === 'string') {
            payload.memberData.nama = payload.memberData.nama.trim().toUpperCase();
        }

        const isReadAction = ['getAppConfig', 'getBookList', 'getMemberList', 'getDashboardStats', 'getHistoryList', 'getExportHistoryByDate', 'checkMember', 'getAllDataForExport', 'loginUser'].includes(action);

        if (isReadAction) {
            // MODE ONLINE (Web/GitHub Pages): Semua read action langsung ambil dari server
            if (!window.isElectron) {
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

            // Penanganan Khusus Login OFFLINE Desktop
            if (action === 'loginUser') {
                let offUser = '';
                let offPass = '';
                let c = null;
                if (window.electronAPI && typeof window.electronAPI.getConfig === 'function') {
                    try { c = window.electronAPI.getConfig(); } catch (_) {}
                }
                if ((!c || (!c.admin && !c.OFFLINE_ADMIN_USER)) && window.APP_CONFIG) {
                    c = window.APP_CONFIG;
                }

                if (c) {
                    if (c.admin && c.admin.username) offUser = c.admin.username;
                    else if (c.OFFLINE_ADMIN_USER) offUser = c.OFFLINE_ADMIN_USER;
                    else if (c.username) offUser = c.username;

                    if (c.admin && c.admin.password) offPass = c.admin.password;
                    else if (c.OFFLINE_ADMIN_PASS) offPass = c.OFFLINE_ADMIN_PASS;
                    else if (c.password) offPass = c.password;
                }

                const inputU = (payload.username || '').trim();
                const inputP = (payload.password || '').trim();

                const match = offUser && offPass && (inputU.toLowerCase() === offUser.toLowerCase()) && (inputP === offPass);

                if (match) {
                    if (successCb) successCb({ status: true, nama: 'Admin', username: inputU });
                } else {
                    if (successCb) successCb({ status: false, message: 'Username atau Password salah (Mode Offline).' });
                }
                return; // Selesai offline
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
                    const configData = responseData.data && typeof responseData.data === 'object' && !Array.isArray(responseData.data)
                        ? responseData.data
                        : { ...responseData };
                    const serverConfig = { ...configData };
                    try {
                        const localCfgStr = localStorage.getItem('offline_app_config');
                        if (localCfgStr) {
                            const parsed = JSON.parse(localCfgStr);
                            Object.assign(configData, parsed);
                            ['UrlLogo', 'UrlLogoInstansi', 'UrlBackground'].forEach(key => {
                                if (/^data:image\//i.test(String(serverConfig[key] || ''))) configData[key] = serverConfig[key];
                            });
                        }
                    } catch (e) { }

                    const pendingConfig = queue.filter(q => q.action === 'saveAppConfig').pop();
                    if (pendingConfig) {
                        const newCfg = pendingConfig.payload.configData;
                        const target = configData;
                        const configFields = {
                            namaSekolah: 'NamaSekolah',
                            namaInstansi: 'NamaInstansi',
                            alamatSekolah: 'AlamatSekolah',
                            denda: 'DendaPerHari',
                            durasi: 'DurasiPinjam',
                            nohp: 'NoHP',
                            website: 'WebSekolah',
                            email: 'EmailSekolah',
                            idFolder: 'IDFolderGambar',
                            runningText: 'RunningText',
                            color1: 'Color1',
                            color2: 'Color2',
                            color3: 'Color3',
                            medsosFb: 'MedsosFb',
                            medsosIg: 'MedsosIg',
                            medsosYt: 'MedsosYt',
                            medsosTiktok: 'MedsosTiktok',
                            medsosTwitter: 'MedsosTwitter'
                        };
                        Object.entries(configFields).forEach(([source, destination]) => {
                            if (newCfg[source] !== undefined) target[destination] = newCfg[source];
                        });
                        if (newCfg.uploadLogo) target.UrlLogo = newCfg.uploadLogo;
                        else if (newCfg.urlLogo !== undefined) target.UrlLogo = newCfg.urlLogo;
                        if (newCfg.uploadLogoInstansi) target.UrlLogoInstansi = newCfg.uploadLogoInstansi;
                        else if (newCfg.urlLogoInstansi !== undefined) target.UrlLogoInstansi = newCfg.urlLogoInstansi;
                        if (newCfg.uploadBg) target.UrlBackground = newCfg.uploadBg;
                        else if (newCfg.urlBg !== undefined) target.UrlBackground = newCfg.urlBg;
                    }
                    responseData = { ...configData, data: configData };
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
                            const existing = allData.find(row => String(row[0]).trim() === (oldKode || kode));
                            const s = parseInt(bd.stok, 10) || 1;
                            const oldTotal = Number(existing?.[6]) || 0;
                            const oldAvailable = Number(existing?.[7]) || 0;
                            const available = bd.isEdit
                                ? Math.max(0, Math.min(s, s - (oldTotal - oldAvailable)))
                                : s;
                            allData = allData.filter(r => String(r[0]).trim() !== kode && (oldKode ? String(r[0]).trim() !== oldKode : true));
                            allData.unshift([bd.kode, bd.judul, bd.pengarang, bd.penerbit, bd.tahun, bd.kategori, s, available]);
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
                        allData = await applyOfflineStockChanges(allData);
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
                else if (action === 'getExportHistoryByDate') {
                    const snapshot = await getFromLocalDB('cache', 'serverSnapshot');
                    const sheetName = payload.isArchive ? 'Arsip_Transaksi' : 'Transaksi';
                    const sheetRows = snapshot?.data?.[sheetName];
                    const exportedById = new Map();
                    if (Array.isArray(sheetRows) && sheetRows.length > 1) {
                        const toIsoDate = (value) => {
                            if (!value) return '';
                            const text = String(value).trim();
                            const dmy = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
                            if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
                            if (text.includes('T')) {
                                const date = new Date(text);
                                if (!Number.isNaN(date.getTime())) {
                                    date.setHours(date.getHours() + 7);
                                    return date.toISOString().slice(0, 10);
                                }
                            }
                            return text.slice(0, 10);
                        };
                        const serverRows = sheetRows.slice(1)
                            .filter(row => {
                                const date = toIsoDate(row[3]);
                                return date >= payload.startDate && date <= payload.endDate;
                            })
                            .map(row => row.slice(0, 9).map((value, index) => {
                                if (index < 3 || index > 5) return value;
                                const date = toIsoDate(value);
                                if (!date) return value;
                                const [year, month, day] = date.split('-');
                                return `${day}/${month}/${year}`;
                            }));
                        serverRows.forEach(row => exportedById.set(String(row[0]), row));
                    }
                    const offlineTransactions = payload.isArchive ? [] : await getFromLocalDB('offlineTransactions') || [];
                    for (const transaction of offlineTransactions) {
                        const row = transaction.row || [];
                        const date = String(row[3] || '').slice(0, 10);
                        if (date >= payload.startDate && date <= payload.endDate) {
                            exportedById.set(String(row[0]), row.slice(0, 9));
                        }
                    }
                    const deletedHistory = await getFromLocalDB('offlineDeletedHistory') || [];
                    const deletedIds = new Set(deletedHistory
                        .filter(item => Boolean(item.isArchive) === Boolean(payload.isArchive))
                        .map(item => String(item.id)));
                    const exportedRows = [...exportedById.values()]
                        .filter(row => !deletedIds.has(String(row[0])));
                    if (successCb) return successCb(exportedRows);
                    return;
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
                        const existing = allBooks.find(row => String(row[0]).trim() === (oldKode || kode));
                        const s = parseInt(bd.stok, 10) || 1;
                        const oldTotal = Number(existing?.[6]) || 0;
                        const oldAvailable = Number(existing?.[7]) || 0;
                        const available = bd.isEdit
                            ? Math.max(0, Math.min(s, s - (oldTotal - oldAvailable)))
                            : s;
                        allBooks = allBooks.filter(r => String(r[0]).trim() !== kode && (oldKode ? String(r[0]).trim() !== oldKode : true));
                        allBooks.unshift([bd.kode, bd.judul, bd.pengarang, bd.penerbit, bd.tahun, bd.kategori, s, available]);
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
                    allBooks = await applyOfflineStockChanges(allBooks);

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
                                String(r[5] || '').toLowerCase().includes(qSearch) ||
                                String(r[6] || '').toLowerCase().includes(qSearch) ||
                                String(r[7] || '').toLowerCase().includes(qSearch)
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
                        const id = String(md.id).trim().padStart(10, '0');
                        const oldId = md.oldId ? String(md.oldId).trim() : '';
                        allMembers = allMembers.filter(r => String(r[0]).trim() !== id && (oldId ? String(r[0]).trim() !== oldId : true));
                        allMembers.unshift([id, md.nama, md.kelas, md.jk, md.tglLahir, md.nohp]);
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
                                r.some(value => String(value || '').toLowerCase().includes(qSearch))
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
                            const book = q.payload.bookData;
                            const existing = allBooks.find(row => String(row[0]).trim() === String(book.oldKode || book.kode).trim());
                            const total = parseInt(book.stok, 10) || 1;
                            const oldTotal = Number(existing?.[6]) || 0;
                            const oldAvailable = Number(existing?.[7]) || 0;
                            const available = book.isEdit
                                ? Math.max(0, Math.min(total, total - (oldTotal - oldAvailable)))
                                : total;
                            allBooks = allBooks.filter(r =>
                                String(r[0]).trim() !== String(book.kode).trim() &&
                                (!book.oldKode || String(r[0]).trim() !== String(book.oldKode).trim())
                            );
                            allBooks.unshift([book.kode, book.judul, book.pengarang, book.penerbit, book.tahun, book.kategori, total, available]);
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
                            const member = q.payload.memberData;
                            const id = String(member.id).trim().padStart(10, '0');
                            allMembers = allMembers.filter(r => String(r[0]).trim() !== id && (!member.oldId || String(r[0]).trim() !== String(member.oldId).trim()));
                            allMembers.unshift([id, member.nama, member.kelas, member.jk, member.tglLahir, member.nohp]);
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

                    const archive = payload.isArchive === true;
                    const historyCacheKey = `getHistoryList_{"action":"getHistoryList","page":1,"limit":10000,"search":"","isArchive":${archive}}`;
                    const allHistoryCache = await getFromLocalDB('cache', historyCacheKey);
                    const allServerHistory = allHistoryCache?.data?.data;
                    if (Array.isArray(allServerHistory)) {
                        responseData.data = allServerHistory;
                        responseData.total = allServerHistory.length;
                    }

                    let pendingHistory = [];
                    const offlineTransactions = archive ? [] : await getFromLocalDB('offlineTransactions') || [];
                    const representedPairs = new Set();
                    for (const record of offlineTransactions) {
                        const row = record.row || [];
                        representedPairs.add(`${String(row[1])}::${String(row[2])}`);
                        pendingHistory.push({
                            idTrx: String(record.id),
                            idAnggota: String(row[1]),
                            namaAnggota: await findNameOffline('member', row[1]) || String(row[1]),
                            hpAnggota: '',
                            kodeBuku: String(row[2]),
                            judulBuku: await findNameOffline('book', row[2]) || String(row[2]),
                            tglPinjam: String(row[3] || '-'),
                            tglTempo: String(row[4] || '-'),
                            tglKembali: String(row[5] || '-'),
                            status: `${String(row[6] || 'Pinjam')} (Offline)`,
                            denda: row[7] || 0,
                            petugas: row[8] || '',
                            tglTempoTs: 0
                        });
                    }

                    const qHistory = archive ? [] : queue.filter(q =>
                        (q.action === 'prosesPeminjaman' || q.action === 'prosesPengembalian') &&
                        !representedPairs.has(`${String(q.payload.idAnggota)}::${String(q.payload.kodeBuku)}`)
                    );

                    const cfgResponse = await getFromLocalDB('cache', 'appConfig');
                    let durasi = 7;
                    if (cfgResponse && cfgResponse.data) durasi = parseInt(cfgResponse.data.DurasiPinjam) || 7;

                    for (let q of qHistory) {
                        const act = q.action;
                        const data = q.payload;

                        const tDate = new Date(q.timestamp);
                        const ty = tDate.getFullYear();
                        const tm = String(tDate.getMonth() + 1).padStart(2, '0');
                        const td = String(tDate.getDate()).padStart(2, '0');
                        const tgl = `${ty}-${tm}-${td}`;

                        const namaAnggota = await findNameOffline('member', data.idAnggota) || data.idAnggota;
                        const judulBuku = await findNameOffline('book', data.kodeBuku) || data.kodeBuku;

                        let tglTempo = '-';
                        if (act === 'prosesPeminjaman') {
                            const t = new Date(q.timestamp);
                            t.setDate(t.getDate() + durasi);
                            const y = t.getFullYear();
                            const m = String(t.getMonth() + 1).padStart(2, '0');
                            const d = String(t.getDate()).padStart(2, '0');
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

                    pendingHistory.reverse();
                    const search = String(payload.search || '').trim().toLowerCase();
                    const localIds = new Set(pendingHistory.map(row => String(row.idTrx)));
                    const deletedHistory = await getFromLocalDB('offlineDeletedHistory') || [];
                    const deletedIds = new Set(deletedHistory
                        .filter(item => Boolean(item.isArchive) === archive)
                        .map(item => String(item.id)));
                    let combinedHistory = [
                        ...pendingHistory,
                        ...(Array.isArray(responseData.data) ? responseData.data.filter(row =>
                            !localIds.has(String(row.idTrx)) && !deletedIds.has(String(row.idTrx))
                        ) : [])
                    ];
                    if (search) {
                        combinedHistory = combinedHistory.filter(row =>
                            String(row.idAnggota || '').toLowerCase().includes(search) ||
                            String(row.namaAnggota || '').toLowerCase().includes(search) ||
                            String(row.kodeBuku || '').toLowerCase().includes(search) ||
                            String(row.judulBuku || '').toLowerCase().includes(search)
                        );
                    }
                    const page = Math.max(parseInt(payload.page, 10) || 1, 1);
                    const limit = Math.max(parseInt(payload.limit, 10) || 10, 1);
                    responseData.data = combinedHistory.slice((page - 1) * limit, page * limit);
                    responseData.total = combinedHistory.length;

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
                if (window.isElectron &&
                    (action === 'prosesPeminjaman' || action === 'prosesPengembalian')) {
                    const processOfflineTransaction = window.electronAPI?.processOfflineTransaction;
                    if (typeof processOfflineTransaction !== 'function') {
                        throw new Error('Penyimpanan transaksi SQLite desktop tidak tersedia. Tutup dan buka kembali aplikasi.');
                    }

                    const result = await processOfflineTransaction(action, payload);
                    if (!result || result.success !== true || result.status !== true) {
                        throw new Error(result?.message || 'Transaksi gagal disimpan ke SQLite.');
                    }
                    if (typeof swalCountdownInterval !== 'undefined') clearInterval(swalCountdownInterval);
                    if (typeof Swal !== 'undefined') Swal.close();
                    if (successCb) successCb(result);
                    return;
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
                    if (strId.startsWith('LOCAL-')) {
                        const localQueue = await getFromLocalDB('syncQueue') || [];
                        for (const item of localQueue) {
                            if (String(item.payload?.offlineRecord?.[0]) === strId) {
                                await deleteFromLocalDB('syncQueue', item.id);
                            }
                        }
                        await deleteFromLocalDB('offlineTransactions', strId);
                        if (successCb) successCb({ success: true, status: true, message: 'Riwayat lokal dihapus.' });
                        return;
                    }
                    await saveToLocalDB('offlineDeletedHistory', strId, {
                        id: strId,
                        isArchive: payload.isArchive === true
                    });
                    await addToQueue(action, payload);
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
                    await persistOfflineCatalog(type);
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
                        if (typeof Swal !== 'undefined') Swal.close();
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
                            if (typeof Swal !== 'undefined') Swal.close();
                            if (successCb) successCb(resData);
                        })
                        .catch(err => {
                            if (typeof swalCountdownInterval !== 'undefined') clearInterval(swalCountdownInterval);
                            if (typeof Swal !== 'undefined') Swal.close();
                            if (failCb) failCb(err);
                        });
                    return; // Selesai mode online
                }

                // MODE OFFLINE (Desktop/Electron): Masukkan ke antrean lokal
                let offlineTransaction = null;
                if (action === 'prosesPeminjaman' || action === 'prosesPengembalian') {
                    offlineTransaction = await recordOfflineTransaction();
                }
                await addToQueue(action, payload, offlineTransaction);
                const catalogType = action === 'saveBook' || action === 'deleteBook'
                    ? 'buku'
                    : action === 'saveMember' || action === 'deleteMember'
                        ? 'anggota'
                        : null;
                if (catalogType) await persistOfflineCatalog(catalogType);
                // Jeda 600ms agar animasi popup SweetAlert tidak race condition
                await new Promise(r => setTimeout(r, 600));

                if (typeof swalCountdownInterval !== 'undefined') clearInterval(swalCountdownInterval);
                if (typeof Swal !== 'undefined') Swal.close();
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
                    dummyTglKembali = offlineTransaction?.row?.[4] || '-';
                } else if (action === 'prosesPengembalian') {
                    const lateDays = Math.max(0, Number(offlineTransaction?.row?.[7]) / dendaPerHari);
                    dummyTerlambat = lateDays > 0 ? `${lateDays} Hari` : 'Tidak Terlambat';
                    dummyDenda = 'Rp ' + Number(offlineTransaction?.row?.[7] || 0).toLocaleString('id-ID');
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
