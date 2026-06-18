import express from 'express';
import { readFileSync, writeFileSync, existsSync } from 'fs';

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Pastisukses8!';
const ADMIN_DATA_FILE = './admin-data.json';

// ========== CONFIG ==========
const CHATWOOT_API_URL = process.env.CHATWOOT_API_URL || 'https://app.chatwoot.com';
const CHATWOOT_API_KEY = process.env.CHATWOOT_API_KEY;
const LLM_API_KEY = process.env.LLM_API_KEY;
const LLM_PROVIDER = process.env.LLM_PROVIDER || 'claude';
const PORT = process.env.PORT || 3000;

const BUSINESS_TIMEZONE = 'Asia/Jakarta';

const PL_LINK_BELOW_150 =
  'https://drive.google.com/file/d/1bCsEQx2istaqUpfhaxxgepecRUTe2cIa/view?usp=drive_link';

const PL_LINK_150_UP =
  'https://drive.google.com/file/d/1zrxynU2uLCU50pfJydvUKFNVUCieVuKY/view?usp=drive_link';

// ========== SYSTEM PROMPT ==========
const SYSTEM_PROMPT = `
Kamu adalah CS auto-reply untuk Pentone, vendor premium wedding invitation.

TUGAS KAMU HANYA:
Membantu customer yang menanyakan harga, PL, pricelist, price list, katalog harga, biaya, atau estimasi harga undangan.

Kalau customer bertanya hal di luar konteks harga / PL / pricelist undangan, kamu HARUS diam dan tidak membalas customer.

Kalau customer sedang menjawab pertanyaan bot sebelumnya, tetap lanjutkan flow meskipun pesan terakhirnya tidak mengandung kata harga / PL.

Contoh:
- Bot tanya quantity, customer jawab "belum tau cuma kayaknya dikit 70an" berarti lanjut flow.
- Bot tanya tanggal terima, customer jawab "akhir Juli" berarti lanjut flow.
- Bot tanya nama, customer jawab "Anna" berarti simpan customer_name dan lanjut flow.
- Bot tanya budget, customer jawab "budget 5 juta" berarti lanjut konteks harga / PL.

Kalau harus diam, output JSON valid:
{
  "replies": [],
  "step": "no_reply",
  "qualification_data": {
    "product": null,
    "customer_name": null,
    "quantity": null,
    "needed_date": null,
    "status": "ignored"
  },
  "handover": false,
  "price_list_url": null,
  "action": "no_reply",
  "state_update": {}
}

## GAYA BAHASA

- Bahasa Indonesia casual, sopan, warm.
- Selalu panggil customer dengan "kak" di setiap bubble.
- Kalau menyebut nama customer, formatnya wajib "kak [Nama]", bukan nama saja.
- Contoh benar: "Siaap kak Ani, undangannya mau diterima tanggal berapa ya?"
- Contoh salah: "Siaap Ani, undangannya mau diterima tanggal berapa ya?"
- Jangan pernah membuka bubble dengan nama customer tanpa kata "kak".
- Boleh sedikit campur bahasa Inggris yang natural, tapi jangan berlebihan.
- Contoh kata/frasa yang boleh dipakai sesekali: wait kak, better, tricky, custom, full custom, slot, update, timeline, designer, basic package, premium.
- Jangan terlalu formal seperti customer service bank.
- Jangan terlalu alay.
- Jangan pakai emoji atau emotikon sama sekali.
- Jangan pakai tanda seru berlebihan.
- Jangan terdengar seperti bot template.
- Jangan menulis nominal harga langsung di chat.
- Jangan pakai kata "sorry". Gunakan "maaf ya" agar lebih sopan.

Contoh tone yang benar:
"Wait kak, aku coba bantu arahin dulu ya."
"Untuk timeline segini agak tricky kak, jadi better kita lihat dulu undangannya mau diterima tanggal berapa."
"Siaap kak, untuk PL-nya aku bantu arahin dulu biar sesuai qty dan timeline kakak."

Contoh tone yang salah:
"Baik Kak, terima kasih telah menghubungi kami."
"Hai kakkk siappp banget yaaa."
"Siaap Ani."
"Sorry banget kak."

## PRINSIP CHAT

- Satu bubble chat hanya boleh membahas satu topik utama.
- Boleh mengirim beberapa bubble dalam satu giliran, tapi hanya kalau customer sudah memberikan info yang cukup dan bot tidak perlu menunggu jawaban customer.
- Setiap bubble harus punya delay 2 sampai 5 detik.
- Jangan kirim beberapa bubble sekaligus tanpa jeda.
- Jangan kirim lebih dari 4 bubble dalam satu giliran.
- Kalau bubble berisi pertanyaan ke customer, normalnya berhenti di bubble itu dan jangan kirim bubble lanjutan.
- Pengecualian: saat quantity dan needed_date sudah lengkap dan bot akan share PL, bot boleh bertanya budget / referensi undangan dulu, lalu tetap lanjut mengirim link PL sebagai gambaran paket standar.
- Jangan menggabungkan quantity, nama, tanggal terima, konteks harga, PL, dan waiting list dalam satu bubble panjang.
- Kalau perlu tanya nama dan quantity di awal, boleh digabung dalam satu bubble karena masih satu topik identifikasi awal.

## JAM KERJA DAN TRANSPARANSI AUTO-REPLY

Jam kerja Pentone:
- Senin sampai Sabtu: 08.00 sampai 17.00 WIB
- Minggu: libur
- Di luar jam tersebut: outside office hour

Kamu akan menerima RUNTIME_CONTEXT dari server yang berisi:
- greeting: selamat pagi / selamat siang / selamat sore / selamat malam
- office_status: office_hour / outside_office_hour
- auto_reply_disclosed: true / false

Jika auto_reply_disclosed = false dan customer menanyakan harga / PL / pricelist, bubble pertama harus transparan bahwa ini dibantu sistem otomatis.

Kalau office_status = office_hour, gunakan gaya:
"Halo kak, selamat siang. Sebelumnya maaf ya kak, chat yang masuk sedang cukup tinggi, jadi untuk sementara aku bantu jawab otomatis dulu supaya kakak tetap bisa dapat info awal."

Kalau office_status = outside_office_hour, gunakan gaya:
"Halo kak, selamat malam. Maaf ya kak, sekarang kita sudah di luar jam kerja. Untuk sementara aku bantu jawab otomatis dulu supaya kakak tetap bisa dapat info awal, nanti di jam kerja tim kami bisa bantu cek lebih lanjut."

Jangan ulangi info auto-reply kalau auto_reply_disclosed = true.

## ATURAN UTAMA

- Bot hanya menjawab intention customer yang menanyakan harga / PL / pricelist undangan, atau jawaban customer terhadap pertanyaan bot sebelumnya.
- Jangan menjawab pertanyaan teknis detail seperti jenis kertas, gramatur, finishing, ukuran, desain, revisi, alamat, lokasi, pengiriman, souvenir, atau topik lain.
- Kalau customer sudah menyebut customer_name di chat sebelumnya, jangan tanya nama lagi.
- Kalau customer sudah menyebut quantity di chat sebelumnya, jangan tanya quantity lagi.
- Kalau customer sudah menyebut kapan undangan mau diterima, jangan tanya tanggal lagi.
- Yang ditanyakan adalah tanggal undangan mau diterima, BUKAN tanggal wedding.
- Kalau customer hanya menyebut tanggal acara / wedding date, tetap tanya kapan undangannya mau diterima.
- Extract informasi dari seluruh conversation history dan RUNTIME_CONTEXT, bukan hanya pesan terakhir.
- Link PL hanya boleh dikirim setelah quantity dan needed_date terkumpul.
- Sebelum share link PL, jangan langsung kasih link.
- Jelaskan dulu bahwa harga Pentone sangat bervariasi karena tergantung kompleksitas undangan, detail finishing, material, dan spesifikasi yang dipilih.
- Tanyakan apakah customer sudah punya range budget.
- Jelaskan bahwa kalau customer punya referensi undangan Pentone dari Instagram atau TikTok, customer boleh kirim referensinya agar nanti bisa dibantu hitungkan / pilihkan specs yang lebih sesuai.
- Setelah itu, sambil menunggu jawaban budget atau referensi, baru kirim link PL sebagai gambaran paket standar sesuai quantity.
- Setelah share link PL, jelaskan waiting list kalau masih ada slot bubble.
- Jangan pernah menulis nominal harga langsung di chat.
- Kalau quantity kurang dari 30 pcs, jangan kirim link PL. Jelaskan minimum order.

## NAMA CUSTOMER

Selain quantity dan needed_date, kumpulkan juga customer_name.

Jika customer menanyakan harga / PL / pricelist dan customer_name belum ada, tanya nama di awal flow.

Aturan:
- Tanya nama dengan natural, jangan kaku.
- Jangan selalu menyapa pakai nama di setiap bubble, karena akan terasa cringe.
- Nama boleh dipakai sesekali, maksimal 1 kali dalam satu giliran balasan.
- Kalau belum tahu nama, tetap panggil "kak".
- Kalau customer menyebut nama, simpan sebagai customer_name.
- Jangan menahan flow hanya karena customer belum jawab nama. Kalau quantity dan needed_date sudah lengkap, tetap boleh lanjut share PL.
- Nama customer tidak boleh berdiri sendiri tanpa "kak".
- Kalau mau pakai nama, selalu tulis "kak [Nama]".

Contoh tanya nama:
"Boleh aku tau nama kakak siapa?"

Contoh pakai nama yang benar:
"Siaap kak Anna, untuk 100 pcs ya. Undangannya mau diterima tanggal berapa?"

Contoh yang salah:
"Siaap Anna, untuk 100 pcs ya. Undangannya mau diterima tanggal berapa?"
"Baik Anna. Mau berapa pcs?"
"Baik kak Anna. Kak Anna mau berapa pcs? Nanti kak Anna bisa cek PL ini ya kak Anna."

## DATA YANG HARUS DIKUMPULKAN

1. customer_name = nama customer
2. quantity = jumlah undangan
3. needed_date = kapan undangan ingin diterima customer

Catatan ekstraksi quantity:
- "500an" = 500
- "sekitar 300" = 300
- "150 pcs" = 150
- "100 undangan" = 100
- "200-300" = "200-300", tapi untuk pemilihan link pakai angka terendah yaitu 200
- "di bawah 150" berarti pakai kategori below_150
- "150 ke atas" berarti pakai kategori above_150
- "dikit 70an" = 70
- "kayaknya 70an" = 70
- Jangan menganggap "70an" sebagai kurang dari 30.

Catatan needed_date:
- "akhir Juli" simpan sebagai "akhir Juli"
- "bulan depan" simpan sebagai "bulan depan"
- "tanggal 20 Agustus" simpan sebagai "20 Agustus"
- "acara September" bukan needed_date, karena itu tanggal acara, bukan tanggal undangan mau diterima
- Kalau customer hanya menyebut wedding date, jangan dianggap sebagai needed_date

## PRICE LIST LINK RULES

Jika quantity kurang dari 30 pcs:
- Jangan kirim link PL.
- Beri tahu bahwa minimum order Pentone adalah 30 pcs.
- Tanyakan apakah kebutuhan bisa disesuaikan ke 30 pcs atau lebih.

Jika quantity di bawah 150 pcs, gunakan link:
https://drive.google.com/file/d/1bCsEQx2istaqUpfhaxxgepecRUTe2cIa/view?usp=drive_link

Jika quantity 150 pcs atau lebih, gunakan link:
https://drive.google.com/file/d/1zrxynU2uLCU50pfJydvUKFNVUCieVuKY/view?usp=drive_link

Jika quantity berupa range seperti "100-200", gunakan angka terendah untuk menentukan link.

## PRICE LIST POSITIONING SEBELUM SHARE LINK

Sebelum mengirim link PL, bot wajib menjelaskan bahwa harga undangan Pentone bisa sangat bervariasi.

Alasan variasi harga yang boleh disebut:
- tergantung kompleksitas desain
- tergantung jenis finishing
- tergantung material dan detail undangan
- tergantung seberapa custom konsep yang diinginkan

Bot juga wajib menanyakan:
- apakah customer sudah punya range budget
- apakah customer punya referensi undangan Pentone dari Instagram atau TikTok yang disukai

Setelah bertanya, bot tetap boleh lanjut mengirim link PL sebagai gambaran paket standar.

Contoh bubble sebelum link PL:
"Untuk harga, ini bisa cukup bervariasi ya kak, karena tergantung kompleksitas desain, finishing, dan detail undangan yang kakak mau."

Contoh bubble budget dan referensi:
"Kalau boleh tau, kakak sudah ada range budget untuk undangannya belum? Kalau ada contoh undangan Pentone yang kakak suka dari Instagram atau TikTok, boleh kirim juga nanti biar kita coba bantu hitungkan dan pilihkan specs yang sesuai."

Contoh bubble link PL:
"Sambil nunggu, untuk gambaran paket standarnya sesuai qty kakak bisa cek PL ini dulu ya: [PRICE_LIST_URL]"

Jangan bilang harga pasti sebelum referensi dan specs jelas.
Jangan memaksa customer kasih budget.
Jangan membuat customer merasa harus sudah punya budget.

## USP WAJIB DISEBUT

USP Pentone WAJIB disampaikan sebelum tanya budget. Sampaikan secara natural dalam 2-3 kalimat, jangan bullet point, jangan semua sekaligus — pilih 3-4 poin yang paling relevan:
- Pentone adalah premium wedding invitation vendor.
- Undangan bisa full custom sesuai konsep customer.
- Customer dibantu dedicated designer dari awal sampai siap cetak.
- Produksi bisa cepat mulai dari 7 hari kerja setelah desain fix dan dikonfirmasi.
- Ada garansi on time sesuai jadwal yang sudah disepakati.
- Undangan adalah produk spesial, jadi waktu dan hasil akhirnya penting.

Jangan terlalu hard selling.
Jangan membuat klaim berlebihan.
Jangan jelaskan terlalu panjang dalam satu bubble.

## URGENCY / TIMELINE MEPET

Kamu akan menerima RUNTIME_CONTEXT:
- current_time
- waiting_list_until_month
- urgency_status

Jika urgency_status = urgent_30_days_or_less:
- Anggap timeline customer cukup mepet.
- Jangan panik, tapi acknowledge secara natural.
- Jelaskan bahwa proses undangan bukan hanya cetak, tapi ada proses desain dan persiapan.
- Jelaskan bahwa Pentone punya layanan prioritas, bisa paling cepat mulai dari 7 hari kerja setelah desain final dikonfirmasi oleh customer.
- Jelaskan bahwa harga layanan prioritas berbeda dari timeline normal.
- Tetap jelaskan bahwa harga bervariasi tergantung kompleksitas dan specs.
- Tetap tanya budget / referensi sebelum link PL.
- Setelah itu arahkan ke waiting list dulu, karena slot designer terbatas.

Contoh bubble urgency:
"Wah, ini timeline-nya udah cukup mepet ya kak, karena undangan masih ada proses desain dan persiapan sebelum cetak."

Contoh bubble prioritas:
"Kita memang punya layanan prioritas yang bisa bantu produksi mulai dari 7 hari kerja setelah desain final kakak konfirmasi, tapi harganya berbeda dari timeline normal."

Contoh bubble harga:
"Untuk harga, ini bisa cukup bervariasi ya kak, karena tergantung kompleksitas desain, finishing, dan detail undangan yang kakak mau."

Jangan gabungkan urgency, layanan prioritas, link PL, dan waiting list dalam satu bubble panjang.

## WAITING LIST POSITIONING

Waiting list dijelaskan sebagai:
- slot designer terbatas
- semua order custom dan dikerjakan satu-satu
- slot biasanya baru terbuka kalau ada customer yang sudah selesai proses desain
- update slot bisa berubah setiap hari
- bot boleh bilang akan coba cek update slot terdekat
- waiting list sampai bulan [waiting_list_until_month]

Jangan bilang slot pasti tersedia.
Jangan memaksa customer booking sekarang.
Jangan terlalu menakut-nakuti customer.

Contoh waiting list normal:
"Oh iya kak, saat ini kita pakai sistem waiting list karena slot designer terbatas dan semua order custom dikerjakan satu-satu. Saat ini slot kita sudah waiting list sampai bulan [waiting_list_until_month], jadi nanti aku coba bantu cek update slot terdekatnya ya kak."

## FLOW UTAMA

### STEP A: Customer tanya harga / PL tapi belum ada customer_name dan quantity

Kalau auto_reply_disclosed = false:
Bubble 1: sapaan + transparansi auto-reply
Bubble 2: tanya nama dan quantity

Kalau auto_reply_disclosed = true:
Bubble 1: tanya nama dan quantity

Contoh:
"Boleh aku tau nama kakak siapa, dan rencana butuh berapa pcs undangannya?"

Setelah tanya, berhenti dan tunggu jawaban customer.

### STEP A2: Customer_name sudah ada tapi quantity belum ada

Tanya quantity saja.

Contoh:
"Siaap kak, rencana butuh berapa pcs undangannya?"

Setelah tanya quantity, berhenti dan tunggu jawaban customer.

### STEP A3: Quantity sudah ada tapi customer_name belum ada dan needed_date belum ada

Tanya nama dan tanggal terima.

Contoh:
"Untuk 100 pcs ya kak. Boleh aku tau nama kakak siapa, dan undangannya mau diterima tanggal berapa?"

Setelah tanya, berhenti dan tunggu jawaban customer.

### STEP B: Quantity sudah ada, tapi needed_date belum ada

Kalau auto_reply_disclosed = false:
Bubble 1: sapaan + transparansi auto-reply
Bubble 2: konfirmasi quantity + tanya tanggal undangan mau diterima

Kalau auto_reply_disclosed = true:
Bubble 1: konfirmasi quantity + tanya tanggal undangan mau diterima

Contoh:
"Untuk sekitar 70 pcs ya kak. Undangannya mau diterima tanggal berapa?"

Setelah tanya tanggal terima, berhenti dan tunggu jawaban customer.

### STEP C: Quantity kurang dari 30 pcs

Kalau auto_reply_disclosed = false, awali dengan bubble transparansi auto-reply.

Lalu bubble berikutnya:
"Untuk undangan custom Pentone, minimum order kita mulai dari 30 pcs ya kak. Kira-kira kebutuhannya bisa disesuaikan ke 30 pcs atau lebih?"

Setelah itu berhenti dan tunggu jawaban customer.

### STEP D: Quantity dan needed_date sudah lengkap, timeline tidak mepet, budget belum ditanya

Kalau auto_reply_disclosed = false:
Bubble 1: sapaan + transparansi auto-reply

Bubble berikutnya:
"Siaap kak, aku bantu arahin dulu ya. Untuk harga, ini bisa cukup bervariasi karena tergantung kompleksitas desain, finishing, dan detail undangan yang kakak mau."

Bubble berikutnya (USP — WAJIB):
Sampaikan USP Pentone secara natural dalam 2-3 kalimat. Contoh:
"Di Pentone semua undangan full custom dan dikerjain satu-satu sama dedicated designer kita dari awal sampai siap cetak, jadi hasilnya beneran sesuai konsep kakak. Kita juga kasih garansi on time, jadi kakak gak perlu khawatir soal timeline."

Bubble berikutnya:
"Kalau boleh tau, kakak sudah ada range budget untuk undangannya belum? Kalau ada contoh undangan Pentone yang kakak suka dari Instagram atau TikTok, boleh kirim juga nanti biar kita coba bantu hitungkan dan pilihkan specs yang sesuai."

Setelah tanya budget, BERHENTI dan tunggu jawaban customer. JANGAN langsung kirim link PL.

Step ini = "deliver_usp_ask_budget"

### STEP D2: Customer sudah jawab budget/referensi (atau bilang belum ada budget), dan PL belum dikirim

Setelah customer jawab soal budget:

Bubble 1:
"Untuk gambaran paket standarnya sesuai qty kakak bisa cek PL ini dulu ya: [PRICE_LIST_URL]"

Bubble 2 (waiting list):
"Oh iya kak, saat ini kita pakai sistem waiting list karena slot designer terbatas dan semua order custom dikerjakan satu-satu. Saat ini slot kita sudah waiting list sampai bulan [waiting_list_until_month], jadi nanti aku coba bantu cek update slot terdekatnya ya kak."

Step ini = "share_pricelist_sequence"

Catatan:
- Kalau auto_reply_disclosed = false di Step D, maksimal 4 bubble (disclosure + harga + USP + tanya budget). Link PL dan waiting list dikirim di D2.
- Kalau auto_reply_disclosed = true, Step D kirim 3 bubble (harga + USP + tanya budget), lalu STOP.

### STEP E: Quantity dan needed_date sudah lengkap, timeline mepet, budget belum ditanya

Kalau auto_reply_disclosed = false:
Bubble 1: sapaan + transparansi auto-reply

Bubble berikutnya:
"Wah, ini timeline-nya udah cukup mepet ya kak, karena undangan masih ada proses desain dan persiapan sebelum cetak."

Bubble berikutnya:
"Kita memang punya layanan prioritas yang bisa bantu produksi mulai dari 7 hari kerja setelah desain final kakak konfirmasi, tapi harganya berbeda dari timeline normal."

Bubble berikutnya (USP — WAJIB):
Sampaikan USP Pentone secara natural. Contoh:
"Tapi yang pasti, di Pentone semua undangan full custom dan dikerjain sama dedicated designer dari awal, jadi meskipun timeline mepet, kualitas tetap terjaga. Kita juga kasih garansi on time sesuai jadwal yang disepakati."

Bubble berikutnya:
"Untuk harga, ini bisa cukup bervariasi ya kak, karena tergantung kompleksitas desain, finishing, dan detail undangan yang kakak mau. Kalau kakak sudah ada range budget atau ada referensi undangan Pentone dari Instagram / TikTok yang disukai, boleh kirim juga nanti kita coba bantu hitungkan."

Setelah tanya budget, BERHENTI dan tunggu jawaban customer. JANGAN langsung kirim link PL.

Step ini = "deliver_usp_ask_budget"

Setelah customer jawab budget, lanjut ke STEP D2 (kirim link PL + waiting list).

### STEP F: Customer sudah pernah dikasih PL lalu tanya hal lain

Kalau pertanyaan masih soal harga / PL / qty / tanggal terima / budget / referensi undangan:
Jawab singkat sesuai konteks.

Kalau pertanyaan di luar itu:
Diam. Output action no_reply.

## EDGE CASES

1. Customer bilang: "Mau PL"
Kalau customer_name dan quantity belum ada, tanya nama dan quantity.

2. Customer bilang: "Harga 500 pcs berapa?"
Kalau needed_date belum ada, tanya needed_date. Kalau customer_name belum ada, boleh tanya nama juga.

3. Customer bilang: "Mau PL 300 pcs, diterima akhir Agustus"
Langsung kirim sequence: auto-reply disclosure jika belum, konteks harga bervariasi, USP Pentone, tanya budget / referensi. STOP dan tunggu jawaban. Link PL dikirim setelah customer jawab budget.

4. Customer bilang: "Langsung kasih harga aja"
Jangan tulis harga. Kalau quantity belum ada, tanya quantity. Kalau quantity ada tapi needed_date belum ada, tanya needed_date. Kalau dua-duanya sudah ada, jelaskan harga bervariasi, tanya budget / referensi, lalu share link PL.

5. Customer bilang: "Acara aku September"
Itu wedding date, bukan needed_date. Tanya:
"Kalau undangannya sendiri mau diterima tanggal berapa ya kak?"

6. Customer tanya: "Jenis kertasnya apa?"
Diam. Jangan balas.

7. Customer tanya: "Bisa desain rustic?"
Diam. Jangan balas.

8. Customer tanya: "Alamat workshop di mana?"
Diam. Jangan balas.

9. Customer bilang: "Mau undangan"
Kalau tidak menanyakan harga / PL / pricelist, diam. Jangan balas.

10. Customer bertanya soal souvenir
Diam. Jangan balas untuk MVP fase ini.

## FORMAT OUTPUT WAJIB JSON

Setiap output harus valid JSON saja, tanpa markdown, tanpa backtick, tanpa penjelasan tambahan.

Format:

{
  "replies": [
    {
      "text": "teks bubble pertama",
      "delay_seconds": 1
    },
    {
      "text": "teks bubble kedua",
      "delay_seconds": 3
    }
  ],
  "step": "ask_identity_quantity" | "ask_quantity" | "ask_needed_date" | "minimum_qty" | "deliver_usp_ask_budget" | "share_pricelist_sequence" | "urgent_timeline_sequence" | "post_pricelist" | "no_reply",
  "qualification_data": {
    "product": "undangan" | null,
    "customer_name": null | "string",
    "quantity": null | number | "string",
    "needed_date": null | "string",
    "status": "qualifying" | "pricelist_shared" | "minimum_qty" | "ignored"
  },
  "handover": false,
  "price_list_url": null | "string",
  "action": "send_replies" | "no_reply",
  "state_update": {
    "auto_reply_disclosed": true | false,
    "pricelist_shared": true | false,
    "waiting_list_explained": true | false
  }
}

Aturan tambahan:
- Field qualification_data harus accumulate dari conversation sebelumnya, jangan reset.
- handover selalu false untuk MVP ini.
- price_list_url hanya diisi saat step = "share_pricelist_sequence" atau "urgent_timeline_sequence". Jangan isi saat step = "deliver_usp_ask_budget".
- Saat step = "deliver_usp_ask_budget", bot WAJIB menyampaikan USP dan BERHENTI setelah tanya budget. Jangan kirim link PL di step ini.
- Jika action = "no_reply", replies harus array kosong.
- Kalau mengirim pertanyaan ke customer, replies hanya boleh sampai pertanyaan tersebut dan jangan lanjut bubble lain, kecuali dalam step share PL sesuai pengecualian di atas.
- Jangan pernah pakai emoji atau emotikon di text bubble.
`;

// ========== ADMIN DATA ==========
let adminData;
try {
  if (existsSync(ADMIN_DATA_FILE)) {
    adminData = JSON.parse(readFileSync(ADMIN_DATA_FILE, 'utf-8'));
  } else {
    adminData = { knowledgeBase: [], rules: [], customPrompt: null, settings: { delayMin: 2, delayMax: 5, botActive: true, offlineMessage: 'Makasih udah chat Pentone kak! Saat ini tim kami lagi offline, nanti kita follow up ya.' } };
  }
} catch { adminData = { knowledgeBase: [], rules: [], customPrompt: null, settings: { delayMin: 2, delayMax: 5, botActive: true, offlineMessage: 'Makasih udah chat Pentone kak! Saat ini tim kami lagi offline, nanti kita follow up ya.' } }; }
if (!adminData.settings) adminData.settings = { delayMin: 2, delayMax: 5, botActive: true, offlineMessage: '' };
if (!adminData.knowledgeBase) adminData.knowledgeBase = [];
if (!adminData.rules) adminData.rules = [];

function saveAdminData() {
  try { writeFileSync(ADMIN_DATA_FILE, JSON.stringify(adminData, null, 2)); } catch(e) { console.error('Save admin data error:', e.message); }
}

function getActivePrompt() {
  let prompt = adminData.customPrompt || SYSTEM_PROMPT;
  if (adminData.knowledgeBase.length > 0) {
    prompt += '\n\n## KNOWLEDGE BASE TAMBAHAN\nGunakan informasi berikut untuk menjawab customer:\n';
    adminData.knowledgeBase.forEach(k => { prompt += `\n### ${k.topic}\n${k.content}\n`; });
  }
  if (adminData.rules.length > 0) {
    prompt += '\n\n## RULES TAMBAHAN\nIkuti aturan kondisional berikut:\n';
    adminData.rules.forEach(r => { prompt += `\n- KALAU ${r.condition} → MAKA ${r.action}`; });
    prompt += '\n';
  }
  return prompt;
}

function escapeHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ========== IN-MEMORY STORE ==========
const conversationStore = new Map();

// ========== UTILITIES ==========
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeRole(role) {
  return role === 'assistant' ? 'assistant' : 'user';
}

function getConversationKey(accountId, conversationId) {
  return `${accountId}-${conversationId}`;
}

function getOrCreateConversationState(key) {
  if (!conversationStore.has(key)) {
    conversationStore.set(key, {
      history: [],
      data: {
        product: null,
        customer_name: null,
        quantity: null,
        needed_date: null,
        status: 'qualifying',
      },
      flags: {
        auto_reply_disclosed: false,
        pricelist_shared: false,
        waiting_list_explained: false,
        skipped: false,
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  return conversationStore.get(key);
}

function trimHistory(history, maxMessages = 24) {
  if (!Array.isArray(history)) return [];
  return history.slice(-maxMessages).map((msg) => ({
    role: normalizeRole(msg.role),
    content: String(msg.content || ''),
  }));
}

function getJakartaContext() {
  const now = new Date();

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_TIMEZONE,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const weekday = parts.find((p) => p.type === 'weekday')?.value || '';
  let hour = Number(parts.find((p) => p.type === 'hour')?.value || 0);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value || 0);

  if (hour === 24) hour = 0;

  let greeting = 'selamat malam';
  if (hour >= 4 && hour <= 10) greeting = 'selamat pagi';
  else if (hour >= 11 && hour <= 14) greeting = 'selamat siang';
  else if (hour >= 15 && hour <= 17) greeting = 'selamat sore';

  const isSunday = weekday === 'Sun';
  const isOfficeHour = !isSunday && hour >= 8 && hour < 17;

  return {
    timezone: BUSINESS_TIMEZONE,
    weekday,
    hour,
    minute,
    greeting,
    is_sunday: isSunday,
    office_status: isOfficeHour ? 'office_hour' : 'outside_office_hour',
    iso_utc: now.toISOString(),
  };
}

function getJakartaDateObject() {
  const jakartaString = new Date().toLocaleString('en-US', {
    timeZone: BUSINESS_TIMEZONE,
  });

  return new Date(jakartaString);
}

function getWaitingListUntilMonth() {
  const jakartaDate = getJakartaDateObject();
  jakartaDate.setMonth(jakartaDate.getMonth() + 1);

  return new Intl.DateTimeFormat('id-ID', {
    month: 'long',
    timeZone: BUSINESS_TIMEZONE,
  }).format(jakartaDate);
}

function safeJsonParse(rawText) {
  if (!rawText || typeof rawText !== 'string') return null;

  const cleaned = rawText
    .replace(/```json/g, '')
    .replace(/```/g, '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch (_) {
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');

    if (firstBrace >= 0 && lastBrace > firstBrace) {
      const possibleJson = cleaned.slice(firstBrace, lastBrace + 1);
      try {
        return JSON.parse(possibleJson);
      } catch (_) {
        return null;
      }
    }

    return null;
  }
}

function stripEmojis(text) {
  return String(text || '')
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, '')
    .replace(/[\u{2600}-\u{27BF}]/gu, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function clampDelay(value) {
  const delay = Number.isFinite(value) ? value : 2;
  if (delay < 0) return 0;
  if (delay > 5) return 5;
  return delay;
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function enforceKakAddressing(text, customerName) {
  let output = String(text || '').trim();
  if (!output) return output;

  const name = String(customerName || '').trim();

  if (name) {
    const escapedName = escapeRegExp(name);

    output = output.replace(
      new RegExp(`\\b(Siaap|Siap|Baik|Oke|Okay|Wait)\\s+${escapedName}\\b`, 'gi'),
      (match, opener) => `${opener} kak ${name}`
    );

    output = output.replace(
      new RegExp(`\\b${escapedName}\\b`, 'g'),
      (match, offset, fullText) => {
        const before = fullText.slice(Math.max(0, offset - 6), offset).toLowerCase();
        if (before.includes('kak')) return match;
        return `kak ${name}`;
      }
    );
  }

  if (!/\bkak\b/i.test(output)) {
    output = `Kak, ${output.charAt(0).toLowerCase()}${output.slice(1)}`;
  }

  return output;
}

function sanitizeReplies(parsed, conversationState) {
  if (!parsed || parsed.action === 'no_reply') return [];

  const customerName =
    parsed?.qualification_data?.customer_name ||
    conversationState?.data?.customer_name ||
    null;

  if (Array.isArray(parsed.replies)) {
    return parsed.replies
      .map((item) => {
        if (typeof item === 'string') {
          return { text: item.trim(), delay_seconds: 2 };
        }

        return {
          text: String(item?.text || '').trim(),
          delay_seconds: Number(item?.delay_seconds ?? 2),
        };
      })
      .filter((item) => item.text.length > 0)
      .slice(0, 4)
      .map((item, index) => ({
        text: enforceKakAddressing(stripEmojis(item.text), customerName),
        delay_seconds: clampDelay(index === 0 ? Math.min(item.delay_seconds, 1) : item.delay_seconds),
      }));
  }

  if (typeof parsed.reply === 'string' && parsed.reply.trim()) {
    return [
      {
        text: enforceKakAddressing(stripEmojis(parsed.reply.trim()), customerName),
        delay_seconds: 1,
      },
    ];
  }

  return [];
}

function mergeQualificationData(currentData, incomingData) {
  const next = { ...currentData };

  if (!incomingData || typeof incomingData !== 'object') return next;

  for (const key of ['product', 'customer_name', 'quantity', 'needed_date', 'status']) {
    if (
      incomingData[key] !== undefined &&
      incomingData[key] !== null &&
      incomingData[key] !== ''
    ) {
      next[key] = incomingData[key];
    }
  }

  return next;
}

function mergeFlags(currentFlags, stateUpdate) {
  const next = { ...currentFlags };

  if (!stateUpdate || typeof stateUpdate !== 'object') return next;

  for (const key of ['auto_reply_disclosed', 'pricelist_shared', 'waiting_list_explained']) {
    if (typeof stateUpdate[key] === 'boolean') {
      next[key] = stateUpdate[key];
    }
  }

  return next;
}

function extractQuantityFromText(text) {
  const raw = String(text || '').toLowerCase();

  const rangeMatch = raw.match(/(\d{1,5})\s*[-–]\s*(\d{1,5})\s*(pcs|pc|pieces|undangan)?/i);
  if (rangeMatch) return `${rangeMatch[1]}-${rangeMatch[2]}`;

  const explicitQtyMatch = raw.match(/(\d{1,5})\s*(pcs|pc|pieces|undangan|lembar|buah)/i);
  if (explicitQtyMatch) {
    const qty = Number(explicitQtyMatch[1]);
    return Number.isFinite(qty) && qty > 0 ? qty : null;
  }

  const approxQtyMatch = raw.match(/(?:sekitar|kira-kira|kurang lebih|kayaknya|kayanya|dikit|sekitaran|estimasi|mungkin|\+\-)?\s*(\d{1,5})\s*(an|-an)/i);
  if (approxQtyMatch) {
    const qty = Number(approxQtyMatch[1]);
    return Number.isFinite(qty) && qty > 0 ? qty : null;
  }

  const intentQtyMatch = raw.match(/(?:butuh|cetak|pesan|order|buat|mau)\s*(\d{1,5})/i);
  if (intentQtyMatch) {
    const qty = Number(intentQtyMatch[1]);
    return Number.isFinite(qty) && qty > 0 ? qty : null;
  }

  return null;
}

function extractQuantityFloor(quantity) {
  if (typeof quantity === 'number') return quantity;

  const raw = String(quantity || '').toLowerCase();

  const rangeMatch = raw.match(/(\d{1,5})\s*[-–]\s*(\d{1,5})/);
  if (rangeMatch) return Number(rangeMatch[1]);

  const singleMatch = raw.match(/(\d{1,5})/);
  if (singleMatch) return Number(singleMatch[1]);

  return null;
}

function getPriceListUrl(quantity) {
  const qtyFloor = extractQuantityFloor(quantity);
  if (qtyFloor === null) return null;
  if (qtyFloor < 30) return null;
  return qtyFloor < 150 ? PL_LINK_BELOW_150 : PL_LINK_150_UP;
}

function extractNeededDateText(content, conversationState) {
  const rawOriginal = String(content || '').trim();
  const raw = rawOriginal.toLowerCase();

  if (!rawOriginal) return null;

  const hasEventOnly =
    (raw.includes('acara') || raw.includes('wedding') || raw.includes('nikah')) &&
    !raw.includes('terima') &&
    !raw.includes('diterima') &&
    !raw.includes('sampai') &&
    !raw.includes('dikirim');

  if (hasEventOnly) return null;

  const lastAssistant = [...conversationState.history]
    .reverse()
    .find((msg) => msg.role === 'assistant');

  const botAskedNeededDate = lastAssistant?.content?.toLowerCase().includes('diterima tanggal berapa') ||
    lastAssistant?.content?.toLowerCase().includes('mau diterima tanggal berapa') ||
    lastAssistant?.content?.toLowerCase().includes('undangannya mau diterima');

  const hasDateSignal =
    raw.includes('besok') ||
    raw.includes('minggu depan') ||
    raw.includes('bulan depan') ||
    raw.includes('awal ') ||
    raw.includes('tengah ') ||
    raw.includes('akhir ') ||
    raw.includes('januari') ||
    raw.includes('februari') ||
    raw.includes('maret') ||
    raw.includes('april') ||
    raw.includes('mei') ||
    raw.includes('juni') ||
    raw.includes('juli') ||
    raw.includes('agustus') ||
    raw.includes('september') ||
    raw.includes('oktober') ||
    raw.includes('november') ||
    raw.includes('desember') ||
    /\d{1,2}[/-]\d{1,2}/.test(raw) ||
    /\d{1,2}\s*(jan|feb|mar|apr|mei|jun|jul|agu|ags|sep|okt|nov|des)/i.test(raw);

  if (botAskedNeededDate && hasDateSignal) return rawOriginal;

  if (
    (raw.includes('terima') || raw.includes('diterima') || raw.includes('sampai') || raw.includes('dikirim')) &&
    hasDateSignal
  ) {
    return rawOriginal;
  }

  return null;
}

function getUrgencyStatus(neededDateText) {
  const parsedDate = parseNeededDate(neededDateText);
  if (!parsedDate) {
    return {
      status: 'unknown',
      parsed_needed_date: null,
      days_until_needed: null,
    };
  }

  const today = getJakartaDateObject();
  today.setHours(0, 0, 0, 0);

  const target = new Date(parsedDate);
  target.setHours(0, 0, 0, 0);

  const diffMs = target.getTime() - today.getTime();
  const daysUntilNeeded = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  return {
    status:
      daysUntilNeeded >= 0 && daysUntilNeeded <= 30
        ? 'urgent_30_days_or_less'
        : 'normal',
    parsed_needed_date: target.toISOString().slice(0, 10),
    days_until_needed: daysUntilNeeded,
  };
}

function parseNeededDate(text) {
  if (!text) return null;

  const raw = String(text).toLowerCase();

  const now = getJakartaDateObject();
  const currentYear = now.getFullYear();

  const monthMap = {
    januari: 0,
    jan: 0,
    februari: 1,
    feb: 1,
    maret: 2,
    mar: 2,
    april: 3,
    apr: 3,
    mei: 4,
    juni: 5,
    jun: 5,
    juli: 6,
    jul: 6,
    agustus: 7,
    agu: 7,
    ags: 7,
    september: 8,
    sep: 8,
    oktober: 9,
    okt: 9,
    november: 10,
    nov: 10,
    desember: 11,
    des: 11,
  };

  if (raw.includes('besok')) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    return d;
  }

  if (raw.includes('minggu depan')) {
    const d = new Date(now);
    d.setDate(d.getDate() + 7);
    return d;
  }

  if (raw.includes('bulan depan')) {
    const d = new Date(now);
    d.setMonth(d.getMonth() + 1);
    return d;
  }

  for (const [monthName, monthIndex] of Object.entries(monthMap)) {
    if (!raw.includes(monthName)) continue;

    let day = null;

    const dayMonthRegex = new RegExp(`(\\d{1,2})\\s*${monthName}`, 'i');
    const dayMonthMatch = raw.match(dayMonthRegex);

    if (dayMonthMatch) {
      day = Number(dayMonthMatch[1]);
    } else if (raw.includes('awal')) {
      day = 5;
    } else if (raw.includes('tengah')) {
      day = 15;
    } else if (raw.includes('akhir')) {
      day = 25;
    } else {
      day = 15;
    }

    let year = currentYear;

    const yearMatch = raw.match(/20\d{2}/);
    if (yearMatch) {
      year = Number(yearMatch[0]);
    }

    const candidate = new Date(year, monthIndex, day);

    if (candidate < now && !yearMatch) {
      candidate.setFullYear(year + 1);
    }

    return candidate;
  }

  const numericDateMatch = raw.match(/(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?/);
  if (numericDateMatch) {
    const day = Number(numericDateMatch[1]);
    const month = Number(numericDateMatch[2]) - 1;
    let year = numericDateMatch[3] ? Number(numericDateMatch[3]) : currentYear;

    if (year < 100) year += 2000;

    const candidate = new Date(year, month, day);
    if (candidate < now && !numericDateMatch[3]) {
      candidate.setFullYear(year + 1);
    }

    return candidate;
  }

  return null;
}

function buildLocalFactsFromServer(conversationState) {
  const qtyFloor = extractQuantityFloor(conversationState.data.quantity);
  const priceListUrl = getPriceListUrl(conversationState.data.quantity);
  const urgency = getUrgencyStatus(conversationState.data.needed_date);

  return {
    quantity_floor: qtyFloor,
    price_list_url: priceListUrl,
    urgency,
  };
}

function applySafetyOverrides(parsed, conversationState, runtimeContext) {
  if (!parsed) return parsed;

  const currentQty = parsed?.qualification_data?.quantity ?? conversationState.data.quantity;
  const qtyFloor = extractQuantityFloor(currentQty);

  if (parsed.step === 'minimum_qty' && qtyFloor !== null && qtyFloor >= 30) {
    return {
      replies: [
        {
          text: `Untuk sekitar ${qtyFloor} pcs ya kak. Undangannya mau diterima tanggal berapa?`,
          delay_seconds: 1,
        },
      ],
      step: 'ask_needed_date',
      qualification_data: {
        product: 'undangan',
        customer_name: conversationState.data.customer_name || parsed?.qualification_data?.customer_name || null,
        quantity: qtyFloor,
        needed_date: conversationState.data.needed_date || null,
        status: 'qualifying',
      },
      handover: false,
      price_list_url: null,
      action: 'send_replies',
      state_update: {},
    };
  }

  const priceListUrl = getPriceListUrl(currentQty);

  if (
    parsed.price_list_url &&
    priceListUrl &&
    parsed.price_list_url !== priceListUrl
  ) {
    parsed.price_list_url = priceListUrl;

    if (Array.isArray(parsed.replies)) {
      parsed.replies = parsed.replies.map((item) => {
        if (!item?.text) return item;

        return {
          ...item,
          text: String(item.text)
            .replace(PL_LINK_BELOW_150, priceListUrl)
            .replace(PL_LINK_150_UP, priceListUrl),
        };
      });
    }
  }

  if (
    parsed.action !== 'no_reply' &&
    Array.isArray(parsed.replies) &&
    runtimeContext.waiting_list_until_month
  ) {
    parsed.replies = parsed.replies.map((item) => {
      if (!item?.text) return item;

      return {
        ...item,
        text: String(item.text).replace(
          /\[waiting_list_until_month\]/g,
          runtimeContext.waiting_list_until_month
        ),
      };
    });
  }

  return parsed;
}

// ========== LLM CALL ==========
async function callLLM(conversationHistory, runtimeContext) {
  if (!LLM_API_KEY) {
    throw new Error('LLM_API_KEY is not set');
  }

  const runtimePrompt = `
## RUNTIME_CONTEXT
${JSON.stringify(runtimeContext, null, 2)}
`;

  const systemWithRuntime = `${getActivePrompt()}\n\n${runtimePrompt}`;
  const safeHistory = trimHistory(conversationHistory);

  console.log('[LLM] Calling', LLM_PROVIDER, 'with', safeHistory.length, 'messages');

  if (LLM_PROVIDER === 'claude') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': LLM_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001',
        max_tokens: 1400,
        temperature: 0.2,
        system: systemWithRuntime,
        messages: safeHistory,
      }),
    });

    const data = await res.json();
    console.log('[LLM] Claude response:', JSON.stringify(data).slice(0, 700));

    if (!res.ok || data.error) {
      throw new Error('Claude API error: ' + JSON.stringify(data.error || data));
    }

    if (!data.content || !data.content[0]?.text) {
      throw new Error('Claude API unexpected response: ' + JSON.stringify(data));
    }

    return data.content[0].text;
  }

  if (LLM_PROVIDER === 'openai') {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${LLM_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
        max_tokens: 1400,
        temperature: 0.2,
        messages: [
          { role: 'system', content: systemWithRuntime },
          ...safeHistory,
        ],
      }),
    });

    const data = await res.json();
    console.log('[LLM] OpenAI response:', JSON.stringify(data).slice(0, 700));

    if (!res.ok || data.error) {
      throw new Error('OpenAI API error: ' + JSON.stringify(data.error || data));
    }

    if (!data.choices?.[0]?.message?.content) {
      throw new Error('OpenAI API unexpected response: ' + JSON.stringify(data));
    }

    return data.choices[0].message.content;
  }

  throw new Error(`Unsupported LLM_PROVIDER: ${LLM_PROVIDER}`);
}

// ========== CHATWOOT ==========
async function sendReply(accountId, conversationId, message) {
  if (!message || !message.trim()) return;

  const res = await fetch(
    `${CHATWOOT_API_URL}/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        api_access_token: CHATWOOT_API_KEY,
      },
      body: JSON.stringify({
        content: message.trim(),
        message_type: 'outgoing',
      }),
    }
  );

  const text = await res.text();
  console.log('[Chatwoot] Send reply status:', res.status);

  if (!res.ok) {
    console.error('[Chatwoot] Send reply error:', text.slice(0, 500));
    throw new Error(`Chatwoot sendReply failed: ${res.status}`);
  }
}

async function sendRepliesSequentially(accountId, conversationId, replies) {
  for (let i = 0; i < replies.length; i += 1) {
    const item = replies[i];

    const delaySeconds = i === 0
      ? clampDelay(item.delay_seconds ?? 0)
      : clampDelay(item.delay_seconds ?? 2);

    if (delaySeconds > 0) {
      await sleep(delaySeconds * 1000);
    }

    await sendReply(accountId, conversationId, item.text);
    console.log(`[Chat ${conversationId}] Bot sent bubble ${i + 1}/${replies.length}: ${item.text}`);
  }
}

async function updateAttributes(accountId, conversationId, qualData) {
  if (!qualData || typeof qualData !== 'object') return;

  const customAttributes = {
    product: qualData.product,
    customer_name: qualData.customer_name,
    quantity: qualData.quantity,
    needed_date: qualData.needed_date,
    lead_status: qualData.status,
  };

  Object.keys(customAttributes).forEach((key) => {
    if (customAttributes[key] === undefined) delete customAttributes[key];
  });

  const primaryUrl =
    `${CHATWOOT_API_URL}/api/v1/accounts/${accountId}/conversations/${conversationId}/custom_attributes`;

  let res = await fetch(primaryUrl, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      api_access_token: CHATWOOT_API_KEY,
    },
    body: JSON.stringify({
      custom_attributes: customAttributes,
    }),
  });

  if (res.ok) {
    console.log('[Chatwoot] Custom attributes updated:', res.status);
    return;
  }

  const primaryError = await res.text();
  console.warn('[Chatwoot] Custom attributes primary endpoint failed:', res.status, primaryError.slice(0, 300));

  const fallbackUrl =
    `${CHATWOOT_API_URL}/api/v1/accounts/${accountId}/conversations/${conversationId}`;

  res = await fetch(fallbackUrl, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      api_access_token: CHATWOOT_API_KEY,
    },
    body: JSON.stringify({
      custom_attributes: customAttributes,
    }),
  });

  const fallbackText = await res.text();

  if (!res.ok) {
    console.error('[Chatwoot] Custom attributes fallback failed:', res.status, fallbackText.slice(0, 500));
    return;
  }

  console.log('[Chatwoot] Custom attributes updated via fallback:', res.status);
}

async function handoverToHuman(accountId, conversationId) {
  const res = await fetch(
    `${CHATWOOT_API_URL}/api/v1/accounts/${accountId}/conversations/${conversationId}/toggle_status`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        api_access_token: CHATWOOT_API_KEY,
      },
      body: JSON.stringify({ status: 'open' }),
    }
  );

  const text = await res.text();
  console.log('[Chatwoot] Handover status:', res.status);

  if (!res.ok) {
    console.error('[Chatwoot] Handover error:', text.slice(0, 500));
  }
}

// ========== NEW CONVERSATION CHECK ==========
async function isExistingConversation(accountId, conversationId) {
  try {
    const res = await fetch(
      `${CHATWOOT_API_URL}/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`,
      { headers: { api_access_token: CHATWOOT_API_KEY } }
    );
    if (!res.ok) return false;
    const data = await res.json();
    const messages = data.payload || [];
    // Cek apakah sudah ada outgoing messages (dari bot atau agen)
    const outgoing = messages.filter(m => m.message_type === 1);
    return outgoing.length > 0;
  } catch {
    return false;
  }
}

// ========== CUSTOMER NAME EXTRACTION ==========
function capitalizeFirst(str) {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

function extractCustomerName(content, conversationState) {
  const raw = String(content || '').trim();
  if (!raw || raw.length > 60) return null;

  // Cek apakah bot terakhir nanya nama
  const lastAssistant = [...conversationState.history].reverse().find(m => m.role === 'assistant');
  const lastContent = String(lastAssistant?.content || '').toLowerCase();
  const botAskedName = lastContent.includes('nama kakak') || lastContent.includes('nama kak') || lastContent.includes('siapa nama') || lastContent.includes('boleh tau nama') || lastContent.includes('nama siapa');

  // Pattern: "nama saya/aku X"
  const namaMatch = raw.match(/nama\s+(?:saya|aku|gue|gw|ku)\s+(\w+)/i);
  if (namaMatch) return capitalizeFirst(namaMatch[1]);

  // Pattern: "panggil aja X" / "panggil X"
  const panggilMatch = raw.match(/panggil\s+(?:aja\s+)?(\w+)/i);
  if (panggilMatch) return capitalizeFirst(panggilMatch[1]);

  // Pattern: "saya/aku X" kalau bot nanya nama
  if (botAskedName) {
    const shortMatch = raw.match(/(?:saya|aku|gue|gw)\s+(\w+)/i);
    if (shortMatch && shortMatch[1].length >= 2) return capitalizeFirst(shortMatch[1]);
  }

  // Pattern: jawaban singkat (1-3 kata) kalau bot nanya nama
  if (botAskedName) {
    const words = raw.replace(/[.,!?]/g, '').trim().split(/\s+/);
    if (words.length <= 3) {
      const nonNames = ['kak','ya','iya','hai','halo','hi','hey','ok','oke','okay','saya','aku','gue','gw','nama','dong','deh','nih','sih','yaa','yak','min','mas','mba','mbak','bang','bu','pak','om','tante','makasih','thanks','thank','terima','kasih'];
      const nameCandidate = words.find(w => !nonNames.includes(w.toLowerCase()) && w.length >= 2 && /^[A-Za-z]/.test(w));
      if (nameCandidate) return capitalizeFirst(nameCandidate);
    }
  }

  return null;
}

// ========== MAIN PROCESSOR ==========
async function processIncomingMessage(reqBody) {
  const messageType = reqBody.message_type;
  const content = reqBody.content;
  const accountId = reqBody.account?.id;
  const conversationId = reqBody.conversation?.id;
  const inboxId = Number(reqBody.conversation?.inbox_id);

  // Skip kalau bukan incoming message atau data penting kosong.
  // Bot aktif di semua inbox.
  if (
    messageType !== 'incoming' ||
    !content ||
    !accountId ||
    !conversationId
  ) {
    return;
  }

  if (!CHATWOOT_API_KEY) {
    throw new Error('CHATWOOT_API_KEY is not set');
  }

  const key = getConversationKey(accountId, conversationId);
  const conversationState = getOrCreateConversationState(key);
  const jakartaContext = getJakartaContext();

  // SKIP: conversation yang sudah pernah ditangani agen/bot sebelum deploy ini
  if (conversationState.flags.skipped) {
    console.log(`[Chat ${conversationId}] Skipped (existing conversation)`);
    return;
  }

  // CEK: kalau ini pertama kali kita lihat conversation ini, cek apakah sudah ada balasan sebelumnya
  if (conversationState.history.length === 0) {
    const existing = await isExistingConversation(accountId, conversationId);
    if (existing) {
      console.log(`[Chat ${conversationId}] Skipping — already has outgoing messages`);
      conversationState.flags.skipped = true;
      conversationStore.set(key, conversationState);
      return;
    }
  }

  conversationState.updated_at = new Date().toISOString();

  console.log(`[Chat ${conversationId}] Customer: ${content}`);
  console.log(`[Chat ${conversationId}] Inbox ID: ${inboxId}`);

  conversationState.history.push({
    role: 'user',
    content,
  });

  const extractedQty = extractQuantityFromText(content);
  if (
    extractedQty !== null &&
    (conversationState.data.quantity === null || conversationState.data.quantity === undefined)
  ) {
    conversationState.data.quantity = extractedQty;
  }

  const extractedNeededDate = extractNeededDateText(content, conversationState);
  if (
    extractedNeededDate !== null &&
    (conversationState.data.needed_date === null || conversationState.data.needed_date === undefined)
  ) {
    conversationState.data.needed_date = extractedNeededDate;
  }

  // Extract customer name dari server-side (biar gak tanya ulang)
  const extractedName = extractCustomerName(content, conversationState);
  if (
    extractedName !== null &&
    (conversationState.data.customer_name === null || conversationState.data.customer_name === undefined)
  ) {
    conversationState.data.customer_name = extractedName;
    console.log(`[Chat ${conversationId}] Extracted name: ${extractedName}`);
  }

  const localFacts = buildLocalFactsFromServer(conversationState);

  const runtimeContext = {
    current_time: jakartaContext,
    greeting: jakartaContext.greeting,
    office_status: jakartaContext.office_status,
    waiting_list_until_month: getWaitingListUntilMonth(),
    urgency_status: localFacts.urgency.status,
    urgency_details: localFacts.urgency,
    conversation_state: {
      qualification_data: conversationState.data,
      flags: conversationState.flags,
    },
    server_extracted_facts: localFacts,
    pricelist_links: {
      below_150: PL_LINK_BELOW_150,
      above_or_equal_150: PL_LINK_150_UP,
    },
    business_rules: {
      minimum_quantity: 30,
      urgent_timeline_days: 30,
      priority_production_fastest: '7 hari kerja setelah desain final dikonfirmasi',
      below_150_link_rule: 'quantity < 150',
      above_150_link_rule: 'quantity >= 150',
      scope: 'Only answer price list / price / PL questions for wedding invitations. Otherwise no reply.',
    },
  };

  const rawResponse = await callLLM(conversationState.history, runtimeContext);
  console.log(`[Chat ${conversationId}] Bot raw: ${rawResponse}`);

  let parsed = safeJsonParse(rawResponse);

  if (!parsed) {
    console.error(`[Chat ${conversationId}] JSON parse error. No reply for safety.`);
    conversationState.history.push({
      role: 'assistant',
      content: JSON.stringify({
        replies: [],
        action: 'no_reply',
        step: 'parse_error',
      }),
    });
    conversationStore.set(key, conversationState);
    return;
  }

  parsed = applySafetyOverrides(parsed, conversationState, runtimeContext);

  const replies = sanitizeReplies(parsed, conversationState);

  conversationState.history.push({
    role: 'assistant',
    content: rawResponse,
  });
  conversationState.history = trimHistory(conversationState.history, 24);

  conversationState.data = mergeQualificationData(
    conversationState.data,
    parsed.qualification_data
  );

  conversationState.flags = mergeFlags(
    conversationState.flags,
    parsed.state_update
  );

  if (parsed.action === 'no_reply' || replies.length === 0) {
    console.log(`[Chat ${conversationId}] No reply.`);
    conversationStore.set(key, conversationState);
    return;
  }

  await sendRepliesSequentially(accountId, conversationId, replies);

  conversationState.flags.auto_reply_disclosed = true;

  if (parsed.step === 'share_pricelist_sequence' || parsed.step === 'urgent_timeline_sequence') {
    conversationState.flags.pricelist_shared = true;
  }

  if (
    parsed.step === 'share_pricelist_sequence' ||
    parsed.step === 'urgent_timeline_sequence' ||
    parsed.state_update?.waiting_list_explained
  ) {
    conversationState.flags.waiting_list_explained = true;
  }

  await updateAttributes(accountId, conversationId, conversationState.data);

  if (parsed.handover) {
    await handoverToHuman(accountId, conversationId);
    console.log(`[Chat ${conversationId}] Handover to human`);
  }

  conversationStore.set(key, conversationState);
}

// ========== WEBHOOK HANDLER ==========
app.post('/webhook', async (req, res) => {
  try {
    const event = req.body.event;

    if (event !== 'message_created') {
      return res.sendStatus(200);
    }

    res.sendStatus(200);

    processIncomingMessage(req.body).catch((err) => {
      console.error('Async processor error:', err.message);
      console.error(err.stack);
    });
  } catch (err) {
    console.error('Webhook error:', err.message);
    if (!res.headersSent) {
      res.sendStatus(500);
    }
  }
});

// ========== ADMIN PANEL ==========
app.get('/admin', (req, res) => {
  const token = req.query.token;
  const tab = req.query.tab || 'prompt';
  const saved = req.query.saved;

  if (!token) {
    return res.send(`<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pentone Bot Admin</title>
<style>*{box-sizing:border-box}body{font-family:-apple-system,sans-serif;background:#0f0f0f;color:#e0e0e0;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0}
.login{background:#1a1a1a;border:1px solid #333;border-radius:12px;padding:32px;width:360px}h1{font-size:20px;margin-bottom:8px}.sub{color:#888;font-size:13px;margin-bottom:20px}
input{width:100%;padding:10px;background:#0f0f0f;border:1px solid #333;border-radius:8px;color:#fff;font-size:14px;margin-bottom:16px}
button{width:100%;padding:10px;background:#2563eb;color:#fff;border:none;border-radius:8px;font-size:14px;cursor:pointer}button:hover{background:#1d4ed8}</style></head>
<body><div class="login"><h1>Pentone Bot Admin</h1><p class="sub">Masukkin password</p>
<input type="password" id="pw" placeholder="Password" autofocus onkeydown="if(event.key==='Enter')go()">
<button onclick="go()">Login</button></div>
<script>function go(){window.location.href='/admin?token='+encodeURIComponent(document.getElementById('pw').value)+'&tab=prompt'}</script></body></html>`);
  }

  if (token !== ADMIN_PASSWORD) return res.send('<script>alert("Password salah!");window.location.href="/admin"</script>');

  const t = encodeURIComponent(token);
  const savedBanner = saved ? '<div style="background:#065f46;color:#6ee7b7;padding:12px;border-radius:8px;margin-bottom:16px;font-size:14px">Saved!</div>' : '';
  const activePrompt = adminData.customPrompt || SYSTEM_PROMPT;

  let content = '';

  if (tab === 'prompt') {
    content = `${savedBanner}<div class="card"><h2>System Prompt</h2><p class="desc">Edit cara bot bales. Save langsung aktif tanpa restart.</p>
<form method="POST" action="/admin/prompt?token=${t}">
<textarea name="prompt" style="min-height:400px">${escapeHtml(activePrompt)}</textarea><br><br>
<button type="submit" class="btn btn-primary">Save Prompt</button>
<button type="button" class="btn" style="background:#333;color:#aaa;margin-left:8px" onclick="if(confirm('Reset ke prompt default?'))window.location.href='/admin/prompt/reset?token=${t}'">Reset Default</button>
</form></div>`;
  } else if (tab === 'knowledge') {
    let items = adminData.knowledgeBase.map(k => `<div class="item"><div class="ic"><strong>${escapeHtml(k.topic)}</strong><p>${escapeHtml(k.content)}</p></div>
<form method="POST" action="/admin/kb/del?token=${t}" style="margin:0"><input type="hidden" name="id" value="${k.id}"><button type="submit" class="btn btn-danger">Hapus</button></form></div>`).join('');
    content = `${savedBanner}<div class="card"><h2>Knowledge Base</h2><p class="desc">Info yang bot bisa pake buat jawab. Otomatis di-inject ke prompt.</p>
${items || '<p style="color:#666;font-size:13px">Belum ada. Tambah di bawah.</p>'}<hr>
<h2>Tambah Knowledge</h2><form method="POST" action="/admin/kb/add?token=${t}">
<label>Topik</label><input type="text" name="topic" required placeholder="Contoh: Minimum order, Sample kit"><br>
<label>Isi info</label><textarea name="content" style="min-height:100px" required placeholder="Info yang bot bisa gunakan untuk menjawab"></textarea><br><br>
<button type="submit" class="btn btn-primary">Tambah</button></form></div>`;
  } else if (tab === 'rules') {
    let items = adminData.rules.map(r => `<div class="item"><div class="ic"><strong>KALAU: ${escapeHtml(r.condition)}</strong><p>MAKA: ${escapeHtml(r.action)}</p></div>
<form method="POST" action="/admin/rules/del?token=${t}" style="margin:0"><input type="hidden" name="id" value="${r.id}"><button type="submit" class="btn btn-danger">Hapus</button></form></div>`).join('');
    content = `${savedBanner}<div class="card"><h2>Rules / Kondisi</h2><p class="desc">Aturan tambahan. Format: KALAU [kondisi] → MAKA [aksi]</p>
${items || '<p style="color:#666;font-size:13px">Belum ada rules.</p>'}<hr>
<h2>Tambah Rule</h2><form method="POST" action="/admin/rules/add?token=${t}">
<label>KALAU (kondisi)</label><input type="text" name="condition" required placeholder="Contoh: jumlah di atas 500 pcs"><br>
<label>MAKA (aksi)</label><textarea name="action" style="min-height:80px" required placeholder="Contoh: Kasih link catalog premium dan bilang bisa custom"></textarea><br><br>
<button type="submit" class="btn btn-primary">Tambah Rule</button></form></div>`;
  } else if (tab === 'settings') {
    content = `${savedBanner}<div class="card"><h2>Settings</h2><p class="desc">Pengaturan umum</p>
<form method="POST" action="/admin/settings?token=${t}">
<label>Bot aktif</label><select name="botActive" style="width:100%;padding:10px;background:#0f0f0f;border:1px solid #333;border-radius:8px;color:#e0e0e0;font-size:14px;margin-bottom:16px">
<option value="true" ${adminData.settings.botActive!==false?'selected':''}>Aktif</option><option value="false" ${adminData.settings.botActive===false?'selected':''}>Non-aktif</option></select>
<div style="display:flex;gap:12px;margin-bottom:16px"><div><label>Delay min (detik)</label><input type="number" name="delayMin" value="${adminData.settings.delayMin||2}" style="width:80px"></div>
<div><label>Delay max (detik)</label><input type="number" name="delayMax" value="${adminData.settings.delayMax||5}" style="width:80px"></div></div>
<label>Pesan offline (kalau bot non-aktif)</label><textarea name="offlineMessage" style="min-height:80px">${escapeHtml(adminData.settings.offlineMessage||'')}</textarea><br><br>
<button type="submit" class="btn btn-primary">Save Settings</button></form></div>`;
  }

  res.send(`<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pentone Bot Admin</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,sans-serif;background:#0f0f0f;color:#e0e0e0;padding:20px}
.container{max-width:900px;margin:0 auto}h1{color:#fff;margin-bottom:8px;font-size:24px}.subtitle{color:#888;margin-bottom:24px;font-size:14px}
.tabs{display:flex;gap:4px;margin-bottom:24px;flex-wrap:wrap}.tab{padding:10px 20px;background:#1a1a1a;border:1px solid #333;border-radius:8px;cursor:pointer;color:#aaa;font-size:14px;text-decoration:none}
.tab.active{background:#2563eb;color:#fff;border-color:#2563eb}.card{background:#1a1a1a;border:1px solid #333;border-radius:12px;padding:24px;margin-bottom:16px}
.card h2{font-size:16px;margin-bottom:4px;color:#fff}.desc{color:#888;font-size:13px;margin-bottom:16px}
textarea{width:100%;background:#0f0f0f;border:1px solid #333;border-radius:8px;padding:12px;color:#e0e0e0;font-family:monospace;font-size:13px;resize:vertical}
input[type="text"],input[type="number"]{width:100%;background:#0f0f0f;border:1px solid #333;border-radius:8px;padding:10px 12px;color:#e0e0e0;font-size:14px;margin-bottom:12px}
label{display:block;color:#aaa;font-size:13px;margin-bottom:6px}
.btn{padding:10px 24px;border:none;border-radius:8px;cursor:pointer;font-size:14px;font-weight:500}
.btn-primary{background:#2563eb;color:#fff}.btn-primary:hover{background:#1d4ed8}
.btn-danger{background:#dc2626;color:#fff;padding:6px 12px;font-size:12px}
.item{background:#0f0f0f;border:1px solid #333;border-radius:8px;padding:12px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:start;gap:12px}
.ic{flex:1}.ic strong{color:#fff;font-size:14px}.ic p{color:#aaa;font-size:13px;margin-top:4px}
hr{border:none;border-top:1px solid #333;margin:16px 0}</style></head>
<body><div class="container"><h1>Pentone Bot Admin</h1><p class="subtitle">Atur prompt, knowledge base, rules, dan settings</p>
<div class="tabs">
<a href="/admin?tab=prompt&token=${t}" class="tab ${tab==='prompt'?'active':''}">System Prompt</a>
<a href="/admin?tab=knowledge&token=${t}" class="tab ${tab==='knowledge'?'active':''}">Knowledge Base</a>
<a href="/admin?tab=rules&token=${t}" class="tab ${tab==='rules'?'active':''}">Rules</a>
<a href="/admin?tab=settings&token=${t}" class="tab ${tab==='settings'?'active':''}">Settings</a>
</div>${content}</div></body></html>`);
});

app.post('/admin/prompt', (req,res) => {
  if(req.query.token!==ADMIN_PASSWORD) return res.status(401).send('Unauthorized');
  adminData.customPrompt = req.body.prompt; saveAdminData();
  res.redirect(`/admin?tab=prompt&token=${encodeURIComponent(req.query.token)}&saved=1`);
});
app.get('/admin/prompt/reset', (req,res) => {
  if(req.query.token!==ADMIN_PASSWORD) return res.status(401).send('Unauthorized');
  adminData.customPrompt = null; saveAdminData();
  res.redirect(`/admin?tab=prompt&token=${encodeURIComponent(req.query.token)}&saved=1`);
});
app.post('/admin/kb/add', (req,res) => {
  if(req.query.token!==ADMIN_PASSWORD) return res.status(401).send('Unauthorized');
  adminData.knowledgeBase.push({ id: Date.now().toString(), topic: req.body.topic, content: req.body.content }); saveAdminData();
  res.redirect(`/admin?tab=knowledge&token=${encodeURIComponent(req.query.token)}&saved=1`);
});
app.post('/admin/kb/del', (req,res) => {
  if(req.query.token!==ADMIN_PASSWORD) return res.status(401).send('Unauthorized');
  adminData.knowledgeBase = adminData.knowledgeBase.filter(k => k.id !== req.body.id); saveAdminData();
  res.redirect(`/admin?tab=knowledge&token=${encodeURIComponent(req.query.token)}&saved=1`);
});
app.post('/admin/rules/add', (req,res) => {
  if(req.query.token!==ADMIN_PASSWORD) return res.status(401).send('Unauthorized');
  adminData.rules.push({ id: Date.now().toString(), condition: req.body.condition, action: req.body.action }); saveAdminData();
  res.redirect(`/admin?tab=rules&token=${encodeURIComponent(req.query.token)}&saved=1`);
});
app.post('/admin/rules/del', (req,res) => {
  if(req.query.token!==ADMIN_PASSWORD) return res.status(401).send('Unauthorized');
  adminData.rules = adminData.rules.filter(r => r.id !== req.body.id); saveAdminData();
  res.redirect(`/admin?tab=rules&token=${encodeURIComponent(req.query.token)}&saved=1`);
});
app.post('/admin/settings', (req,res) => {
  if(req.query.token!==ADMIN_PASSWORD) return res.status(401).send('Unauthorized');
  adminData.settings.botActive = req.body.botActive === 'true';
  adminData.settings.delayMin = parseInt(req.body.delayMin)||2;
  adminData.settings.delayMax = parseInt(req.body.delayMax)||5;
  adminData.settings.offlineMessage = req.body.offlineMessage; saveAdminData();
  res.redirect(`/admin?tab=settings&token=${encodeURIComponent(req.query.token)}&saved=1`);
});

// ========== HEALTH CHECK ==========
app.get('/', (req, res) => {
  const jakartaContext = getJakartaContext();

  res.json({
    status: 'ok',
    service: 'Pentone Pricelist Bot',
    version: 'mvp-pricelist-v4-all-inbox-budget-reference',
    provider: LLM_PROVIDER,
    active_inbox: 'all',
    jakarta_context: jakartaContext,
    waiting_list_until_month: getWaitingListUntilMonth(),
  });
});

app.get('/debug/conversations', (req, res) => {
  const data = Array.from(conversationStore.entries()).map(([key, value]) => ({
    key,
    data: value.data,
    flags: value.flags,
    history_count: value.history.length,
    created_at: value.created_at,
    updated_at: value.updated_at,
  }));

  res.json(data);
});

app.get('/debug/reset', (req, res) => {
  conversationStore.clear();
  res.json({ status: 'ok', message: 'conversationStore cleared via GET' });
});

app.post('/debug/reset', (req, res) => {
  conversationStore.clear();
  res.json({ status: 'ok', message: 'conversationStore cleared via POST' });
});

// ========== START SERVER ==========
app.listen(PORT, () => {
  console.log(`Bot running on port ${PORT}`);
  console.log(`LLM Provider: ${LLM_PROVIDER}`);
  console.log(`LLM API Key: ${LLM_API_KEY ? LLM_API_KEY.substring(0, 15) + '...' : 'NOT SET'}`);
  console.log(`Chatwoot URL: ${CHATWOOT_API_URL}`);
  console.log(`Active Inbox: all`);
  console.log(`Admin panel: /admin`);
  console.log(`Timezone: ${BUSINESS_TIMEZONE}`);
});
