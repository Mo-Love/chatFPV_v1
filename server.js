const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');
const fs = require('fs');
const pdf = require('pdf-parse');  // Для парсингу PDF

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '.')));

// Ініціалізуємо Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

// Базовий промпт (розширений для 12 мануалів)
const SYSTEM_PROMPT = `Ти проста мовна модель ШІ для технічної підтримки FPV дронів. 
Відповідай українською, коротко та практично, на основі 12 мануалів по запчастинах (мотори, пропи, ESC, LiPo) та ПЗ (Betaflight, DJI FPV, INAV, ELRS, OSD тощо). 
Приклади проблем: армування, PID tuning, death roll, відео-шум, мотор гріється, NOGYRO, death flip, binding RX.
Джерела: Betaflight FAQ, Oscar Liang guide, GetFPV troubleshooting, Mepsking, SpeedyBee F405, Happymodel DiamondF4, DJI O3, T-Motor, Gemfan props, FlyMod guides (всього 12 файлів).
Використовуй наданий контекст з мануалів для точних відповідей. Якщо не знаєш — скажи "Перевір мануал або опиши детальніше".`;

// Функція для завантаження та парсингу мануалів (при старті сервера)
let manuals = [];  // Глобальний масив з {name, text}
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
      const text = data.text.substring(0, 2000);  // Обрізаємо для лімітів (можна збільшити)
      manuals.push({ name: file, text: text });
      console.log(`Завантажено: ${file} (${text.length} символів)`);
    } catch (err) {
      console.error(`Помилка парсингу ${file}:`, err);
    }
  }
  return manuals;
}

// Простий пошук релевантного тексту (ключові слова)
function searchInManuals(query, topK = 3) {
  const keywords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);  // Ключові слова з запиту
  let relevant = [];

  for (let manual of manuals) {
    let score = 0;
    for (let kw of keywords) {
      if (manual.text.toLowerCase().includes(kw)) score += 1;
    }
    if (score > 0) relevant.push({ ...manual, score });
  }

  relevant.sort((a, b) => b.score - a.score);
  return relevant.slice(0, topK).map(m => `З мануалу "${m.name}" (score ${m.score}): ${m.text.substring(0, 500)}...`).join('\n');
}

// Головна сторінка
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// API для чату з RAG
app.post('/api/chat', async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'Повідомлення порожнє' });

  try {
    // Пошук у мануалах
    const context = searchInManuals(message);
    const fullPrompt = SYSTEM_PROMPT + (context ? `\n\nРелевантний контекст з мануалів:\n${context}` : '\n\nКонтекст відсутній — використовуй загальні знання.') + `\n\nКористувач: ${message}`;

    const result = await model.generateContent(fullPrompt);
    const response = await result.response;
    const text = response.text();
    res.json({ reply: text });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Помилка з Gemini API' });
  }
});

// Старт: Завантажуємо мануали
loadManuals().then(() => {
  app.listen(PORT, () => {
    console.log(`Сервер на http://localhost:${PORT}. Завантажено ${manuals.length} мануалів.`);
  });
});
