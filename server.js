const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');
const fs = require('fs');
const pdf = require('pdf-parse');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '.')));

// Ініціалізуємо Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash', timeout: 10000 });

// Базовий промпт
const BASE_SYSTEM_PROMPT = `Ти проста мовна модель ШІ для технічної підтримки FPV дронів. 
Відповідай українською, коротко та практично, на основі всіх доступних мануалів по запчастинах (мотори, пропи, ESC, LiPo) та ПЗ (Betaflight, DJI FPV, INAV, ELRS, OSD тощо). 
Приклади проблем: армування, PID tuning, death roll, відео-шум, мотор гріється, NOGYRO, death flip, binding RX.
Джерела: Betaflight FAQ, Oscar Liang guide, GetFPV troubleshooting, Mepsking, SpeedyBee F405, Happymodel DiamondF4, DJI O3, T-Motor, Gemfan props, FlyMod guides та інші (всього %NUM_MANUALS% файлів).
Використовуй наданий контекст з мануалів для точних відповідей. Якщо є релевантний мануал, додай посилання на нього. Якщо не знаєш — скажи "Перевір мануал або опиши детальніше".`;

// Завантаження мануалів
let manuals = [];
async function loadManuals() {
  const manualsDir = './manuals';
  if (!fs.existsSync(manualsDir)) {
    console.log('Папка manuals не знайдена — створюємо порожню базу.');
    return [];
  }

  const files = fs.readdirSync(manualsDir).filter(f => f.endsWith('.pdf'));
  console.log(`Знайдено ${files.length} PDF-мануалів.`);
  
  for (let file of files) {
    try {
      const dataBuffer = fs.readFileSync(path.join(manualsDir, file));
      const data = await pdf(dataBuffer);
      const text = data.text.substring(0, 2000);
      const url = `https://github.com/Mo-Love/chatFPV_v1/raw/main/manuals/${encodeURIComponent(file)}`;
      manuals.push({ name: file, text: text, url: url });
      console.log(`Завантажено: ${file} (${text.length} символів, URL: ${url})`);
    } catch (err) {
      console.error(`Помилка парсингу ${file}:`, err);
    }
  }
  return manuals;
}

// Пошук релевантного тексту
function searchInManuals(query, topK = 3) {
  const keywords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  let relevant = [];

  for (let manual of manuals) {
    let score = 0;
    for (let kw of keywords) {
      if (manual.text.toLowerCase().includes(kw)) score += 1;
    }
    if (score > 0) relevant.push({ ...manual, score });
  }

  relevant.sort((a, b) => b.score - a.score);
  return relevant.slice(0, topK).map(m => ({
    text: `З мануалу "${m.name}" (score ${m.score}): ${m.text.substring(0, 500)}...`,
    url: m.url
  }));
}

// Головна сторінка
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// API для чату
app.post('/api/chat', async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'Повідомлення порожнє' });

  try {
    const systemPrompt = BASE_SYSTEM_PROMPT.replace('%NUM_MANUALS%', manuals.length.toString());
    const relevantManuals = searchInManuals(message);
    const context = relevantManuals.map(m => m.text).join('\n');
    const links = relevantManuals.map(m => `[${m.text.split('"')[1]}](${m.url})`).join('\n');
    const fullPrompt = systemPrompt + (context ? `\n\nРелевантний контекст з мануалів:\n${context}` : '\n\nКонтекст відсутній — використовуй загальні знання.') + `\n\nКористувач: ${message}`;

    const result = await model.generateContent(fullPrompt);
    const response = await result.response;
    let text = response.text();
    if (links) text += `\n\nДокладніше в мануалах:\n${links}`;
    res.json({ reply: text });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Помилка з Gemini API: ' + error.message });
  }
});

// Новий ендпоінт для консолі
app.get('/api/chat/console', (req, res) => {
  try {
    const consoleData = {
      manualCount: manuals.length,
      manuals: manuals.map(m => ({
        name: m.name,
        url: m.url,
        textLength: m.text.length
      })),
      serverStatus: 'Running',
      port: PORT,
      timestamp: new Date().toISOString()
    };
    res.json(consoleData);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Помилка консолі: ' + error.message });
  }
});

// Старт сервера
loadManuals().then(() => {
  app.listen(PORT, () => {
    console.log(`Сервер на http://localhost:${PORT}. Завантажено ${manuals.length} мануалів.`);
  });
});