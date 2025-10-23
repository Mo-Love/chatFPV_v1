const express = require('express');
const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const NodeCache = require('node-cache'); // Додаємо node-cache

const app = express();
const port = process.env.PORT || 3000;
app.use(express.json());
app.use(express.static(path.join(__dirname, '.')));

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
const cache = new NodeCache({ stdTTL: 600 }); // Ініціалізуємо кеш (10 хвилин)

const SYSTEM_PROMPT = `Ти проста мовна модель ШІ для технічної підтримки FPV дронів. 
Відповідай українською, коротко та практично, на основі 12 мануалів по запчастинах (мотори, пропи, ESC, LiPo) та ПЗ (Betaflight, DJI FPV, INAV, ELRS, OSD тощо). 
Приклади проблем: армування, PID tuning, death roll, відео-шум, мотор гріється, NOGYRO, death flip.
Джерела: Betaflight FAQ, Oscar Liang guide, GetFPV troubleshooting, Mepsking, SpeedyBee F405 manual, Happymodel DiamondF4, DJI O3, T-Motor, Gemfan props, FlyMod guides (всього 12 файлів).
Якщо не знаєш — скажи "Перевір мануал або опиши детальніше".`;

async function extractFromPDF(filePath, searchTerms) {
  const cacheKey = `${filePath}-${searchTerms.join('-')}`; // Унікальний ключ для кешу
  const cached = cache.get(cacheKey);
  if (cached) {
    console.log('Використано кеш для:', filePath);
    return cached;
  }

  console.log('Обробка PDF:', filePath, 'з термінами:', searchTerms);
  try {
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdf(dataBuffer);
    const text = data.text.toLowerCase();
    const result = searchTerms.some(term => text.includes(term)) ? text.substring(0, 500) + '...' : 'Інформація відсутня в мануалах.';
    cache.set(cacheKey, result); // Зберігаємо результат у кеш
    return result;
  } catch (err) {
    console.error(`Помилка обробки PDF ${filePath}:`, err.message);
    return 'Помилка обробки PDF.';
  }
}

app.post('/api/chat', async (req, res) => {
  const { message } = req.body;
  console.log('Отриманий запит:', message);
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
      const contexts = await Promise.all(files.map(file => extractFromPDF(path.join(manualsDir, file), searchTerms)));
      manualContext = contexts
        .filter(context => context !== 'Інформація відсутня в мануалах.' && context !== 'Помилка обробки PDF.')
        .map((context, i) => `З ${files[i]}: ${context}\n`)
        .join('');
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
    console.log('Промпт для Gemini:', prompt);
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    console.log('Відповідь Gemini:', text);
    res.json({ reply: text, image: imageUrl });
  } catch (error) {
    console.error('Помилка в /api/chat:', error.message);
    res.status(500).json({ error: `Помилка: ${error.message}` });
  }
});

app.listen(port, () => {
  console.log(`Сервер працює на порті ${port}`);
});
