const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const pdf = require('pdf-parse');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '.')));

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

const SYSTEM_PROMPT = `Ти ШІ-помічник для техпідтримки дронів. Відповідай українською, коротко і лише на основі тексту з наданих мануалів. Не використовуй зовнішні знання чи припущення. Якщо відповідь не знайдена в мануалах, скажи: "Інформація відсутня в мануалах. Опиши детальніше або перевір мануал."`;

async function extractFromPDF(pdfPath, searchTerms) {
  try {
    const dataBuffer = fs.readFileSync(pdfPath);
    const data = await pdf(dataBuffer);
    const text = data.text.toLowerCase();
    let relevant = '';
    searchTerms.forEach(term => {
      const index = text.indexOf(term.toLowerCase());
      if (index !== -1) {
        relevant += text.substring(Math.max(0, index - 100), index + 100) + '\n';
      }
    });
    return relevant || 'Інформація відсутня в мануалах.';
  } catch (err) {
    console.error(`Помилка читання ${pdfPath}:`, err);
    return 'Помилка читання PDF.';
  }
}

app.post('/api/chat', async (req, res) => {
  const { message } = req.body;
  console.log('Отримано повідомлення:', message);
  if (!message) return res.status(400).json({ error: 'Повідомлення порожнє' });

  try {
    const searchTerms = message.toLowerCase().split(' ').filter(word => word.length > 3);
    let manualContext = '';

    const manualsDir = './manuals';
    if (fs.existsSync(manualsDir)) {
      const files = fs.readdirSync(manualsDir).filter(f => f.endsWith('.pdf'));
      for (const file of files) {
        const context = await extractFromPDF(`${manualsDir}/${file}`, searchTerms);
        if (context !== 'Інформація відсутня в мануалах.') {
          manualContext += `З ${file}: ${context}\n`;
        }
      }
    }

    const prompt = `${SYSTEM_PROMPT}\n\nКонтекст з мануалів:\n${manualContext}\n\nЗапит користувача: ${message}`;
    console.log('Промпт:', prompt.substring(0, 100) + '...');

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    console.log('Відповідь:', text);

    res.json({ reply: text });
  } catch (error) {
    console.error('Помилка Gemini:', error.message);
    res.status(500).json({ error: 'Помилка з Gemini API: ' + error.message });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Сервер на http://localhost:${PORT}`);
});