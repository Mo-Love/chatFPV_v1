const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware для JSON і статичних файлів
app.use(express.json());
app.use(express.static(path.join(__dirname, '.')));

// Ініціалізуємо Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });  // Було: 'gemini-1.5-flash'

// Промпт для FPV-контексту
const SYSTEM_PROMPT = `Ти проста мовна модель ШІ для технічної підтримки FPV дронів. 
Відповідай українською, коротко та практично, на основі мануалів по запчастинах (мотори, пропи, ESC, LiPo) та ПЗ (Betaflight, DJI FPV, INAV).
Приклади проблем: армування, PID tuning, death roll, відео-шум, мотор гріється.
Джерела: Betaflight FAQ, Oscar Liang guide, GetFPV troubleshooting, Mepsking.
Якщо не знаєш — скажи "Перевір мануал або опиши детальніше".`;

app.post('/api/chat', async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'Повідомлення порожнє' });

  try {
    const prompt = SYSTEM_PROMPT + '\n\nКористувач: ' + message;
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    res.json({ reply: text });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Помилка з Gemini API' });
  }
});

// Головна сторінка — наш HTML
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Сервер на http://localhost:${PORT}`);
});

const fs = require('fs');
const pdf = require('pdf-parse');

// Функція для читання PDF
async function extractFromPDF(pdfPath, searchTerms) {
  try {
    const dataBuffer = fs.readFileSync(pdfPath);
    const data = await pdf(dataBuffer);
    const text = data.text.toLowerCase();
    let relevant = '';
    searchTerms.forEach(term => {
      const index = text.indexOf(term.toLowerCase());
      if (index !== -1) {
        // Бере ~200 символів навколо терміну
        relevant += text.substring(Math.max(0, index - 100), index + 100) + '\n';
      }
    });
    return relevant || 'Не знайдено в мануалі.';
  } catch (err) {
    return 'Помилка читання PDF.';
  }
}

// У /api/chat, перед generateContent:
app.post('/api/chat', async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'Повідомлення порожнє' });

  try {
    // Шукай ключові слова (наприклад, з повідомлення)
    const searchTerms = message.toLowerCase().split(' ').filter(word => word.length > 3);
    let manualContext = '';

    // Читай всі PDF з папки /manuals
    const manualsDir = './manuals';
    if (fs.existsSync(manualsDir)) {
      const files = fs.readdirSync(manualsDir).filter(f => f.endsWith('.pdf'));
      for (const file of files) {
        const context = await extractFromPDF(`${manualsDir}/${file}`, searchTerms);
        if (context !== 'Не знайдено в мануалі.') {
          manualContext += `З ${file}: ${context}\n`;
        }
      }
    }

    const prompt = SYSTEM_PROMPT + '\n\nКонтекст з мануалів: ' + manualContext + '\n\nКористувач: ' + message;
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    res.json({ reply: text });
  } catch (error) {
    console.error('Помилка:', error);
    res.status(500).json({ error: 'Помилка з Gemini' });
  }
});
