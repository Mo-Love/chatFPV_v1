const express = require('express');
const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const port = process.env.PORT || 3000;
app.use(express.json());
app.use(express.static(path.join(__dirname, '.')));

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' }); // Виправлено модель

const SYSTEM_PROMPT = 'Ти — експерт із FPV дронів, який допомагає користувачам із технічними питаннями щодо складання, налаштування та ремонту дронів. Використовуй інформацію з PDF-мануалів. Відповідай коротко, чітко, українською. Якщо є схема, укажи її як [Схема: /images/назва.png].';
const SYSTEM_PROMPT = 'Ти — дружній експерт із FPV дронів, який допомагає користувачам із технічними питаннями щодо складання, налаштування та ремонту дронів. Використовуй інформацію з PDF-мануалів. Відповідай дружньо, з "Друже", коротко, чітко, українською, з абзацами та маркерами для читабельності. Якщо є схема, укажи її як [Схема: /images/назва.png].';
async function extractFromPDF(filePath, searchTerms) {
  try {
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdf(dataBuffer);
    const text = data.text.toLowerCase();
    return searchTerms.some(term => text.includes(term)) ? text.substring(0, 500) + '...' : 'Інформація відсутня в мануалах.';
  } catch (err) {
    console.error(`Помилка обробки PDF ${filePath}:`, err.message);
    return 'Помилка обробки PDF.';
  }
}

app.post('/api/chat', async (req, res) => {
  const { message } = req.body;
  if (!message) {
    console.error('Порожній запит');
    return res.status(400).json({ error: 'Повідомлення порожнє' });
  }

  try {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY не встановлено');
    }

    const searchTerms = message.toLowerCase().split(' ').filter(word => word.length > 3);
    let manualContext = '';
    const manualsDir = path.join(__dirname, 'manuals');

    if (fs.existsSync(manualsDir)) {
      const files = fs.readdirSync(manualsDir).filter(f => f.endsWith('.pdf'));
      console.log('Знайдені PDF:', files);
      for (const file of files) {
        const context = await extractFromPDF(path.join(manualsDir, file), searchTerms);
        if (context !== 'Інформація відсутня в мануалах.') {
          manualContext += `З ${file}: ${context}\n`;
        }
      }
    } else {
      console.warn('Папка /manuals/ не знайдена');
      manualContext += 'Папка з мануалами відсутня.\n';
    }

    const imageDir = path.join(__dirname, 'images');
    let imageUrl = null;
    if (fs.existsSync(imageDir)) {
      const images = fs.readdirSync(imageDir).filter(f => f.endsWith('.png'));
      console.log('Знайдені зображення:', images);
      const matchingImage = images.find(img => searchTerms.some(term => img.toLowerCase().includes(term)));
      if (matchingImage) {
        imageUrl = `/images/${matchingImage}`;
        manualContext += `[Схема: ${imageUrl}]`;
      }
    } else {
      console.warn('Папка /images/ не знайдена, створюємо порожню');
      fs.mkdirSync(imageDir, { recursive: true });
    }

    const prompt = `${SYSTEM_PROMPT}\n\nКонтекст з мануалів:\n${manualContext}\n\nЗапит користувача: ${message}`;
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    res.json({ reply: text, image: imageUrl });
  } catch (error) {
    console.error('Помилка в /api/chat:', error.message);
    res.status(500).json({ error: `Помилка: ${error.message}` });
  }
});

app.listen(port, () => {
  console.log(`Сервер працює на порті ${port}`);
});