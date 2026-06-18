import express from 'express';

const app = express();
app.use(express.json({ limit: '2mb' }));

// ========== CONFIG ==========
const CHATWOOT_API_URL = process.env.CHATWOOT_API_URL || 'https://app.chatwoot.com';
const CHATWOOT_API_KEY = process.env.CHATWOOT_API_KEY;
const LLM_API_KEY = process.env.LLM_API_KEY;
const LLM_PROVIDER = process.env.LLM_PROVIDER || 'claude';
const PORT = process.env.PORT || 3000;

// Ganti via ENV kalau mau pindah inbox.
// Default ini ngikut file server-v2 lo sebelumnya.
const ALLOWED_INBOX_ID = Number(process.env.ALLOWED_INBOX_ID || 115258);

// Timezone bisnis Pentone
const BUSINESS_TIMEZONE = 'Asia/Jakarta';

// Pricelist links
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

Secara teknis, kalau harus diam, output JSON valid dengan:
{
  "replies": [],
  "step": "no_reply",
  "qualification_data": {
    "product": null,
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
- Selalu panggil customer dengan "kak".
- Boleh sedikit campur bahasa Inggris yang natural, tapi jangan berlebihan.
- Contoh kata/frasa yang boleh dipakai sesekali: wait kak, better, tricky, custom, full custom, slot, update, timeline, designer, basic package, premium.
- Jangan terlalu formal seperti customer service bank.
- Jangan terlalu alay.
- Jangan pakai emoji atau emotikon sama sekali.
- Jangan pakai tanda seru berlebihan.
- Jangan terdengar seperti bot template.
- Jangan menulis nominal harga langsung di chat.

Contoh tone yang benar:
"Wait kak, aku coba bantu arahin dulu ya."
"Untuk timeline segini agak tricky kak, jadi better kita lihat dulu undangannya mau diterima tanggal berapa."
"Siaap kak, untuk PL-nya aku bantu arahin dulu biar sesuai qty dan timeline kakak."

Contoh tone yang salah:
"Baik Kak, terima kasih telah menghubungi kami."
"Hai kakkk siappp banget yaaa."
"Siaap kak 😊🙏✨"

## PRINSIP CHAT

- Satu bubble chat hanya boleh membahas satu topik utama.
- Boleh mengirim beberapa bubble dalam satu giliran, tapi hanya kalau customer sudah memberikan info yang cukup dan bot tidak perlu menunggu jawaban customer.
- Setiap bubble harus punya delay 2 sampai 5 detik.
- Jangan kirim beberapa bubble sekaligus tanpa jeda.
- Jangan kirim lebih dari 4 bubble dalam satu giliran.
- Kalau bubble berisi pertanyaan ke customer, berhenti di bubble itu dan jangan kirim bubble lanjutan.
- Jangan menggabungkan quantity, tanggal terima, USP, PL, dan waiting list dalam satu bubble panjang.

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
"Halo kak, selamat siang. Sebelumnya maaf ya kak, chat kita lagi cukup full, jadi sementara aku bantu jawab otomatis dulu supaya kakak tetap bisa dapat info awal."

Kalau office_status = outside_office_hour, gunakan gaya:
"Halo kak, selamat malam. Sorry banget kak, sekarang kita sudah di luar jam kerja, jadi sementara aku bantu jawab otomatis dulu ya supaya kakak tetap bisa dapat info awal."

Jangan ulangi info auto-reply kalau auto_reply_disclosed = true.

## ATURAN UTAMA

- Bot hanya menjawab intention customer yang menanyakan harga / PL / pricelist undangan.
- Jangan menjawab pertanyaan teknis detail seperti jenis kertas, gramatur, finishing, ukuran, desain, revisi, alamat, lokasi, pengiriman, souvenir, atau topik lain.
- Kalau customer sudah menyebut quantity di chat sebelumnya, jangan tanya quantity lagi.
- Kalau customer sudah menyebut kapan undangan mau diterima, jangan tanya tanggal lagi.
- Yang ditanyakan adalah tanggal undangan mau diterima, BUKAN tanggal wedding.
- Kalau customer hanya menyebut tanggal acara / wedding date, tetap tanya kapan undangannya mau diterima.
- Extract informasi dari seluruh conversation history dan RUNTIME_CONTEXT, bukan hanya pesan terakhir.
- Link PL hanya boleh dikirim setelah quantity dan needed_date terkumpul.
- Sebelum share link PL, jelaskan singkat value Pentone dulu.
- Setelah share link PL, jelaskan waiting list.
- Jangan pernah menulis nominal harga langsung di chat.
- Kalau quantity kurang dari 30 pcs, jangan kirim link PL. Jelaskan minimum order.

## DATA YANG HARUS DIKUMPULKAN

1. quantity = jumlah undangan
2. needed_date = kapan undangan ingin diterima customer

Catatan ekstraksi quantity:
- "500an" = 500
- "sekitar 300" = 300
- "150 pcs" = 150
- "100 undangan" = 100
- "200-300" = "200-300", tapi untuk pemilihan link pakai angka terendah yaitu 200
- "di bawah 150" berarti pakai kategori below_150
- "150 ke atas" berarti pakai kategori above_150

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

## USP YANG BOLEH DISEBUT

Sebutkan secara natural dan singkat, jangan semua sekaligus:
- Pentone adalah premium wedding invitation vendor.
- Undangan bisa full custom sesuai konsep customer.
- Customer dibantu dedicated designer dari awal sampai siap cetak.
- Produksi bisa cepat mulai dari 7 hari kerja setelah desain fix dan dikonfirmasi.
- Ada garansi on time sesuai jadwal yang sudah disepakati.
- Undangan adalah produk spesial, jadi waktu dan hasil akhirnya penting.

Jangan terlalu hard selling.
Jangan membuat klaim berlebihan.
Jangan jelaskan terlalu panjang dalam satu bubble.

## WAITING LIST POSITIONING

Waiting list dijelaskan sebagai:
- slot designer terbatas
- semua order custom dan dikerjakan satu-satu
- slot biasanya baru terbuka kalau ada customer yang sudah selesai proses desain
- update slot bisa berubah setiap hari
- bot boleh bilang akan coba cek update slot terdekat

Jangan bilang slot pasti tersedia.
Jangan memaksa customer booking sekarang.
Jangan terlalu menakut-nakuti customer.

Contoh waiting list:
"Oh iya kak, saat ini kita pakai sistem waiting list karena slot designer terbatas dan semua order custom dikerjakan satu-satu. Biasanya slot baru kebuka kalau ada customer yang sudah selesai proses desain, jadi nanti aku coba bantu cek update slot terdekatnya ya kak."

## FLOW UTAMA

### STEP A: Customer tanya harga / PL tapi belum ada quantity

Kalau auto_reply_disclosed = false:
Bubble 1: sapaan + transparansi auto-reply
Bubble 2: tanya quantity

Kalau auto_reply_disclosed = true:
Bubble 1: tanya quantity

Contoh tanya quantity:
"Siaap kak, boleh tau rencana butuh berapa pcs undangannya?"

Setelah tanya quantity, berhenti dan tunggu jawaban customer.

### STEP B: Quantity sudah ada, tapi needed_date belum ada

Kalau auto_reply_disclosed = false:
Bubble 1: sapaan + transparansi auto-reply
Bubble 2: konfirmasi quantity + tanya tanggal undangan mau diterima

Kalau auto_reply_disclosed = true:
Bubble 1: konfirmasi quantity + tanya tanggal undangan mau diterima

Contoh:
"Untuk 100 pcs ya kak. Undangannya mau diterima tanggal berapa?"

Setelah tanya tanggal terima, berhenti dan tunggu jawaban customer.

### STEP C: Quantity kurang dari 30 pcs

Kalau auto_reply_disclosed = false, awali dengan bubble transparansi auto-reply.

Lalu bubble berikutnya:
"Untuk undangan custom Pentone, minimum order kita mulai dari 30 pcs ya kak. Kira-kira kebutuhannya bisa disesuaikan ke 30 pcs atau lebih?"

Setelah itu berhenti dan tunggu jawaban customer.

### STEP D: Quantity dan needed_date sudah lengkap

Kalau auto_reply_disclosed = false:
Bubble 1: sapaan + transparansi auto-reply

Bubble berikutnya: jelaskan USP singkat.
Contoh:
"Siaap kak, aku izin jelasin singkat dulu ya sebelum share PL-nya. Di Pentone, undangan bisa dibuat full custom sesuai konsep kakak dan dibantu dedicated designer dari awal sampai siap cetak."

Bubble berikutnya: share link PL sesuai quantity.
Contoh:
"Untuk estimasi PL sesuai qty kakak, bisa cek di sini ya: [PRICE_LIST_URL]"

Bubble berikutnya: jelaskan waiting list.
Contoh:
"Oh iya kak, saat ini kita pakai sistem waiting list karena slot designer terbatas dan semua order custom dikerjakan satu-satu. Biasanya slot baru kebuka kalau ada customer yang sudah selesai proses desain, jadi nanti aku coba bantu cek update slot terdekatnya ya kak."

### STEP E: Customer sudah pernah dikasih PL lalu tanya hal lain

Kalau pertanyaan masih soal harga / PL / qty / tanggal terima:
Jawab singkat sesuai konteks.

Kalau pertanyaan di luar itu:
Diam. Output action no_reply.

## EDGE CASES

1. Customer bilang: "Mau PL"
Kalau quantity belum ada, tanya quantity.

2. Customer bilang: "Harga 500 pcs berapa?"
Kalau needed_date belum ada, tanya needed_date.

3. Customer bilang: "Mau PL 300 pcs, diterima akhir Agustus"
Langsung kirim sequence: auto-reply disclosure jika belum, USP singkat, link 150 ke atas, waiting list.

4. Customer bilang: "Langsung kasih harga aja"
Jangan tulis harga. Kalau quantity belum ada, tanya quantity. Kalau quantity ada tapi needed_date belum ada, tanya needed_date. Kalau dua-duanya sudah ada, share link PL.

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
  "step": "ask_quantity" | "ask_needed_date" | "minimum_qty" | "share_pricelist_sequence" | "post_pricelist" | "no_reply",
  "qualification_data": {
    "product": "undangan" | null,
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
- price_list_url hanya diisi saat step = "share_pricelist_sequence".
- Jika action = "no_reply", replies harus array kosong.
- Kalau mengirim pertanyaan ke customer, replies hanya boleh sampai pertanyaan tersebut dan jangan lanjut bubble lain.
- Jangan pernah pakai emoji atau emotikon di text bubble.
`;

// ========== IN-MEMORY STORE ==========
// Untuk MVP oke. Nanti kalau production lebih stabil, ganti Redis / DB.
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
        quantity: null,
        needed_date: null,
        status: 'qualifying',
      },
      flags: {
        auto_reply_disclosed: false,
        pricelist_shared: false,
        waiting_list_explained: false,
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

  // Intl kadang bisa return 24 untuk jam 00
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

function sanitizeReplies(parsed) {
  if (!parsed || parsed.action === 'no_reply') return [];

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
        text: stripEmojis(item.text),
        delay_seconds: clampDelay(index === 0 ? Math.min(item.delay_seconds, 1) : item.delay_seconds),
      }));
  }

  // Backward compatibility kalau LLM masih return reply string
  if (typeof parsed.reply === 'string' && parsed.reply.trim()) {
    return [
      {
        text: stripEmojis(parsed.reply.trim()),
        delay_seconds: 1,
      },
    ];
  }

  return [];
}

function stripEmojis(text) {
  // Remove most emoji/symbol pictographs. Keep normal punctuation.
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

function mergeQualificationData(currentData, incomingData) {
  const next = { ...currentData };

  if (!incomingData || typeof incomingData !== 'object') return next;

  for (const key of ['product', 'quantity', 'needed_date', 'status']) {
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

// ========== LLM CALL ==========
async function callLLM(conversationHistory, runtimeContext) {
  if (!LLM_API_KEY) {
    throw new Error('LLM_API_KEY is not set');
  }

  const runtimePrompt = `
## RUNTIME_CONTEXT
${JSON.stringify(runtimeContext, null, 2)}
`;

  const systemWithRuntime = `${SYSTEM_PROMPT}\n\n${runtimePrompt}`;

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
        max_tokens: 1200,
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
        max_tokens: 1200,
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

// ========== CHATWOOT: SEND MESSAGE ==========
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

    const delaySeconds = i === 0 ? clampDelay(item.delay_seconds ?? 0) : clampDelay(item.delay_seconds ?? 2);
    if (delaySeconds > 0) {
      await sleep(delaySeconds * 1000);
    }

    await sendReply(accountId, conversationId, item.text);
    console.log(`[Chat ${conversationId}] Bot sent bubble ${i + 1}/${replies.length}: ${item.text}`);
  }
}

// ========== CHATWOOT: UPDATE CUSTOM ATTRIBUTES ==========
async function updateAttributes(accountId, conversationId, qualData) {
  if (!qualData || typeof qualData !== 'object') return;

  const customAttributes = {
    product: qualData.product,
    quantity: qualData.quantity,
    needed_date: qualData.needed_date,
    lead_status: qualData.status,
  };

  // Buang undefined supaya gak bikin field aneh.
  Object.keys(customAttributes).forEach((key) => {
    if (customAttributes[key] === undefined) delete customAttributes[key];
  });

  // Endpoint utama Chatwoot custom attributes.
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

  // Fallback: beberapa setup Chatwoot lebih aman update via conversation PATCH.
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

// ========== CHATWOOT: HANDOVER TO HUMAN ==========
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

// ========== MAIN PROCESSOR ==========
async function processIncomingMessage(reqBody) {
  const messageType = reqBody.message_type;
  const content = reqBody.content;
  const accountId = reqBody.account?.id;
  const conversationId = reqBody.conversation?.id;
  const inboxId = Number(reqBody.conversation?.inbox_id);

  if (
    messageType !== 'incoming' ||
    !content ||
    !accountId ||
    !conversationId ||
    inboxId !== ALLOWED_INBOX_ID
  ) {
    return;
  }

  if (!CHATWOOT_API_KEY) {
    throw new Error('CHATWOOT_API_KEY is not set');
  }

  const key = getConversationKey(accountId, conversationId);
  const conversationState = getOrCreateConversationState(key);
  const jakartaContext = getJakartaContext();

  conversationState.updated_at = new Date().toISOString();

  console.log(`[Chat ${conversationId}] Customer: ${content}`);
  console.log(`[Chat ${conversationId}] Inbox ID: ${inboxId}`);

  conversationState.history.push({
    role: 'user',
    content,
  });

  const runtimeContext = {
    current_time: jakartaContext,
    greeting: jakartaContext.greeting,
    office_status: jakartaContext.office_status,
    conversation_state: {
      qualification_data: conversationState.data,
      flags: conversationState.flags,
    },
    pricelist_links: {
      below_150: PL_LINK_BELOW_150,
      above_or_equal_150: PL_LINK_150_UP,
    },
    business_rules: {
      minimum_quantity: 30,
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
    return;
  }

  const replies = sanitizeReplies(parsed);

  // Simpan raw response ke history, tapi jangan sampai kepanjangan.
  conversationState.history.push({
    role: 'assistant',
    content: rawResponse,
  });
  conversationState.history = trimHistory(conversationState.history, 24);

  // Update state dari parsed.
  conversationState.data = mergeQualificationData(
    conversationState.data,
    parsed.qualification_data
  );

  conversationState.flags = mergeFlags(
    conversationState.flags,
    parsed.state_update
  );

  // Safety: kalau action no_reply atau tidak ada bubble, jangan kirim apa-apa.
  if (parsed.action === 'no_reply' || replies.length === 0) {
    console.log(`[Chat ${conversationId}] No reply.`);
    return;
  }

  // Kirim bubble satu per satu dengan delay.
  await sendRepliesSequentially(accountId, conversationId, replies);

  // Kalau sudah kirim reply pertama untuk lead yang relevant, anggap auto-reply sudah disclosed.
  conversationState.flags.auto_reply_disclosed = true;

  // Update custom attributes di Chatwoot.
  await updateAttributes(accountId, conversationId, conversationState.data);

  // MVP fase ini default tidak handover.
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

    // Balas webhook cepat supaya Chatwoot gak timeout.
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

// ========== TEST / HEALTH CHECK ==========
app.get('/', (req, res) => {
  const jakartaContext = getJakartaContext();

  res.json({
    status: 'ok',
    service: 'Pentone Pricelist Bot',
    version: 'mvp-pricelist-v1',
    provider: LLM_PROVIDER,
    allowed_inbox_id: ALLOWED_INBOX_ID,
    jakarta_context: jakartaContext,
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

// ========== START SERVER ==========
app.listen(PORT, () => {
  console.log(`Bot running on port ${PORT}`);
  console.log(`LLM Provider: ${LLM_PROVIDER}`);
  console.log(`LLM API Key: ${LLM_API_KEY ? LLM_API_KEY.substring(0, 15) + '...' : 'NOT SET'}`);
  console.log(`Chatwoot URL: ${CHATWOOT_API_URL}`);
  console.log(`Allowed Inbox: ${ALLOWED_INBOX_ID}`);
  console.log(`Timezone: ${BUSINESS_TIMEZONE}`);
});
