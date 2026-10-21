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
            } else if (type === 'guru') {
                // Guru & Tenaga Kependidikan (Tendik)
                if (lineStr.includes('nama') &&
                    ['nip', 'nik', 'pegawai', 'guru', 'tendik', 'jabatan', 'mapel', 'id'].some(x => lineStr.includes(x))) {
                    headerIdx = i;
                    r.forEach((cell, cIdx) => {
                        const cs = String(cell || '').toLowerCase().trim();
                        if (!cs) return;
                        if (['nip', 'nik', 'nuptk', 'id/nip', 'id nip', 'id pegawai', 'id'].some(x => cs.includes(x))) {
                            if (colMap['nip'] === undefined || cs.includes('nip') || cs.includes('nik')) colMap['nip'] = cIdx;
                        } else if (cs.includes('nama')) {
                            if (colMap['nama'] === undefined) colMap['nama'] = cIdx;
                        } else if (['jenis pegawai', 'jenis', 'status pegawai', 'tipe', 'status'].some(x => cs.includes(x))) {
                            if (colMap['jenisPegawai'] === undefined) colMap['jenisPegawai'] = cIdx;
                        } else if (['jabatan', 'mapel', 'mata pelajaran', 'bagian', 'tugas'].some(x => cs.includes(x))) {
                            if (colMap['jabatan'] === undefined) colMap['jabatan'] = cIdx;
                        } else if (['jenis kelamin', 'jk', 'gender', 'l/p'].some(x => cs.includes(x))) {
                            if (colMap['jk'] === undefined) colMap['jk'] = cIdx;
                        } else if (['hp', 'telepon', 'telp', 'wa', 'ponsel', 'kontak'].some(x => cs.includes(x))) {
                            if (colMap['hp'] === undefined) colMap['hp'] = cIdx;
                        }
                    });
                    break;
                }
            } else {
                // Anggota (Siswa)
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
                if (tahun !== '-' && (!/^\d{4}$/.test(tahun) || Number(tahun) < 1000 || Number(tahun) > new Date().getFullYear() + 1)) tahun = '-';
                kategori = (kategori !== undefined && kategori !== null && String(kategori).trim() !== '') ? String(kategori).trim() : 'Umum';

                let stokNum = parseInt(stok) || 1;
                if (stokNum < 1) stokNum = 1;
                let tersediaNum = stokTersedia === undefined || stokTersedia === null || String(stokTersedia).trim() === ''
                    ? stokNum
                    : Math.min(Math.max(parseInt(stokTersedia, 10) || 0, 0), stokNum);

                cleaned.push([kode, judul, pengarang, penerbit, tahun, kategori, stokNum, tersediaNum]);
            } else if (type === 'guru') {
                let nipVal = (colMap['nip'] !== undefined ? r[colMap['nip']] : r[0]);
                let namaVal = (colMap['nama'] !== undefined ? r[colMap['nama']] : r[1]);
                let jenisVal = (colMap['jenisPegawai'] !== undefined ? r[colMap['jenisPegawai']] : null);
                let jabVal = (colMap['jabatan'] !== undefined ? r[colMap['jabatan']] : null);
                let jkVal = (colMap['jk'] !== undefined ? r[colMap['jk']] : null);
                let hpVal = (colMap['hp'] !== undefined ? r[colMap['hp']] : null);

                // Heuristik fleksibel jika kolom tidak cocok sempurna dengan header otomatis
                if (colMap['jabatan'] === undefined && colMap['jenisPegawai'] === undefined) {
                    const c2 = String(r[2] || '').trim();
                    const c3 = String(r[3] || '').trim().toUpperCase();
                    // Jika kolom ke-3 adalah L/P/Laki-laki/Perempuan, berarti kolom ke-2 adalah Jabatan (format 5 kolom)
                    if (c3 === 'L' || c3 === 'P' || c3.startsWith('LAKI') || c3.startsWith('PEREMPUAN') || c3.startsWith('PRIA') || c3.startsWith('WANITA')) {
                        jabVal = c2;
                        jkVal = r[3];
                        hpVal = r[4];
                        const jLower = c2.toLowerCase();
                        jenisVal = (jLower.includes('tu') || jLower.includes('perpus') || jLower.includes('satpam') || jLower.includes('laboran') || jLower.includes('kebersihan') || jLower.includes('operator') || jLower.includes('administrasi') || jLower.includes('tas')) ? 'Tendik' : 'Guru';
                    } else {
                        // Format 6 kolom standar
                        jenisVal = r[2];
                        jabVal = r[3];
                        jkVal = r[4];
                        hpVal = r[5];
                    }
                } else if (colMap['jenisPegawai'] === undefined && jabVal) {
                    const jLower = String(jabVal).toLowerCase();
                    jenisVal = (jLower.includes('tu') || jLower.includes('perpus') || jLower.includes('satpam') || jLower.includes('laboran') || jLower.includes('kebersihan') || jLower.includes('operator') || jLower.includes('administrasi') || jLower.includes('tas')) ? 'Tendik' : 'Guru';
                }

                let nipStr = '';
                if (typeof nipVal === 'number' || /^\d+(\.\d+)?[eE]\+\d+$/.test(String(nipVal || '').trim())) {
                    try {
                        const num = Number(nipVal);
                        if (!Number.isNaN(num)) {
                            nipStr = BigInt(Math.round(num)).toString();
                        }
                    } catch (_) {
                        nipStr = Number(nipVal).toLocaleString('fullwide', { useGrouping: false });
                    }
                } else {
                    nipStr = String(nipVal || '').trim();
                }
                if (nipStr.toLowerCase().includes('nip') || nipStr.toLowerCase().includes('nik') || nipStr.toLowerCase().includes('id')) continue;
                
                // Ambil hanya angka
                const nipAngka = nipStr.replace(/[^0-9]/g, '');
                if (nipAngka.length < 16 || nipAngka.length > 18) continue; // Wajib 16-18 digit angka

                const nama = (namaVal !== undefined && namaVal !== null) ? String(namaVal).trim() : '';
                if (!nama) continue;

                const jenisLower = String(jenisVal || '').toLowerCase().trim();
                const jenisPegawai = (jenisLower.includes('tendik') || jenisLower.includes('kependidikan')) ? 'Tendik' : 'Guru';

                let jabStr = String(jabVal || '').trim();
                if (!jabStr || jabStr === '-' || (jenisPegawai === 'Guru' && jabStr.toLowerCase() === 'guru')) {
                    jabStr = jenisPegawai === 'Guru' ? 'Guru Mata Pelajaran' : 'Tenaga Administrasi Sekolah (TAS)';
                }

                let jkStr = String(jkVal || 'L').toUpperCase().trim();
                if (jkStr.includes('P') || jkStr.includes('WANITA') || jkStr.includes('PEREMPUAN')) jkStr = 'P';
                else jkStr = 'L';

                let hpStr = (hpVal !== undefined && hpVal !== null && String(hpVal).trim() !== '') ? String(hpVal).trim() : '-';

                cleaned.push([nipAngka, nama, jenisPegawai, jabStr, jkStr, hpStr]);
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
            if (type === 'teacher' || type === 'guru') {
                if (typeof teacherData !== 'undefined' && Array.isArray(teacherData) && teacherData.length > 0) {
                    const t = teacherData.find(x => String(Array.isArray(x) ? x[0] : (x.nip || x.id || '')).trim() === strId || String(Array.isArray(x) ? x[1] : (x.nama || '')).trim().toLowerCase() === strId.toLowerCase());
                    if (t) return Array.isArray(t) ? t[1] : t.nama;
                }
                const cKey = 'getTeacherList_{"action":"getTeacherList","page":1,"limit":10000,"search":""}';
                const cData = await getFromLocalDB('cache', cKey);
                if (cData && cData.data && Array.isArray(cData.data.data)) {
                    const found = cData.data.data.find(x => String(x[0]).trim() === strId || String(x[1]).trim().toLowerCase() === strId.toLowerCase());
                    if (found) return found[1];
                }
                const snapshot = await getFromLocalDB('cache', 'serverSnapshot');
                const snapshotRows = snapshot?.data?.Guru;
                if (Array.isArray(snapshotRows)) {
                    const found = snapshotRows.slice(1).find(row =>
                        String(row[0]).trim() === strId ||
                        String(row[1]).trim().toLowerCase() === strId.toLowerCase()
                    );
                    if (found) return found[1];
                }
                const queue = await getFromLocalDB('syncQueue') || [];
                const pend = queue.filter(q => q.action === 'saveTeacher');
                const f = pend.find(q => String(q.payload.teacherData?.nip || q.payload.teacherData?.id || '').trim() === strId || String(q.payload.teacherData?.nama || '').trim().toLowerCase() === strId.toLowerCase());
                if (f) return f.payload.teacherData.nama;

                const pendImports = queue.filter(q => q.action === 'processExcelData' && q.payload.type === 'guru');
                for (let q of pendImports) {
                    const rows = Array.isArray(q.payload.rows) ? q.payload.rows : [];
                    const fi = rows.find(r => String(r[0]).trim() === strId || String(r[1]).trim().toLowerCase() === strId.toLowerCase());
                    if (fi) return fi[1];
                }
                return null;
            } else if (type === 'member' && typeof memberData !== 'undefined' && memberData.length > 0) {
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
            if (type !== 'buku' && type !== 'anggota' && type !== 'guru') throw new Error('Jenis katalog lokal tidak valid.');

            const actionName = type === 'buku' ? 'getBookList' : (type === 'guru' ? 'getTeacherList' : 'getMemberList');
            const cacheKey = `${actionName}_{"action":"${actionName}","page":1,"limit":10000,"search":""}`;
            const cache = await getFromLocalDB('cache', cacheKey);
            const snapshot = await getFromLocalDB('cache', 'serverSnapshot');
            const snapshotRows = snapshot?.data?.[type === 'buku' ? 'Buku' : (type === 'guru' ? 'Guru' : 'Anggota')];
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

                if (type === 'guru' && mutationAction === 'saveTeacher' && mutationPayload?.teacherData) {
                    const teacher = mutationPayload.teacherData;
                    const id = String(teacher.nip || teacher.id || '').trim().replace(/[^0-9]/g, '');
                    const oldId = String(teacher.oldNip || teacher.oldId || id).trim().replace(/[^0-9]/g, '');
                    const jenisPegawai = String(teacher.jenisPegawai || 'Guru').trim();
                    let jabatan = String(teacher.jabatan || teacher.mapel || '').trim();
                    if (jenisPegawai === 'Guru' && (!jabatan || jabatan === '-')) jabatan = 'Guru Mata Pelajaran';
                    rows = rows.filter(row => keyOf(row) !== id && keyOf(row) !== oldId);
                    rows.unshift([id, teacher.nama, jenisPegawai, jabatan, teacher.jk || 'L', teacher.nohp || teacher.hp || '-']);
                    return;
                }

                if (mutationAction === 'deleteBook' && type === 'buku') {
                    rows = rows.filter(row => keyOf(row) !== String(mutationPayload?.kode || '').trim());
                    return;
                }
                if (mutationAction === 'deleteMember' && type === 'anggota') {
                    const id = normalizeId(mutationPayload?.id);
                    const rawDigits = String(mutationPayload?.id || '').trim().replace(/[^0-9]/g, '');
                    const noZero = rawDigits.replace(/^0+/, '') || '0';
                    rows = rows.filter(row => {
                        const rKey = keyOf(row);
                        const rDigits = rKey.replace(/[^0-9]/g, '');
                        const rNoZero = rDigits.replace(/^0+/, '') || '0';
                        return rKey !== id && normalizeId(rKey) !== id && rDigits !== rawDigits && rNoZero !== noZero;
                    });
                    return;
                }
                if (mutationAction === 'deleteTeacher' && type === 'guru') {
                    const id = String(mutationPayload?.id || '').trim().replace(/[^0-9]/g, '');
                    rows = rows.filter(row => keyOf(row).replace(/[^0-9]/g, '') !== id);
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
                if (value instanceof Date) return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 0, 0, 0, 0);
                const text = String(value || '').trim();
                const iso = text.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
                if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 0, 0, 0, 0);
                const dmy = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
                if (dmy) return new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]), 0, 0, 0, 0);
                const d = new Date(text);
                return Number.isNaN(d.getTime()) ? d : new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
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

            const matchLoan = (mId, bCode, status) => {
                const normM = String(mId || '').trim().replace(/^0+/, '') || '0';
                const normB = String(bCode || '').trim().toLowerCase();
                const targetM = idAnggota.replace(/^0+/, '') || '0';
                const targetB = kodeBuku.toLowerCase();
                return normM === targetM && normB === targetB && String(status || '').trim() === 'Pinjam';
            };

            let record = records
                .filter(item => matchLoan(item.row?.[1], item.row?.[2], item.row?.[6]))
                .pop();
            if (!record) {
                const rows = snapshot?.data?.Transaksi;
                if (Array.isArray(rows)) {
                    const activeRow = rows.slice(1).filter(row =>
                        matchLoan(row[1], row[2], row[6])
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
                const cachedRows = historyCache?.data?.data || historyCache?.data;
                if (Array.isArray(cachedRows)) {
                    const active = cachedRows.filter(row =>
                        matchLoan(row.idAnggota, row.kodeBuku, row.status)
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
                    matchLoan(row.idAnggota, row.kodeBuku, row.status)
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
            const lateDays = Number.isNaN(dueDate.getTime()) ? 0 : Math.max(0, Math.round((today.getTime() - dueDate.getTime()) / 86400000));
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
        const attachSessionToken = request => action === 'loginUser'
            ? request
            : { ...request, sessionToken: (window.SessionStore && window.SessionStore.get('siempus_session_token')) || '' };

        // Nama anggota selalu disimpan HURUF KAPITAL (input manual maupun edit)
        if (action === 'saveMember' && payload.memberData && typeof payload.memberData.nama === 'string') {
            payload.memberData.nama = payload.memberData.nama.trim().toUpperCase();
        }

        // VALIDASI PUSAT: berlaku untuk semua jalur (online, offline, antrean), bukan hanya form
        {
            let validationError = null;
            if (action === 'saveBook' && typeof validateBukuForm === 'function') {
                validationError = validateBukuForm(payload.bookData);
            } else if (action === 'saveMember' && typeof validateAnggotaForm === 'function') {
                validationError = validateAnggotaForm(payload.memberData);
            }
            if (validationError) {
                if (successCb) successCb({ status: false, success: false, message: validationError });
                return;
            }
        }

        const extractDeletedHistoryIds = (historyList, archiveFlag) => {
            const ids = new Set();
            const list = Array.isArray(historyList) ? historyList : Object.values(historyList || {});
            for (const item of list) {
                if (!item) continue;
                if (typeof item === 'string') {
                    ids.add(item);
                } else if (typeof item === 'object') {
                    const id = item.id || item.idTrx || item.key;
                    if (id) {
                        if (archiveFlag !== undefined && item.isArchive !== undefined) {
                            if (Boolean(item.isArchive) === Boolean(archiveFlag)) ids.add(String(id));
                        } else {
                            ids.add(String(id));
                        }
                    }
                }
            }
            return ids;
        };

        const isReadAction = ['getAppConfig', 'getBookList', 'getMemberList', 'getTeacherList', 'getDashboardStats', 'getHistoryList', 'getExportHistoryByDate', 'checkMember', 'checkTeacher', 'getAllDataForExport', 'loginUser', 'getVisitorList'].includes(action);

        if (isReadAction) {
            // MODE ONLINE (Web/GitHub Pages): Semua read action langsung ambil dari server
            if (!window.isElectron) {
                let target = (typeof API_URL !== 'undefined') ? API_URL : '';
                if (!target || target.includes('.....')) {
                    if (failCb) failCb("URL server sekolah belum dikonfigurasi pada daftarSekolah di config.js atau parameter ?id= belum sesuai.");
                    return;
                }
                let payloadWithAction = attachSessionToken({ action: action, ...payload });
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
                    if (payload.type === 'kunjungan') {
                        cacheKey = 'kunjungan_export_cache';
                    } else {
                        // Export pakai data dari limit 10000 yang di-cache saat manualSync
                        const cacheAct = payload.type === 'buku' ? 'getBookList' : (payload.type === 'guru' ? 'getTeacherList' : 'getMemberList');
                        // Sesuaikan string persis seperti yang dibuat manualSync
                        cacheKey = cacheAct + '_{"action":"' + cacheAct + '","page":1,"limit":10000,"search":""}';
                    }
                }

                const extractRowsFromCache = (cachedObj) => {
                    if (!cachedObj) return [];
                    if (Array.isArray(cachedObj)) return cachedObj;
                    if (Array.isArray(cachedObj.data)) return cachedObj.data;
                    if (cachedObj.data && Array.isArray(cachedObj.data.data)) return cachedObj.data.data;
                    return [];
                };

                let cached = await getFromLocalDB('cache', cacheKey);
                if (action === 'getAppConfig') {
                    if (!cached) cached = await getFromLocalDB('cache', 'appConfig');
                    if (cached && (!cached?.data?.UrlLogo || !cached?.data?.UrlLogoInstansi)) {
                        const altConfig = await getFromLocalDB('cache', 'appConfig');
                        if (altConfig && altConfig.data) {
                            if (!cached.data) cached.data = {};
                            if (!cached.data.UrlLogo && altConfig.data.UrlLogo) cached.data.UrlLogo = altConfig.data.UrlLogo;
                            if (!cached.data.UrlLogoInstansi && altConfig.data.UrlLogoInstansi) cached.data.UrlLogoInstansi = altConfig.data.UrlLogoInstansi;
                        }
                    }
                }
                if (typeof swalCountdownInterval !== 'undefined') clearInterval(swalCountdownInterval);

                let responseData = { success: true, status: true, data: [], items: [], total: 0, message: 'Tidak ada data di cache offline' };
                if (cached) {
                    if (cached.data && typeof cached.data === 'object' && !Array.isArray(cached.data)) {
                        responseData = JSON.parse(JSON.stringify(cached.data));
                    } else if (Array.isArray(cached.data)) {
                        responseData = { success: true, status: true, data: JSON.parse(JSON.stringify(cached.data)), total: cached.data.length };
                    } else if (Array.isArray(cached)) {
                        responseData = { success: true, status: true, data: JSON.parse(JSON.stringify(cached)), total: cached.length };
                    } else if (typeof cached === 'object') {
                        responseData = JSON.parse(JSON.stringify(cached));
                    }
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
                        if (newCfg.uploadLogo) {
                            target.UrlLogo = newCfg.uploadLogo;
                        } else if (newCfg.urlLogo !== undefined && String(newCfg.urlLogo).trim() !== '') {
                            target.UrlLogo = newCfg.urlLogo;
                        }

                        if (newCfg.uploadLogoInstansi) {
                            target.UrlLogoInstansi = newCfg.uploadLogoInstansi;
                        } else if (newCfg.urlLogoInstansi !== undefined && String(newCfg.urlLogoInstansi).trim() !== '') {
                            target.UrlLogoInstansi = newCfg.urlLogoInstansi;
                        }

                        if (newCfg.uploadBg) {
                            target.UrlBackground = newCfg.uploadBg;
                        } else if (newCfg.urlBg !== undefined && String(newCfg.urlBg).trim() !== '') {
                            target.UrlBackground = newCfg.urlBg;
                        }
                    }

                    // Pastikan logo dari cache server/database tidak pernah hilang jika configData kosong
                    if (!configData.UrlLogo && serverConfig.UrlLogo) configData.UrlLogo = serverConfig.UrlLogo;
                    if (!configData.UrlLogoInstansi && serverConfig.UrlLogoInstansi) configData.UrlLogoInstansi = serverConfig.UrlLogoInstansi;
                    if (!configData.UrlBackground && serverConfig.UrlBackground) configData.UrlBackground = serverConfig.UrlBackground;

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
                        const deleted = queue.filter(q => q.action === 'deleteMember').map(q => String(q.payload.id || '').trim().replace(/[^0-9]/g, ''));
                        const isDeleted = idToCheck => {
                            const raw = String(idToCheck || '').trim().replace(/[^0-9]/g, '');
                            const noZero = raw.replace(/^0+/, '') || '0';
                            return deleted.some(d => d === raw || (d.replace(/^0+/, '') || '0') === noZero);
                        };
                        allData = allData.filter(r => !isDeleted(r[0]));

                        const pendingMembers = queue.filter(q => q.action === 'saveMember');
                        for (let q of pendingMembers) {
                            const md = q.payload.memberData;
                            const id = String(md.id).trim().padStart(10, '0');
                            if (isDeleted(id)) continue;
                            const oldId = md.oldId ? String(md.oldId).trim() : '';
                            allData = allData.filter(r => !isDeleted(r[0]) && String(r[0]).trim() !== id && (oldId ? String(r[0]).trim() !== oldId : true));
                            allData.unshift([id, md.nama, md.kelas, md.jk, md.tglLahir, md.nohp]);
                        }

                        const pendingImports = queue.filter(q => q.action === 'processExcelData' && q.payload.type === 'anggota');
                        for (let q of pendingImports) {
                            const rows = parseImportRows('anggota', q.payload.rows);
                            for (let r of rows) {
                                const id = String(r[0]).trim();
                                if (isDeleted(id)) continue;
                                allData = allData.filter(x => !isDeleted(x[0]) && String(x[0]).trim() !== id);
                                allData.unshift(r);
                            }
                        }

                        allData = allData.filter(r => !isDeleted(r[0]));
                    } else if (payload.type === 'kunjungan') {
                        let allVisitors = await getFromLocalDB('kunjungan') || [];
                        if (!Array.isArray(allVisitors)) allVisitors = Object.values(allVisitors || {});
                        const currentQueue = Array.isArray(queue) ? queue : [];
                        const deleted = new Set(currentQueue.filter(q => q.action === 'deleteVisitor').map(q => String(q.payload?.id || '').trim()));
                        allVisitors = allVisitors.filter(r => !deleted.has(String(r.id || '').trim()));
                        const pendingVisitors = currentQueue.filter(q => q.action === 'catatKunjungan');
                        for (let q of pendingVisitors) {
                            const vd = q.payload?.visitorData;
                            const vId = String(vd?.id || '').trim();
                            if (vd && vId && !deleted.has(vId) && !allVisitors.some(x => String(x.id || '').trim() === vId)) {
                                allVisitors.unshift(vd);
                            }
                        }
                        allData = allVisitors.map(v => {
                            const tgl = v.tanggal || (v.tanggalWaktu ? v.tanggalWaktu.split(' ')[0] : '');
                            const jam = v.jam || (v.tanggalWaktu ? v.tanggalWaktu.split(' ')[1] : '');
                            return [
                                v.id || '',
                                tgl,
                                jam,
                                v.kategori || 'Siswa',
                                v.identitas || '-',
                                v.nama || '',
                                v.kelasInstansi || '-',
                                v.jk || 'L',
                                v.keperluan || 'Membaca Buku',
                                v.keterangan || '-'
                            ];
                        });
                    } else if (payload.type === 'guru') {
                        const allCache = await getFromLocalDB('cache', 'getTeacherList_{"action":"getTeacherList","page":1,"limit":10000,"search":""}');
                        if (allCache && allCache.data && Array.isArray(allCache.data.data)) {
                            allData = JSON.parse(JSON.stringify(allCache.data.data));
                        } else if (responseData && Array.isArray(responseData.data)) {
                            allData = JSON.parse(JSON.stringify(responseData.data));
                        }

                        if (allData.length === 0) {
                            const snapshot = await getFromLocalDB('cache', 'serverSnapshot');
                            if (Array.isArray(snapshot?.data?.Guru)) {
                                allData = snapshot.data.Guru.slice(1).map(r => [...r]);
                            }
                        }

                        const deleted = queue.filter(q => q.action === 'deleteTeacher').map(q => String(q.payload.id || '').trim().replace(/[^0-9]/g, ''));
                        const isDeleted = idToCheck => deleted.includes(String(idToCheck || '').trim().replace(/[^0-9]/g, ''));
                        allData = allData.filter(r => !isDeleted(r[0]));

                        const pendingTeachers = queue.filter(q => q.action === 'saveTeacher');
                        for (let q of pendingTeachers) {
                            const td = q.payload.teacherData;
                            const id = String(td.nip || td.id || '').trim().replace(/[^0-9]/g, '');
                            if (isDeleted(id)) continue;
                            const oldId = td.oldNip ? String(td.oldNip).trim().replace(/[^0-9]/g, '') : '';
                            const jenis = String(td.jenisPegawai || 'Guru').trim();
                            let jab = String(td.jabatan || td.mapel || '').trim();
                            if (jenis === 'Guru' && (!jab || jab === '-')) jab = 'Guru Mata Pelajaran';
                            else if (!jab) jab = 'Tenaga Administrasi Sekolah (TAS)';
                            const jk = String(td.jk || 'L').trim();
                            const hp = String(td.nohp || td.hp || '-').trim();

                            allData = allData.filter(r => String(r[0]).trim().replace(/[^0-9]/g, '') !== id && (!oldId || String(r[0]).trim().replace(/[^0-9]/g, '') !== oldId));
                            allData.unshift([id, td.nama, jenis, jab, jk, hp]);
                        }

                        const pendingImports = queue.filter(q => q.action === 'processExcelData' && q.payload.type === 'guru');
                        for (let q of pendingImports) {
                            const rows = parseImportRows('guru', q.payload.rows);
                            for (let r of rows) {
                                const id = String(r[0]).trim();
                                if (isDeleted(id)) continue;
                                allData = allData.filter(x => String(x[0]).trim().replace(/[^0-9]/g, '') !== String(id).replace(/[^0-9]/g, ''));
                                allData.unshift(r);
                            }
                        }

                        allData = allData.filter(r => !isDeleted(r[0]));
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
                    const deletedIds = extractDeletedHistoryIds(deletedHistory, payload.isArchive);
                    const exportedRows = [...exportedById.values()]
                        .filter(row => !deletedIds.has(String(row[0])));
                    if (successCb) return successCb(exportedRows);
                    return;
                }

                if (action === 'getBookList') {
                    let allBooks = [];
                    const allCache = await getFromLocalDB('cache', 'getBookList_{"action":"getBookList","page":1,"limit":10000,"search":""}');
                    const extractedBooks = extractRowsFromCache(allCache);
                    if (extractedBooks.length > 0) {
                        allBooks = JSON.parse(JSON.stringify(extractedBooks));
                    } else if (responseData && Array.isArray(responseData.data) && responseData.data.length > 0) {
                        allBooks = JSON.parse(JSON.stringify(responseData.data));
                    }
                    if (allBooks.length === 0) {
                        const snapshot = await getFromLocalDB('cache', 'serverSnapshot');
                        const snapData = snapshot?.data?.Buku || snapshot?.Buku;
                        if (Array.isArray(snapData) && snapData.length > 1) {
                            allBooks = snapData.slice(1).map(r => [...r]);
                        }
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
                        const rusak = parseInt(bd.rusak, 10) || 0;
                        const sumber = bd.sumber || 'BOS Reguler';
                        const stokBersih = Math.max(0, s - rusak);
                        const oldTotal = Number(existing?.[6]) || 0;
                        const oldAvailable = Number(existing?.[7]) || 0;
                        const oldRusak = Number(existing?.[9]) || 0;
                        const oldTotalBersih = Math.max(0, oldTotal - oldRusak);
                        const sedangDipinjam = Math.max(0, oldTotalBersih - oldAvailable);
                        const available = bd.isEdit
                            ? Math.max(0, stokBersih - sedangDipinjam)
                            : stokBersih;
                        allBooks = allBooks.filter(r => String(r[0]).trim() !== kode && (oldKode ? String(r[0]).trim() !== oldKode : true));
                        allBooks.unshift([bd.kode, bd.judul, bd.pengarang, bd.penerbit, bd.tahun, bd.kategori, s, available, sumber, rusak]);
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
                    const extractedMembers = extractRowsFromCache(allCache);
                    if (extractedMembers.length > 0) {
                        allMembers = JSON.parse(JSON.stringify(extractedMembers));
                    } else if (responseData && Array.isArray(responseData.data) && responseData.data.length > 0) {
                        allMembers = JSON.parse(JSON.stringify(responseData.data));
                    }
                    if (allMembers.length === 0) {
                        const snapshot = await getFromLocalDB('cache', 'serverSnapshot');
                        const snapData = snapshot?.data?.Anggota || snapshot?.Anggota;
                        if (Array.isArray(snapData) && snapData.length > 1) {
                            allMembers = snapData.slice(1).map(r => [...r]);
                        }
                    }

                    const deleted = queue.filter(q => q.action === 'deleteMember').map(q => String(q.payload.id || '').trim().replace(/[^0-9]/g, ''));
                    const isDeleted = idToCheck => {
                        const raw = String(idToCheck || '').trim().replace(/[^0-9]/g, '');
                        const noZero = raw.replace(/^0+/, '') || '0';
                        return deleted.some(d => d === raw || (d.replace(/^0+/, '') || '0') === noZero);
                    };
                    allMembers = allMembers.filter(r => !isDeleted(r[0]));

                    const pendingMembers = queue.filter(q => q.action === 'saveMember');
                    for (let q of pendingMembers) {
                        const md = q.payload.memberData;
                        const id = String(md.id).trim().padStart(10, '0');
                        if (isDeleted(id)) continue;
                        const oldId = md.oldId ? String(md.oldId).trim() : '';
                        allMembers = allMembers.filter(r => !isDeleted(r[0]) && String(r[0]).trim() !== id && (oldId ? String(r[0]).trim() !== oldId : true));
                        allMembers.unshift([id, md.nama, md.kelas, md.jk, md.tglLahir, md.nohp]);
                    }

                    const pendingImports = queue.filter(q => q.action === 'processExcelData' && q.payload.type === 'anggota');
                    for (let q of pendingImports) {
                        const rows = parseImportRows('anggota', q.payload.rows);
                        for (let r of rows) {
                            const id = String(r[0]).trim();
                            if (isDeleted(id)) continue;
                            allMembers = allMembers.filter(x => !isDeleted(x[0]) && String(x[0]).trim() !== id);
                            allMembers.unshift(r);
                        }
                    }

                    allMembers = allMembers.filter(r => !isDeleted(r[0]));

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
                } else if (action === 'getTeacherList') {
                    let allTeachers = [];
                    const allCache = await getFromLocalDB('cache', 'getTeacherList_{"action":"getTeacherList","page":1,"limit":10000,"search":""}');
                    const extractedTeachers = extractRowsFromCache(allCache);
                    if (extractedTeachers.length > 0) {
                        allTeachers = JSON.parse(JSON.stringify(extractedTeachers));
                    } else if (responseData && Array.isArray(responseData.data) && responseData.data.length > 0) {
                        allTeachers = JSON.parse(JSON.stringify(responseData.data));
                    }

                    if (allTeachers.length === 0) {
                        const snapshot = await getFromLocalDB('cache', 'serverSnapshot');
                        const snapData = snapshot?.data?.Guru || snapshot?.Guru;
                        if (Array.isArray(snapData) && snapData.length > 1) {
                            allTeachers = snapData.slice(1).map(r => [...r]);
                        }
                    }

                    const deleted = queue.filter(q => q.action === 'deleteTeacher').map(q => String(q.payload.id || '').trim().replace(/[^0-9]/g, ''));
                    const isDeleted = idToCheck => deleted.includes(String(idToCheck || '').trim().replace(/[^0-9]/g, ''));
                    allTeachers = allTeachers.filter(r => !isDeleted(r[0]));

                    const pendingTeachers = queue.filter(q => q.action === 'saveTeacher');
                    for (let q of pendingTeachers) {
                        const td = q.payload.teacherData;
                        const id = String(td.nip || td.id || '').trim().replace(/[^0-9]/g, '');
                        if (isDeleted(id)) continue;
                        const oldId = td.oldNip ? String(td.oldNip).trim().replace(/[^0-9]/g, '') : '';
                        const jenis = String(td.jenisPegawai || 'Guru').trim();
                        let jab = String(td.jabatan || td.mapel || '').trim();
                        if (jenis === 'Guru' && (!jab || jab === '-')) jab = 'Guru Mata Pelajaran';
                        else if (!jab) jab = 'Tenaga Administrasi Sekolah (TAS)';
                        const jk = String(td.jk || 'L').trim();
                        const hp = String(td.nohp || td.hp || '-').trim();

                        allTeachers = allTeachers.filter(r => String(r[0]).trim().replace(/[^0-9]/g, '') !== id && (!oldId || String(r[0]).trim().replace(/[^0-9]/g, '') !== oldId));
                        allTeachers.unshift([id, td.nama, jenis, jab, jk, hp]);
                    }

                    const pendingImports = queue.filter(q => q.action === 'processExcelData' && q.payload.type === 'guru');
                    for (let q of pendingImports) {
                        const rows = parseImportRows('guru', q.payload.rows);
                        for (let r of rows) {
                            const id = String(r[0]).trim();
                            if (isDeleted(id)) continue;
                            allTeachers = allTeachers.filter(x => String(x[0]).trim().replace(/[^0-9]/g, '') !== String(id).replace(/[^0-9]/g, ''));
                            allTeachers.unshift(r);
                        }
                    }

                    allTeachers = allTeachers.filter(r => !isDeleted(r[0]));

                    let filtered = allTeachers;
                    const qSearch = (payload.search || '').trim().toLowerCase();
                    if (qSearch) {
                        filtered = filtered.filter(r =>
                            r.some(value => String(value || '').toLowerCase().includes(qSearch))
                        );
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
                            const rusak = parseInt(book.rusak, 10) || 0;
                            const sumber = book.sumber || 'BOS Reguler';
                            const stokBersih = Math.max(0, total - rusak);
                            const oldTotal = Number(existing?.[6]) || 0;
                            const oldAvailable = Number(existing?.[7]) || 0;
                            const oldRusak = Number(existing?.[9]) || 0;
                            const oldTotalBersih = Math.max(0, oldTotal - oldRusak);
                            const sedangDipinjam = Math.max(0, oldTotalBersih - oldAvailable);
                            const available = book.isEdit
                                ? Math.max(0, stokBersih - sedangDipinjam)
                                : stokBersih;
                            allBooks = allBooks.filter(r =>
                                String(r[0]).trim() !== String(book.kode).trim() &&
                                (!book.oldKode || String(r[0]).trim() !== String(book.oldKode).trim())
                            );
                            allBooks.unshift([book.kode, book.judul, book.pengarang, book.penerbit, book.tahun, book.kategori, total, available, sumber, rusak]);
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
                        const delM = queue.filter(q => q.action === 'deleteMember').map(q => String(q.payload.id || '').trim().replace(/[^0-9]/g, ''));
                        const isMDeleted = id => {
                            const raw = String(id || '').trim().replace(/[^0-9]/g, '');
                            const noZero = raw.replace(/^0+/, '') || '0';
                            return delM.some(d => d === raw || (d.replace(/^0+/, '') || '0') === noZero);
                        };
                        allMembers = allMembers.filter(r => !isMDeleted(r[0]));
                        for (let q of queue.filter(q => q.action === 'saveMember')) {
                            const member = q.payload.memberData;
                            const id = String(member.id).trim().padStart(10, '0');
                            if (isMDeleted(id)) continue;
                            allMembers = allMembers.filter(r => !isMDeleted(r[0]) && String(r[0]).trim() !== id && (!member.oldId || String(r[0]).trim() !== String(member.oldId).trim()));
                            allMembers.unshift([id, member.nama, member.kelas, member.jk, member.tglLahir, member.nohp]);
                        }
                        for (let q of queue.filter(q => q.action === 'processExcelData' && q.payload.type === 'anggota')) {
                            const rows = parseImportRows('anggota', q.payload.rows);
                            for (let r of rows) {
                                const id = String(r[0]).trim();
                                if (isMDeleted(id)) continue;
                                allMembers = allMembers.filter(x => !isMDeleted(x[0]) && String(x[0]).trim() !== String(r[0]).trim());
                                allMembers.unshift(r);
                            }
                        }
                        allMembers = allMembers.filter(r => !isMDeleted(r[0]));

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
                    let allServerHistory = extractRowsFromCache(allHistoryCache);
                    if (allServerHistory.length === 0 && responseData && Array.isArray(responseData.data) && responseData.data.length > 0) {
                        allServerHistory = responseData.data;
                    }
                    if (allServerHistory.length === 0) {
                        const snapshot = await getFromLocalDB('cache', 'serverSnapshot');
                        const sheetName = archive ? 'Arsip_Transaksi' : 'Transaksi';
                        const snapData = snapshot?.data?.[sheetName] || snapshot?.[sheetName];
                        if (Array.isArray(snapData) && snapData.length > 1) {
                            allServerHistory = [];
                            for (let i = 1; i < snapData.length; i++) {
                                const r = snapData[i];
                                if (!r || !r[0]) continue;
                                allServerHistory.push({
                                    idTrx: String(r[0]),
                                    idAnggota: String(r[1] || ''),
                                    namaAnggota: (await findNameOffline('member', r[1])) || String(r[1] || ''),
                                    hpAnggota: '',
                                    kodeBuku: String(r[2] || ''),
                                    judulBuku: (await findNameOffline('book', r[2])) || String(r[2] || ''),
                                    tglPinjam: String(r[3] || '-'),
                                    tglTempo: String(r[4] || '-'),
                                    tglKembali: String(r[5] || '-'),
                                    status: String(r[6] || 'Pinjam'),
                                    denda: Number(r[7]) || 0,
                                    petugas: String(r[8] || ''),
                                    tglTempoTs: 0
                                });
                            }
                        }
                    }
                    responseData.data = allServerHistory;
                    responseData.total = allServerHistory.length;

                    const deletedHistory = await getFromLocalDB('offlineDeletedHistory') || [];
                    const deletedIds = extractDeletedHistoryIds(deletedHistory, archive);

                    let pendingHistory = [];
                    const offlineTransactions = archive ? [] : await getFromLocalDB('offlineTransactions') || [];
                    const representedPairs = new Set();
                    for (const record of offlineTransactions) {
                        const recId = String(record.id || record.row?.[0] || '');
                        if (recId && deletedIds.has(recId)) continue;
                        const row = record.row || [];
                        if (row[0] && deletedIds.has(String(row[0]))) continue;
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
                        !deletedIds.has('queue_' + q.id) &&
                        !deletedIds.has(String(q.id)) &&
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
                    let combinedHistory = [
                        ...pendingHistory.filter(row => !deletedIds.has(String(row.idTrx))),
                        ...(Array.isArray(responseData.data) ? responseData.data.filter(row =>
                            !localIds.has(String(row.idTrx)) && !deletedIds.has(String(row.idTrx))
                        ) : [])
                    ];
                    const historyForYearOptions = [...combinedHistory];
                    if (search) {
                        combinedHistory = combinedHistory.filter(row =>
                            String(row.idAnggota || '').toLowerCase().includes(search) ||
                            String(row.namaAnggota || '').toLowerCase().includes(search) ||
                            String(row.kodeBuku || '').toLowerCase().includes(search) ||
                            String(row.judulBuku || '').toLowerCase().includes(search)
                        );
                    }
                    const parseHistoryDate = value => {
                        if (value instanceof Date) return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 0, 0, 0, 0);
                        const text = String(value || '').trim();
                        const iso = text.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
                        if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 0, 0, 0, 0);
                        const dmy = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
                        if (dmy) return new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]), 0, 0, 0, 0);
                        const date = new Date(text);
                        return Number.isNaN(date.getTime()) ? null : new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
                    };
                    responseData.years = [...new Set(historyForYearOptions
                        .map(row => parseHistoryDate(row.tglPinjam))
                        .filter(Boolean)
                        .map(date => date.getFullYear()))]
                        .sort((a, b) => b - a);
                    if (payload.includeLateDetails === true) {
                        const configCache = await getFromLocalDB('cache', 'appConfig');
                        let configData = configCache?.data?.data || configCache?.data || {};
                        try {
                            const localConfig = JSON.parse(localStorage.getItem('offline_app_config') || '{}');
                            configData = { ...configData, ...localConfig };
                        } catch (_) { }
                        responseData.finePerDay = parseInt(configData.DendaPerHari, 10) || 500;
                    }
                    const statusFilter = String(payload.statusFilter || '').toLowerCase();
                    const yearFilter = parseInt(payload.yearFilter, 10) || 0;
                    const monthFilter = parseInt(payload.monthFilter, 10) || 0;
                    if (statusFilter || yearFilter || monthFilter) {
                        const now = Date.now();
                        combinedHistory = combinedHistory.filter(row => {
                            const borrowDate = parseHistoryDate(row.tglPinjam);
                            if (yearFilter && (!borrowDate || borrowDate.getFullYear() !== yearFilter)) return false;
                            if (monthFilter && (!borrowDate || borrowDate.getMonth() + 1 !== monthFilter)) return false;
                            const status = String(row.status || '').toLowerCase();
                            const returned = status.includes('kembali');
                            const dueDate = parseHistoryDate(row.tglTempo);
                            const overdue = status.includes('pinjam') && !returned && dueDate && now > dueDate.getTime();
                            if (statusFilter === 'returned') return returned;
                            if (statusFilter === 'overdue') return Boolean(overdue);
                            if (statusFilter === 'borrowed') return status.includes('pinjam') && !returned && !overdue;
                            return true;
                        });
                    }
                    const page = Math.max(parseInt(payload.page, 10) || 1, 1);
                    const limit = Math.max(parseInt(payload.limit, 10) || 10, 1);
                    responseData.status = true;
                    responseData.success = true;
                    responseData.data = combinedHistory.slice((page - 1) * limit, page * limit);
                    responseData.total = combinedHistory.length;
                    responseData.page = page;
                    responseData.limit = limit;

                } else if (action === 'checkMember') {
                    const mName = await findNameOffline('member', payload.id);
                    if (mName) {
                        responseData = { success: true, status: true, nama: mName };
                    } else {
                        responseData = { success: false, status: false, message: 'NISN / Anggota tidak ditemukan di database!' };
                    }
                } else if (action === 'checkTeacher') {
                    const tName = await findNameOffline('teacher', payload.id);
                    if (tName) {
                        responseData = { success: true, status: true, nama: tName };
                    } else {
                        responseData = { success: false, status: false, message: 'NIP / Guru & Tendik tidak ditemukan di database!' };
                    }
                } else if (action === 'getVisitorList') {
                    let allVisitors = await getFromLocalDB('kunjungan') || [];
                    if (!Array.isArray(allVisitors)) allVisitors = Object.values(allVisitors || {});

                    const currentQueue = Array.isArray(queue) ? queue : [];
                    const deleted = new Set(currentQueue.filter(q => q.action === 'deleteVisitor').map(q => String(q.payload?.id || '').trim()));
                    allVisitors = allVisitors.filter(r => !deleted.has(String(r.id || '').trim()));

                    const pendingVisitors = currentQueue.filter(q => q.action === 'catatKunjungan');
                    for (let q of pendingVisitors) {
                        const vd = q.payload?.visitorData;
                        const vId = String(vd?.id || '').trim();
                        if (vd && vId && !deleted.has(vId) && !allVisitors.some(x => String(x.id || '').trim() === vId)) {
                            allVisitors.unshift(vd);
                        }
                    }

                    allVisitors.sort((a, b) => String(b.tanggalWaktu || '').localeCompare(String(a.tanggalWaktu || '')));

                    const now = new Date();
                    const pad = n => String(n).padStart(2, '0');
                    const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

                    let todayCount = 0;
                    let siswaCount = 0;
                    let guruCount = 0;
                    let tamuCount = 0;

                    let filtered = allVisitors.filter(item => {
                        const dOnly = String(item.tanggalWaktu || '').substring(0, 10);
                        if (dOnly === todayStr) {
                            todayCount++;
                            const kat = String(item.kategori || '').toLowerCase();
                            if (kat.includes('siswa')) siswaCount++;
                            else if (kat.includes('guru') || kat.includes('tendik')) guruCount++;
                            else tamuCount++;
                        }

                        if (payload.kategori && payload.kategori !== '' && payload.kategori !== 'semua') {
                            if (!String(item.kategori || '').toLowerCase().includes(payload.kategori.toLowerCase())) return false;
                        }
                        if (payload.startDate && dOnly < payload.startDate) return false;
                        if (payload.endDate && dOnly > payload.endDate) return false;

                        if (payload.search && payload.search.trim() !== '') {
                            const s = payload.search.toLowerCase().trim();
                            const match = String(item.nama || '').toLowerCase().includes(s) ||
                                          String(item.identitas || '').toLowerCase().includes(s) ||
                                          String(item.kelasInstansi || '').toLowerCase().includes(s) ||
                                          String(item.keperluan || '').toLowerCase().includes(s);
                            if (!match) return false;
                        }
                        return true;
                    });

                    const page = Math.max(parseInt(payload.page, 10) || 1, 1);
                    const limit = Math.max(parseInt(payload.limit, 10) || 10, 1);
                    const paged = filtered.slice((page - 1) * limit, page * limit);

                    responseData = {
                        status: true,
                        success: true,
                        data: paged,
                        total: filtered.length,
                        page: page,
                        limit: limit,
                        stats: {
                            today: todayCount,
                            siswa: siswaCount,
                            guru: guruCount,
                            tamu: tamuCount,
                            totalAll: allVisitors.length
                        }
                    };
                }

                if (successCb) successCb(responseData);
            } catch (err) {
                if (typeof swalCountdownInterval !== 'undefined') clearInterval(swalCountdownInterval);
                if (failCb) failCb(err);
            }
        } else {
            try {
                if (action === 'deleteHistory') {
                    // MODE ONLINE (Web): Jika online di web browser, kirim langsung ke GAS via fetch
                    if (!window.isElectron && navigator.onLine) {
                        let target = (typeof API_URL !== 'undefined') ? API_URL : '';
                        if (target && !target.includes('.....')) {
                            let payloadWithAction = attachSessionToken({ action: action, ...payload });
                            fetch(target, {
                                redirect: 'follow', method: 'POST',
                                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                                body: JSON.stringify(payloadWithAction)
                            })
                                .then(r => r.json())
                                .then(resData => {
                                    if (successCb) successCb(resData);
                                })
                                .catch(err => {
                                    if (failCb) failCb(err);
                                });
                            return;
                        }
                    }

                    // MODE OFFLINE (Desktop/Electron atau Web tanpa internet):
                    const strId = String(payload.idTrx || "");
                    const isArchive = payload.isArchive === true;

                    // 1. Jika data antrean lokal (dimulai 'queue_')
                    if (strId.startsWith('queue_')) {
                        const qId = strId.replace('queue_', '');
                        await deleteFromLocalDB('syncQueue', qId);
                        await deleteFromLocalDB('offlineTransactions', qId);
                        await deleteFromLocalDB('offlineTransactions', strId);
                        updateSyncBadge();
                        if (successCb) successCb({ success: true, status: true, message: 'Riwayat offline berhasil dibatalkan.' });
                        return;
                    }

                    // 2. Bersihkan dari offlineTransactions (baik berdasarkan key langsung maupun pengecekan record)
                    await deleteFromLocalDB('offlineTransactions', strId);
                    const currentOffTxs = await getFromLocalDB('offlineTransactions') || [];
                    for (const rec of (Array.isArray(currentOffTxs) ? currentOffTxs : [])) {
                        if (String(rec.id) === strId || String(rec.row?.[0]) === strId) {
                            await deleteFromLocalDB('offlineTransactions', rec.id || strId);
                        }
                    }

                    // 3. Bersihkan antrean lokal (syncQueue) yang merujuk pada transaksi ini
                    const currentQueue = await getFromLocalDB('syncQueue') || [];
                    for (const item of (Array.isArray(currentQueue) ? currentQueue : [])) {
                        const offlineRecId = String(item.payload?.offlineRecord?.[0] || '');
                        const payloadTrxId = String(item.payload?.idTrx || '');
                        if (offlineRecId === strId || payloadTrxId === strId) {
                            await deleteFromLocalDB('syncQueue', item.id);
                        }
                    }

                    // 4. Jika transaksi lokal murni (LOCAL-), cukup hapus lokal saja
                    if (strId.startsWith('LOCAL-')) {
                        updateSyncBadge();
                        if (successCb) successCb({ success: true, status: true, message: 'Riwayat lokal berhasil dihapus.' });
                        return;
                    }

                    // 5. Catat ke offlineDeletedHistory agar tidak muncul lagi pada tampilan offline
                    await saveToLocalDB('offlineDeletedHistory', {
                        id: strId,
                        isArchive: isArchive
                    });

                    // 6. Masukkan ke syncQueue hanya jika BELUM ada di antrean (cegah duplikasi dan badge bertambah terus)
                    const refreshedQueue = await getFromLocalDB('syncQueue') || [];
                    const alreadyQueued = (Array.isArray(refreshedQueue) ? refreshedQueue : []).some(
                        q => q.action === 'deleteHistory' && String(q.payload?.idTrx) === strId && Boolean(q.payload?.isArchive) === isArchive
                    );
                    if (!alreadyQueued) {
                        await addToQueue(action, { idTrx: strId, isArchive: isArchive });
                    }

                    updateSyncBadge();
                    if (successCb) successCb({
                        success: true,
                        status: true,
                        message: 'Riwayat disembunyikan dari data lokal dan masuk antrean sinkronisasi.'
                    });
                    return;
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
                        const payloadOnline = attachSessionToken({ action: action, type: type, rows: cleanedRows });
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
                    let payloadWithAction = attachSessionToken({ action: action, ...payload });
                    fetch(target, {
                        redirect: 'follow', method: 'POST',
                        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                        body: JSON.stringify(payloadWithAction)
                    })
                        .then(r => r.json())
                        .then(async (resData) => {
                            if (typeof swalCountdownInterval !== 'undefined') clearInterval(swalCountdownInterval);
                            if (typeof Swal !== 'undefined') Swal.close();
                            if (resData && resData.status !== false) {
                                if (action === 'deleteVisitor' && payload.id) {
                                    try { await deleteFromLocalDB('kunjungan', payload.id); } catch (_) { }
                                }
                            }
                            if (successCb) successCb(resData);
                        })
                        .catch(err => {
                            if (typeof swalCountdownInterval !== 'undefined') clearInterval(swalCountdownInterval);
                            if (typeof Swal !== 'undefined') Swal.close();
                            if (failCb) failCb(err);
                        });
                    return; // Selesai mode online
                }

                // MODE OFFLINE (Desktop/Electron) - Handler Khusus SOP & Dasar Hukum
                if (action === 'uploadSopPdf') {
                    if (window.electronAPI && window.electronAPI.saveOfflineSopPdf) {
                        const offRes = await window.electronAPI.saveOfflineSopPdf(payload);
                        localStorage.setItem('offline_sop_pdf_pending_sync', 'true');
                        if (successCb) successCb(offRes);
                        return;
                    }
                }
                if (action === 'getSopPdf') {
                    if (window.electronAPI && window.electronAPI.getOfflineSopPdf) {
                        const offRes = await window.electronAPI.getOfflineSopPdf();
                        if (successCb) successCb(offRes);
                        return;
                    }
                }
                if (action === 'deleteSopPdf') {
                    if (window.electronAPI && window.electronAPI.deleteOfflineSopPdf) {
                        const offRes = await window.electronAPI.deleteOfflineSopPdf();
                        localStorage.removeItem('offline_sop_pdf_pending_sync');
                        if (successCb) successCb(offRes);
                        return;
                    }
                }
                if (action === 'saveDasarHukumList') {
                    localStorage.setItem('dasar_hukum_list', JSON.stringify(payload.list || []));
                    await saveToLocalDB('cache', { key: 'dasar_hukum_list', data: payload.list || [] });
                    if (successCb) successCb({ status: true, success: true, message: 'Daftar dasar hukum tersimpan lokal.' });
                    return;
                }
                if (action === 'getDasarHukumList') {
                    let list = null;
                    try { list = JSON.parse(localStorage.getItem('dasar_hukum_list') || 'null'); } catch(_) {}
                    if (!list) {
                        const cached = await getFromLocalDB('cache', 'dasar_hukum_list');
                        if (cached && cached.data) list = cached.data;
                    }
                    if (successCb) successCb({ status: true, success: true, list: list });
                    return;
                }

                // MODE OFFLINE (Desktop/Electron): Masukkan ke antrean lokal
                let offlineTransaction = null;
                if (action === 'prosesPeminjaman' || action === 'prosesPengembalian') {
                    offlineTransaction = await recordOfflineTransaction();
                } else if (action === 'catatKunjungan' && payload.visitorData) {
                    await saveToLocalDB('kunjungan', payload.visitorData);
                } else if (action === 'deleteVisitor' && payload.id) {
                    const targetId = String(payload.id).trim();
                    await deleteFromLocalDB('kunjungan', targetId);
                    const currentQueue = await getFromLocalDB('syncQueue') || [];
                    for (const item of (Array.isArray(currentQueue) ? currentQueue : [])) {
                        if (item.action === 'catatKunjungan') {
                            const itemId = String(item.payload?.visitorData?.id || '').trim();
                            if (itemId === targetId) {
                                await deleteFromLocalDB('syncQueue', item.id);
                            }
                        }
                    }
                } else if (action === 'deleteMember' && payload.id) {
                    const targetDigits = String(payload.id).trim().replace(/[^0-9]/g, '');
                    const targetNoZero = targetDigits.replace(/^0+/, '') || '0';
                    const currentQueue = await getFromLocalDB('syncQueue') || [];
                    for (const item of (Array.isArray(currentQueue) ? currentQueue : [])) {
                        if (item.action === 'saveMember') {
                            const itemDigits = String(item.payload?.memberData?.id || '').trim().replace(/[^0-9]/g, '');
                            const itemNoZero = itemDigits.replace(/^0+/, '') || '0';
                            if (itemDigits === targetDigits || itemNoZero === targetNoZero) {
                                await deleteFromLocalDB('syncQueue', item.id);
                            }
                        }
                    }
                } else if (action === 'deleteBook' && payload.kode) {
                    const targetKode = String(payload.kode).trim().toLowerCase();
                    const currentQueue = await getFromLocalDB('syncQueue') || [];
                    for (const item of (Array.isArray(currentQueue) ? currentQueue : [])) {
                        if (item.action === 'saveBook') {
                            const itemKode = String(item.payload?.bookData?.kode || '').trim().toLowerCase();
                            if (itemKode === targetKode) {
                                await deleteFromLocalDB('syncQueue', item.id);
                            }
                        }
                    }
                } else if (action === 'deleteTeacher' && payload.id) {
                    const targetNip = String(payload.id).trim().replace(/[^0-9]/g, '');
                    // Bersihkan dari syncQueue jika ada saveTeacher yang belum tersinkron
                    const currentQueue = await getFromLocalDB('syncQueue') || [];
                    for (const item of (Array.isArray(currentQueue) ? currentQueue : [])) {
                        if (item.action === 'saveTeacher') {
                            const itemNip = String(item.payload?.teacherData?.nip || item.payload?.teacherData?.id || '').trim().replace(/[^0-9]/g, '');
                            if (itemNip === targetNip) {
                                await deleteFromLocalDB('syncQueue', item.id);
                            }
                        }
                    }
                }
                await addToQueue(action, payload, offlineTransaction);
                const catalogType = action === 'saveBook' || action === 'deleteBook'
                    ? 'buku'
                    : action === 'saveMember' || action === 'deleteMember'
                        ? 'anggota'
                        : action === 'saveTeacher' || action === 'deleteTeacher'
                            ? 'guru'
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
        checkTeacher: function (id) { execute('checkTeacher', { id: id }); },
        prosesPeminjaman: function (m, b, p) { execute('prosesPeminjaman', { idAnggota: m, kodeBuku: b, petugas: p }); },
        prosesPengembalian: function (m, b, p) { execute('prosesPengembalian', { idAnggota: m, kodeBuku: b, petugas: p }); },
        getBookList: function (p, l, q) { execute('getBookList', { page: p, limit: l, search: q }); },
        saveBook: function (d) { execute('saveBook', { bookData: d }); },
        deleteBook: function (k) { execute('deleteBook', { kode: k }); },
        getMemberList: function (p, l, q) { execute('getMemberList', { page: p, limit: l, search: q }); },
        saveMember: function (d) { execute('saveMember', { memberData: d }); },
        deleteMember: function (id) { execute('deleteMember', { id: id }); },
        getTeacherList: function (p, l, q) { execute('getTeacherList', { page: p, limit: l, search: q }); },
        saveTeacher: function (d) { execute('saveTeacher', { teacherData: d }); },
        deleteTeacher: function (id) { execute('deleteTeacher', { id: id }); },
        getDashboardStats: function () { execute('getDashboardStats'); },
        getHistoryList: function (p, l, q, isA, statusFilter, yearFilter, monthFilter, includeLateDetails) {
            execute('getHistoryList', {
                page: p, limit: l, search: q, isArchive: isA,
                statusFilter, yearFilter, monthFilter, includeLateDetails
            });
        },
        saveAppConfig: function (d) { execute('saveAppConfig', { configData: d }); },
        updateUserCredentials: function (o, n, p) { execute('updateUserCredentials', { oldUser: o, newUser: n, newPass: p }); },
        processExcelData: function (t, r) { execute('processExcelData', { type: t, rows: r }); },
        getAllDataForExport: function (t) { execute('getAllDataForExport', { type: t }); },
        getExportHistoryByDate: function (s, e, a) { execute('getExportHistoryByDate', { startDate: s, endDate: e, isArchive: a }); },
        deleteHistory: function (id, isA) { execute('deleteHistory', { idTrx: id, isArchive: isA }); },
        callGeminiAI: function (p) { execute('callGeminiAI', { prompt: p }); },
        catatKunjungan: function (d) { execute('catatKunjungan', { visitorData: d }); },
        getVisitorList: function (p, l, q, k, s, e) { execute('getVisitorList', { page: p, limit: l, search: q, kategori: k, startDate: s, endDate: e }); },
        deleteVisitor: function (id) { execute('deleteVisitor', { id: id }); },
        uploadSopPdf: function (dataUrl, name) { execute('uploadSopPdf', { fileDataUrl: dataUrl, filename: name }); },
        getSopPdf: function (includeB64) { execute('getSopPdf', { includeBase64: includeB64 }); },
        deleteSopPdf: function () { execute('deleteSopPdf'); },
        saveDasarHukumList: function (list) { execute('saveDasarHukumList', { list: list }); },
        getDasarHukumList: function () { execute('getDasarHukumList'); }
    };
}

if (typeof google === 'undefined') {
    window.google = { get script() { return { get run() { return apiHelper(); } } } };
}
