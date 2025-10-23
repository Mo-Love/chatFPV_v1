// Базовий промпт (без фіксованої кількості)
const BASE_SYSTEM_PROMPT = `Ти проста мовна модель ШІ для технічної підтримки FPV дронів. 
Відповідай українською, коротко та практично, на основі всіх доступних мануалів по запчастинах (мотори, пропи, ESC, LiPo) та ПЗ (Betaflight, DJI FPV, INAV, ELRS, OSD тощо). 
Приклади проблем: армування, PID tuning, death roll, відео-шум, мотор гріється, NOGYRO, death flip, binding RX.
Джерела: Betaflight FAQ, Oscar Liang guide, GetFPV troubleshooting, Mepsking, SpeedyBee F405, Happymodel DiamondF4, DJI O3, T-Motor, Gemfan props, FlyMod guides та інші (всього %NUM_MANUALS% файлів).
Використовуй наданий контекст з мануалів для точних відповідей. Якщо не знаєш — скажи "Перевір мануал або опиши детальніше".`;

// У /api/chat: динамічно вставляємо кількість
app.post('/api/chat', async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'Повідомлення порожнє' });

  try {
    // Динамічний промпт з реальною кількістю
    const systemPrompt = BASE_SYSTEM_PROMPT.replace('%NUM_MANUALS%', manuals.length.toString());

    // Пошук у мануалах
    const context = searchInManuals(message);
    const fullPrompt = systemPrompt + (context ? `\n\nРелевантний контекст з мануалів:\n${context}` : '\n\nКонтекст відсутній — використовуй загальні знання.') + `\n\nКористувач: ${message}`;

    const result = await model.generateContent(fullPrompt);
    const response = await result.response;
    const text = response.text();
    res.json({ reply: text });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Помилка з Gemini API' });
  }
});
