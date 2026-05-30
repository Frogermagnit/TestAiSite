export default async function handler(req, res) {
    // Разрешаем запросы только методом POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // Достаем твой секретный ключ из переменных окружения Vercel
    const key = process.env.OPENROUTER_API_KEY;
    if (!key) {
        return res.status(500).json({ error: 'Конфигурация сервера не завершена. API-ключ отсутствует.' });
    }

    const { text } = req.body;
    if (!text || !text.trim()) {
        return res.status(400).json({ error: 'Текст запроса пуст.' });
    }

    // Защита кошелька: ограничиваем максимальную длину входящего текста (например, 1500 символов)
    if (text.length > 1500) {
        return res.status(400).json({ error: 'Текст слишком длинный. Лимит — 1500 символов.' });
    }

    const SYSTEM_PROMPT = `Ты — ведущий UI/UX архитектор и профессиональный инженер промптов для генераторов веб-интерфейсов. Твоя цель — взять короткую, хаотичную или сырую идею пользователя и превратить её в идеальный, технически детализированный промпт для большой языковой модели или нейросети, которая создает дизайн сайтов.

Правила формирования улучшенного промпта:
1. Роль и Контекст: Всегда начинай с указания роли, например: "Действуй как профессиональный UI/UX дизайнер..." или "Разработай концепт современного интерфейса для...".
2. Структурирование по блокам: Превращай запрос в чёткую структуру. Промпт должен включать (если применимо):
   - Общая концепция и стиль (например, технический минимализм, брутализм, lo-fi эстетика, корпоративный стиль).
   - Цветовая палитра (конкретные HEX-коды или точные описания, например: "глубокий черный #000000 для хедера, темно-серый #121214 для основного фона").
   - Сетка и Лейаут (структура колонок, расположение элементов, фиксированные или адаптивные панели).
   - Элементы UI и навигация (кнопки, формы, инпуты, их состояния при ховере, поведение шрифтов).
   - Типографика (четкие указания семейств шрифтов, например, использование Monospace шрифтов вроде 'Overpass Mono' для кодовой эстетики).
3. Точность: Убирай «воду». Делай требования к дизайну конкретными и понятными для выполнения ИИ-моделью.
4. Важно: Сохраняй изначальную суть идеи пользователя.
5. Выводи ТОЛЬКО получившийся готовый текст промпта, без приветствий, вступлений, кавычек вокруг результата и твоих личных комментариев.`;

    const models = [
        'meta-llama/llama-3.2-3b-instruct:free',
        'deepseek/deepseek-v4-flash:free',
        'google/gemma-4-26b-a4b-it:free'
    ];

    const startTime = Date.now();
    const timeoutDuration = 30000; // 30 секунд лимит
    let success = false;
    let attemptCount = 1;
    let lastError = 'Не удалось получить ответ от моделей';

    const delay = ms => new Promise(res => setTimeout(res, ms));

    while (Date.now() - startTime < timeoutDuration && !success) {
        for (let i = 0; i < models.length; i++) {
            if (Date.now() - startTime >= timeoutDuration) break;

            const currentModel = models[i];

            try {
                const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${key}`,
                        'HTTP-Referer': 'https://vercel.com',
                        'X-Title': 'Prompt Rephraser Server'
                    },
                    body: JSON.stringify({
                        model: currentModel,
                        messages: [
                            { role: 'system', content: SYSTEM_PROMPT },
                            { role: 'user', content: text }
                        ],
                        temperature: 0.3
                    })
                });

                const data = await response.json();

                if (!response.ok || (data.error && (data.error.message.includes('Provider') || data.error.code === 503 || data.error.code === 400))) {
                    throw new Error(data.error?.message || `Ошибка сервера OpenRouter`);
                }

                // Если всё ок, отдаем результат клиенту
                return res.status(200).json({ result: data.choices[0].message.content.trim() });

            } catch (error) {
                lastError = error.message;
                // Идем к следующей модели
            }
        }

        if (Date.now() - startTime < timeoutDuration) {
            await delay(2000);
            attemptCount++;
        }
    }

    return res.status(503).json({ error: `Все модели перегружены. Последняя ошибка: ${lastError}` });
}
