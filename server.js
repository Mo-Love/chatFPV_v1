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
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

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
    const result = await model.generateContent([
      { role: 'user', parts: [{ text: SYSTEM_PROMPT + '\n\nКористувач: ' + message }] }
    ]);
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