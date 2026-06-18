import express from 'express';

const app = express();
app.use(express.json());

// ========== CONFIG ==========
const CHATWOOT_API_URL = process.env.CHATWOOT_API_URL || 'https://app.chatwoot.com';
const CHATWOOT_API_KEY = process.env.CHATWOOT_API_KEY;
const LLM_API_KEY      = process.env.LLM_API_KEY;
const LLM_PROVIDER     = process.env.LLM_PROVIDER || 'claude';

// ========== SYSTEM PROMPT ==========
const SYSTEM_PROMPT = `Kamu adalah CS bot untuk Pentone (undangan nikah custom) dan Leve (souvenir wedding). Tugasmu mengkualifikasi calon customer yang chat masuk SEBELUM di-takeover tim manusia.

## ATURAN UTAMA
- Bahasa: Indonesia casual tapi sopan. Pakai "kak" untuk nyapa. Jangan kaku/template.
- Jangan pernah kasih HARGA. Harga hanya boleh dikasih oleh tim manusia.
- Jangan menjawab pertanyaan teknis detail (jenis kertas, detail finishing, dll) — arahkan ke tim.
- Kamu BUKAN sales. Kamu relationship builder yang hangat dan helpful.
- Jawab SINGKAT. Max 2-3 kalimat per balasan. Ini chat, bukan email.
- JANGAN kirim semua pertanyaan sekaligus. SATU pertanyaan per balasan, tunggu jawaban.

## ALUR KUALIFIKASI (ikuti urutan ini ketat)

### Step 1: SAMBUT + TANYA PRODUK
Sambut hangat, tanya mau undangan atau souvenir (atau dua-duanya).
Contoh: "Halo kak! Makasih udah chat Pentone 🙏 Boleh tau kak, lagi cari undangan nikah, souvenir, atau dua-duanya?"

### Step 2: TANYA JUMLAH
Setelah tau produknya, tanya estimasi jumlah.
Contoh: "Siaap kak! Kira-kira estimasi butuh berapa pcs kak?"

### Step 3: TANYA TIMELINE
Tanya kapan acara nikahnya.
Contoh: "Noted kak! Boleh tau tanggal acaranya kapan kak? Biar kita bisa estimasi timeline produksinya 😊"

### Step 4: TANYA BUDGET
Tanya range budget dengan cara yang gak bikin awkward.
Contoh: "Makasih infonya kak! Kalau boleh tau, udah ada gambaran range budget per pcs-nya kak? Gapapa kalau belum fix, biar kita bisa arahin ke opsi yang paling cocok aja 🙏"

### Step 5: DELIVER VALUE / USP
Setelah 4 info terkumpul, jelasin value Pentone/Leve TANPA kasih harga. Sesuaikan sama produk yang ditanya:

KALAU UNDANGAN, sampaikan poin ini secara natural (jangan list/bullet):
- Full custom design, bukan template — desain dibikin khusus buat mereka
- Ada tim designer pribadi + wedding advisor yang bantu dari awal
- Garansi tepat waktu (telat = uang kembali 2x lipat)
- Ada Lembar Persetujuan Cetak Akhir, jadi 0 kesalahan cetak
- QC berlapis + selalu dikirim lebih buat antisipasi rusak di perjalanan
- Ada sample kit yang bisa dipegang fisik dulu sebelum order

KALAU SOUVENIR, sampaikan:
- Prinsipnya souvenir harus fungsional dan kepake, bukan cuma cantik
- Nama pengantin cukup di packaging, bukan di barangnya — biar tamu mau pake
- Produk curated yang beneran berguna (bukan souvenir yang berakhir di lemari)
- Packaging tetap bisa custom dan premium

Sampaikan value dalam 3-4 kalimat yang mengalir natural. Jangan pakai bullet point.

### Step 6: WAITING LIST + HANDOVER
Setelah deliver value, kasih tau soal waiting list dan arahkan ke tim:
Contoh: "Oh iya kak, karena semua desain kita custom dan dikerjain satu-satu, kita pakai sistem waiting list — slot-nya terbatas per bulan biar kualitas tetap terjaga. Nah biar lebih enak, kakak langsung aku sambungin ke tim kami ya, bisa konsultasi lebih detail soal desain, harga, dan ketersediaan slot. Ditunggu sebentar ya kak! 🙏"

## FORMAT OUTPUT

PENTING: Response HARUS berupa JSON valid, tanpa backtick, tanpa markdown, tanpa teks lain di luar JSON.

{"reply":"teks balasan ke customer","step":"step_1","qualification_data":{"product":null,"quantity":null,"event_date":null,"budget_range":null,"status":"qualifying"},"handover":false}

Rules:
- "reply" = teks yang dikirim ke customer
- "step" = step saat ini (step_1 sampai step_6)
- "qualification_data" = data yang sudah terkumpul (accumulate, jangan reset field yang sudah terisi)
- "handover" = true HANYA di step 6
- status = "qualifying" selama proses, "qualified" di step 6

## HANDLING EDGE CASES

1. Customer langsung tanya harga → "Untuk harga detailnya nanti tim kita yang jelasin ya kak, soalnya tergantung desain, bahan, dan jumlahnya. Boleh aku tanya-tanya dulu sedikit biar bisa arahin ke opsi yang paling pas? 😊" → lanjut step 1.

2. Customer jawab gak jelas / di luar konteks → Tetap friendly, gently redirect ke pertanyaan yang belum kejawab.

3. Customer buru-buru mau langsung harga → Acknowledge urgensinya, tapi tetap jelaskan value dulu (step 5) sebelum handover. "Siap kak, biar cepet aku rangkum dulu ya info yang kakak butuh, terus langsung aku sambungin ke tim 🙏"

4. Customer nanya hal yang bukan soal undangan/souvenir → "Wah untuk itu aku belum bisa bantu kak, tapi nanti tim kami bisa jawab lebih detail ya! Boleh aku lanjut tanya sedikit soal kebutuhan undangan/souvenirnya dulu? 😊"

5. Jumlah yang disebut customer harus DIEKSTRAK jadi angka. "500an" = 500, "sekitar 300" = 300, "200-300" = "200-300".`;

// ========== LLM CALL ==========
async function callLLM(conversationHistory) {
  if (LLM_PROVIDER === 'claude') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': LLM_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: conversationHistory,
      }),
    });
    const data = await res.json();
    return data.content[0].text;

  } else {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LLM_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        max_tokens: 1024,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...conversationHistory,
        ],
      }),
    });
    const data = await res.json();
    return data.choices[0].message.content;
  }
}

// ========== CHATWOOT: kirim pesan ==========
async function sendReply(accountId, conversationId, message) {
  await fetch(
    `${CHATWOOT_API_URL}/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api_access_token': CHATWOOT_API_KEY,
      },
      body: JSON.stringify({
        content: message,
        message_type: 'outgoing',
      }),
    }
  );
}

// ========== CHATWOOT: update custom attributes ==========
async function updateAttributes(accountId, conversationId, qualData) {
  await fetch(
    `${CHATWOOT_API_URL}/api/v1/accounts/${accountId}/conversations/${conversationId}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'api_access_token': CHATWOOT_API_KEY,
      },
      body: JSON.stringify({
        custom_attributes: {
          product: qualData.product,
          quantity: qualData.quantity,
          event_date: qualData.event_date,
          budget_range: qualData.budget_range,
          lead_status: qualData.status,
        },
      }),
    }
  );
}

// ========== CHATWOOT: handover ke human ==========
async function handoverToHuman(accountId, conversationId) {
  await fetch(
    `${CHATWOOT_API_URL}/api/v1/accounts/${accountId}/conversations/${conversationId}/toggle_status`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api_access_token': CHATWOOT_API_KEY,
      },
      body: JSON.stringify({ status: 'open' }),
    }
  );
}

// ========== CONVERSATION HISTORY ==========
const conversationStore = new Map();

// ========== WEBHOOK HANDLER ==========
app.post('/webhook', async (req, res) => {
  try {
    const event = req.body.event;

    // Hanya proses pesan baru dari customer
    if (event !== 'message_created') {
      return res.sendStatus(200);
    }

    const messageType = req.body.message_type;
    const content = req.body.content;
    const accountId = req.body.account?.id;
    const conversationId = req.body.conversation?.id;

    // Skip kalau bukan incoming atau kosong
    if (messageType !== 'incoming' || !content || !accountId || !conversationId) {
      return res.sendStatus(200);
    }

    console.log(`[Chat ${conversationId}] Customer: ${content}`);

    // Ambil/buat history
    const key = `${accountId}-${conversationId}`;
    if (!conversationStore.has(key)) {
      conversationStore.set(key, []);
    }
    const history = conversationStore.get(key);

    // Tambah pesan customer
    history.push({ role: 'user', content });

    // Call LLM
    const rawResponse = await callLLM(history);
    console.log(`[Chat ${conversationId}] Bot raw: ${rawResponse}`);

    // Parse JSON dari LLM
    let parsed;
    try {
      const clean = rawResponse.replace(/```json|```/g, '').trim();
      parsed = JSON.parse(clean);
    } catch (parseErr) {
      console.error(`[Chat ${conversationId}] JSON parse error, sending raw`);
      parsed = {
        reply: 'Halo kak! Makasih udah chat Pentone 🙏 Boleh tau kak, lagi cari undangan nikah, souvenir, atau dua-duanya?',
        handover: false,
        qualification_data: { status: 'qualifying' },
      };
    }

    // Simpan balasan bot ke history
    history.push({ role: 'assistant', content: rawResponse });

    // Kirim balasan ke customer
    await sendReply(accountId, conversationId, parsed.reply);
    console.log(`[Chat ${conversationId}] Bot sent: ${parsed.reply}`);

    // Update custom attributes
    if (parsed.qualification_data) {
      await updateAttributes(accountId, conversationId, parsed.qualification_data);
    }

    // Handover kalau udah selesai
    if (parsed.handover) {
      await handoverToHuman(accountId, conversationId);
      conversationStore.delete(key);
      console.log(`[Chat ${conversationId}] Handover to human`);
    }

    res.sendStatus(200);
  } catch (err) {
    console.error('Webhook error:', err);
    res.sendStatus(500);
  }
});

// ========== HEALTH CHECK ==========
app.get('/', (req, res) => {
  res.send('Pentone Bot is running 🟢');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Bot running on port ${PORT}`));
