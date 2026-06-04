const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Konfigurasi
const FEE = 123;
const API_KEY = "5ae1b80d10924b84b11101ba97e9e1889d8c9f47aa6248f4b127b9fd67b6c33e";
const API_URL = "https://temanqris.com/api/qris";

let transaksi = [];

// Halaman Utama
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="id">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Generator QRIS</title>
      <script src="https://cdn.tailwindcss.com"></script>
      <link href="https://cdn.jsdelivr.net/npm/font-awesome@4.7.0/css/font-awesome.min.css" rel="stylesheet">
    </head>
    <body class="bg-gradient-to-br from-green-50 to-green-100 min-h-screen">
      <div class="container mx-auto px-4 py-8 max-w-md">
        <div class="bg-white rounded-2xl shadow-xl p-6">
          <div class="text-center mb-6">
            <i class="fa fa-qrcode text-5xl text-green-500 mb-2"></i>
            <h1 class="text-2xl font-bold text-gray-800">Generator QRIS</h1>
            <p class="text-gray-500 text-sm">Otomatis + Rp 123</p>
          </div>

          <form action="/buat" method="POST" class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Nominal</label>
              <input type="number" name="nominal" min="1" required placeholder="Contoh: 1000"
                class="w-full px-4 py-3 border rounded-lg">
              <p class="text-xs text-gray-500 mt-1">Total = Nominal + Rp 123</p>
            </div>
            <button type="submit" class="w-full bg-green-500 text-white py-3 rounded-lg hover:bg-green-600">
              Buat QRIS
            </button>
          </form>
        </div>
      </div>
    </body>
    </html>
  `);
});

// Proses Buat QRIS
app.post('/buat', async (req, res) => {
  try {
    const nominalAwal = parseInt(req.body.nominal);
    if (isNaN(nominalAwal) || nominalAwal < 1) {
      return res.send('<h3 class="text-red-500 text-center">Nominal minimal Rp 1</h3><br><a href="/">Kembali</a>');
    }

    const nominalTotal = nominalAwal + FEE;

    const response = await axios.post(
      `${API_URL}/generate`,
      { amount: nominalTotal, note: `Pembayaran: Rp ${nominalAwal} + Fee Rp ${FEE}` },
      { headers: { "X-API-Key": API_KEY, "Content-Type": "application/json" }, timeout: 15000 }
    );

    if (!response.data.success) throw new Error(response.data.message || "Gagal buat QRIS");

    const data = response.data.data;
    const id = data.id || data.transaction_id;

    transaksi.push({
      id, nominalAwal, fee: FEE, nominalTotal,
      qrisUrl: data.qris_image_url || data.qr_code, waktu: Date.now(), status: "pending"
    });

    res.send(`
      <!DOCTYPE html>
      <html lang="id">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Hasil QRIS</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/font-awesome@4.7.0/css/font-awesome.min.css" rel="stylesheet">
        <script>
          setInterval(async () => {
            const res = await fetch('/cek/${id}');
            const data = await res.json();
            if (data.status === 'paid') {
              document.getElementById('status').innerHTML = '<div class="bg-green-100 p-3 rounded text-center">✅ SUDAH DIBAYAR!</div>';
              clearInterval(this);
            }
          }, 3000);
        </script>
      </head>
      <body class="bg-gradient-to-br from-green-50 to-green-100 min-h-screen">
        <div class="container mx-auto px-4 py-8 max-w-md">
          <div class="bg-white rounded-2xl shadow-xl p-6 text-center">
            <h2 class="text-xl font-bold text-green-600 mb-4">QRIS Berhasil Dibuat</h2>
            <div id="status" class="mb-4"><div class="bg-yellow-100 p-3 rounded text-center">⏳ Menunggu Pembayaran...</div></div>
            <div class="bg-gray-50 p-4 rounded text-left mb-4">
              <p>💵 Nominal: Rp ${nominalAwal.toLocaleString('id-ID')}</p>
              <p>💸 Fee: Rp ${FEE.toLocaleString('id-ID')}</p>
              <p class="font-bold text-lg">💰 Total: Rp ${nominalTotal.toLocaleString('id-ID')}</p>
              <p class="text-xs text-gray-500">ID: ${id}</p>
            </div>
            <img src="${data.qris_image_url}" alt="QRIS" class="mx-auto mb-4 border rounded-lg w-64 h-64">
            <br>
            <a href="/" class="inline-block bg-green-500 text-white px-6 py-2 rounded-lg">Buat Lagi</a>
          </div>
        </div>
      </body>
      </html>
    `);

  } catch (err) {
    res.send(`<div class="text-center p-6"><h3 class="text-red-500 mb-2">❌ Gagal: ${err.message}</h3><a href="/" class="text-green-600">Kembali</a></div>`);
  }
});

// Cek Status
app.get('/cek/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const trx = transaksi.find(t => t.id === id);
    if (!trx) return res.json({ status: "not_found" });
    if (trx.status === "paid") return res.json({ status: "paid" });

    const response = await axios.get(`${API_URL}/check/${id}`, { headers: { "X-API-Key": API_KEY }, timeout: 10000 });
    trx.status = response.data.status || "pending";

    if (Date.now() - trx.waktu > 15 * 60 * 1000) {
      transaksi = transaksi.filter(t => t.id !== id);
      return res.json({ status: "expired" });
    }

    res.json({ status: trx.status });
  } catch {
    res.json({ status: "pending" });
  }
});

module.exports = app;
