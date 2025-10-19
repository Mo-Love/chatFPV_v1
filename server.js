const axios = require('axios');
const cheerio = require('cheerio');

// Функція для скрапінгу FlyMod
async function extractFromFlyMod(searchTerms) {
  try {
    const url = 'https://flymod.net/';
    const response = await axios.get(url);
    const $ = cheerio.load(response.data);
    let relevant = '';

    // Шукаємо ключові розділи (каталоги, статті)
    const sections = [
      { selector: '.catalog-item', keywords: ['fpv', 'vtx', 'expresslrs'] },
      { selector: '.article', keywords: ['expresslrs', 'fpv video', 'drone nationals'] },
      { selector: 'p, li', keywords: searchTerms } // Загальний пошук
    ];

    sections.forEach(section => {
      $(section.selector).each((i, elem) => {
        const text = $(elem).text().toLowerCase();
        section.keywords.forEach(term => {
          if (text.includes(term)) {
            relevant += text.substring(0, 200) + '... ';
          }
        });
      });
    });

    return relevant || 'Інформація з FlyMod відсутня.';
  } catch (err) {
    console.error('Помилка скрапінгу FlyMod:', err);
    return 'Помилка завантаження сайту.';
  }
}

// У /api/chat, перед generateContent:
app.post('/api/chat', async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'Повідомлення порожнє' });

  try {
    const searchTerms = message.toLowerCase().split(' ').filter(word => word.length > 3);
    let manualContext = '';

    // PDF з /manuals
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

    // Додаємо скрапінг FlyMod
    const flyModContext = await extractFromFlyMod(searchTerms);
    manualContext += `З FlyMod.net: ${flyModContext}\n`;

    const prompt = `${SYSTEM_PROMPT}\n\nКонтекст з мануалів і сайту:\n${manualContext}\n\nЗапит користувача: ${message}`;
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    res.json({ reply: text });
  } catch (error) {
    console.error('Помилка:', error);
    res.status(500).json({ error: 'Помилка з Gemini' });
  }
});