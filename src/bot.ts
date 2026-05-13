import {Bot, Context, Keyboard} from '@maxhub/max-bot-api';
import sqlite3 from 'sqlite3';
import {open} from 'sqlite';
import dotenv from 'dotenv';

dotenv.config({ path: './token.env' });

// Инициализация бота с токеном из переменной окружения
const bot = new Bot(process.env.BOT_TOKEN!);

// Инициализация базы данных SQLite
const dbPromise = open({
    filename: 'bot_data.db',
    driver: sqlite3.Database,
});

// Создание таблиц в базе данных при запуске
async function initDatabase() {
    const db = await dbPromise;
    await db.exec(`
        CREATE TABLE IF NOT EXISTS users
        (
            user_id
            INTEGER
            PRIMARY
            KEY,
            name
            TEXT
        );
        CREATE TABLE IF NOT EXISTS promotions
        (
            id
            INTEGER
            PRIMARY
            KEY
            AUTOINCREMENT,
            text
            TEXT
        );
        CREATE TABLE IF NOT EXISTS places
        (
            place
            TEXT
            PRIMARY
            KEY,
            manager_id
            INTEGER
        );
    `);
    await db.exec(`
        CREATE TABLE IF NOT EXISTS user_states
        (
            user_id
            INTEGER
            PRIMARY
            KEY,
            state
            TEXT
            NOT
            NULL,
            data
            TEXT, -- JSON с промежуточными данными
            updated_at
            INTEGER
            DEFAULT (
            strftime
        (
            '%s',
            'now'
        ))
            );
    `);
    await db.exec(`
        CREATE TABLE IF NOT EXISTS bot_settings (
            key TEXT PRIMARY KEY,
            value TEXT
        );
    `);
    // Значение по умолчанию (если ещё не задано админом)
    await db.run(`INSERT OR IGNORE INTO bot_settings (key, value) VALUES (?, ?)`, [
        'welcome_text',
`🌟 Добро пожаловать!

Я — бот кальян-бара Oz.
Чем могу помочь?

Напишите <code>/start</code> или нажмите на кнопку выбора команды (слева от микрофона) 👇`
    ]);
    console.log('База данных инициализирована.');
}

// Установка списка команд, которые будут отображаться в интерфейсе бота
bot.api.setMyCommands([
    {name: 'start', description: 'Запустить бота и показать главное меню'},
    {name: 'controlboard', description: 'Открыть панель администратора'},
]);

// Обработчик команды /start
bot.command('start', async (ctx: Context) => {
    const userId = ctx.user?.user_id;

    const name = ctx.user?.name || 'Unknown';
    console.log(ctx.user)
    if (userId) {
        const db = await dbPromise;
        await db.run(
            'INSERT INTO users (user_id, name) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET name = ?',
            [userId, name, name]
        );
    }

    const welcomeMessage = `
🌟 Добро пожаловать в кальян-бар Oz!

Мы рады видеть вас здесь! 🎉
Наш бот поможет вам:
✅ Забронировать столик
✅ Узнать акции и спецпредложения
✅ Ознакомиться с меню
✅ Найти нас на карте

Ждем вас в гости!
  `;
    await ctx.reply(welcomeMessage, {
        attachments: [mainMenuKeyboard] // или другая структура
    });
});

// Обработчик команды /controlboard
bot.command('controlboard', async (ctx: Context) => {
    const userId = ctx.user?.user_id;
    // Доступ к админ-панели есть только у Админа
    if (userId !== 263267357) return;

    await ctx.reply('Меню администратора:', {attachments: [adminMenuKeyboard]});
});

// --- Клавиатуры ---
const mainMenuKeyboard = {
    type: 'inline_keyboard' as const,
    payload: {
        buttons: [
            [{type: 'callback' as const, text: '🍽️ Забронировать стол', payload: 'menu_reservation'}],
            [
                {type: 'callback' as const, text: '🎁 Акции', payload: 'menu_promo'},
                {type: 'callback' as const, text: '📋 Меню', payload: 'menu_menu'},
            ],
            [
                {type: 'callback' as const, text: '📍 Адреса', payload: 'menu_address'},
                {type: 'callback' as const, text: '💳 Карта лояльности', payload: 'menu_info'},
            ],
            [{type: 'callback' as const, text: '📩 Обратная связь', payload: 'menu_feedback'}],
        ],
    },
};

const adminMenuKeyboard = {
    type: 'inline_keyboard' as const,
    payload: {
        buttons: [
            [{type: 'callback' as const, text: 'Акции (создать)', payload: 'admin_create_promo'}],
            [{type: 'callback' as const, text: 'Акции (удалить)', payload: 'admin_delete_promo'}],
            [{type: 'callback' as const, text: 'Рассылка', payload: 'admin_broadcast'}],
            [{type: 'callback' as const, text: 'Количество пользователей', payload: 'admin_amount_of_users'}],
            [{type: 'callback' as const, text: 'Изменить приветствие', payload: 'admin_edit_welcome'}],
            [{type: 'callback' as const, text: '◀️ Главное меню', payload: 'back_to_main'}]
        ],
    },
};

// Клавиатура для выбора заведения при бронировании
const reservationKeyboard = {
    type: 'inline_keyboard' as const,
    payload: {
        buttons: [
            [{type: 'callback' as const, text: 'Oz Avia', payload: 'reserve_avia'}],
            [{type: 'callback' as const, text: 'Oz Orlova', payload: 'reserve_orlova'}],
            [{type: 'callback' as const, text: 'Oz Dao', payload: 'reserve_dao'}],
            [{type: 'callback' as const, text: '◀️ Главное меню', payload: 'back_to_main'}],
        ],
    },
};

const backToMainMenuKeyboard = {
    type: 'inline_keyboard' as const,
    payload: {
        buttons: [
            [{type: 'callback' as const, text: '◀️ Главное меню', payload: 'back_to_main'}],
        ],
    },
};

// --- Обработка нажатий на inline-кнопки (Callback Queries) ---
bot.on('message_callback', async (ctx: Context) => {
    const payload = ctx.callback?.payload;
    const db = await dbPromise;

    // Вспомогательная функция для редактирования сообщения с новой клавиатурой
    const editWithKeyboard = async (text: string, keyboard: any = []) => {
        await ctx.api.editMessage(ctx.messageId!, {
            text,
            attachments: [keyboard],
        });
    }

    switch (payload) {
        case 'contact:avia':
        case 'contact:orlova':
        case 'contact:dao': {
            const contactMap: Record<string, { name: string; phone: string }> = {
                'contact:avia': { name: 'Менеджер Oz Avia', phone: '+79510952624' },
                'contact:orlova': { name: 'Менеджер Oz Orlova', phone: '+79539861095' },
                'contact:dao': { name: 'Менеджер Oz Dao', phone: '+79510952626' },
            };

            const contact = contactMap[payload];
            if (!contact) break;

            await ctx.reply(`📇 Контакт менеджера:`, {
                attachments: [createContactAttachment(contact.name, contact.phone)]
            });
            break;
        }
        case 'menu_reservation':
            await editWithKeyboard('Выберите заведение:', reservationKeyboard);
            break;
        case 'reserve_avia':
        case 'reserve_orlova':
        case 'reserve_dao': {
            const placeMap: Record<string, string> = {
                reserve_avia: 'Oz Avia',
                reserve_orlova: 'Oz Orlova',
                reserve_dao: 'Oz Dao',
            };
            const place = placeMap[payload!];

            // 1. Сохраняем состояние
            await setState(ctx.user?.user_id!, 'reserve_waiting_name', {place});

            // 2. Редактируем сообщение: убираем кнопки + просим ввести имя
            await editWithKeyboard(`Вы выбрали *${place}*\nВведите ваше имя:`, backToMainMenuKeyboard);

            break;
        }
        case 'back_to_main':
            await clearState(ctx.user?.user_id!);
            await editWithKeyboard('Главное меню. Выберите действие:', mainMenuKeyboard);
            break;
        case 'menu_promo':
            const promos = await db.all('SELECT text FROM promotions');
            let resultMessage = '';
            for (const promo of promos) {
                resultMessage += promo.text + '\n\n';
            }
            await ctx.api.editMessage(ctx.messageId!, {text: resultMessage});

            break;
        case 'menu_menu':
            const menuText = `
📋 **Меню наших заведений:**

▪️ **Oz Avia**
🚩 Авиастроителей, 48
🌐 [Посмотреть меню](https://ozulyanovsk.ru/)

▪️ **Oz Orlova**
🚩 Орлова, 28/58
🌐 [Посмотреть меню](https://oz73.ru/)

▪️ **Oz Dao**
🚩 Гончарова, 15
🌐 [Посмотреть меню](https://ozdao.ru/)
      `;
            await ctx.api.editMessage(ctx.messageId!, {text: menuText, format: 'markdown'});
            break;
        case 'menu_address':
            const addressText = `
▪️ **Oz Avia**
🚩 [Авиастроителей, 48](https://yandex.ru/maps/-/CHuxvC3U)
📞 95-26-24
🕒 Время работы:
Вс - Чт, 12:00-02:00
Пт - Сб, 12:00-04:00

▪️ **Oz Orlova**
🚩 [Орлова, 28/58](https://yandex.ru/maps/-/CHuxvOO6)
📞 92-28-58
🕒 Время работы:
Вс - Чт, 12:00-02:00 
Пт - Сб, 12:00-04:00

▪️ **Oz Dao**
🚩 [Гончарова, 15](https://yandex.ru/maps/-/CHuxvTNo)
📞 95-26-26
🕒 Время работы:
Вс - Чт, 12:00-02:00
Пт - Сб, 12:00-04:00
      `;
            await ctx.api.editMessage(ctx.messageId!, {text: addressText, format: 'markdown'});
            break;
        case 'menu_info':
            const infoText = `
**Оформи электронную бонусную карту 5% и получи**

🎁1000 бонусов в подарок 🎁

[Карта лояльности](https://pbc.su/w0BwkZ)

◾️Оплачивай бонусами до 20% от чека
◾️1 бонус = 1 рублю
      `;
            await ctx.api.editMessage(ctx.messageId!, {text: infoText, format: 'markdown'});
            break;
        case 'menu_feedback':
            const feedbackText = `
📩 <b>Свяжитесь с нами:</b>

▪️ <b>Oz Avia</b>
🚩 Авиастроителей, 48
🗺️ <a href="https://yandex.ru/maps/-/CHuxvC3U">Открыть на карте</a>

▪️ <b>Oz Orlova</b>
🚩 Орлова, 28/58
🗺️ <a href="https://yandex.ru/maps/-/CHuxvOO6">Открыть на карте</a>

▪️ <b>Oz Dao</b>
🚩 Гончарова, 15
🗺️ <a href="https://yandex.ru/maps/-/CHuxvTNo">Открыть на карте</a>

<i>Нажмите на контакт ниже, чтобы сохранить номер менеджера</i>
  `.trim();

            // Клавиатура с кнопкой-контактом
            const feedbackKeyboard = Keyboard.inlineKeyboard([
                [Keyboard.button.callback('📇 Контакт менеджера Avia', 'contact:avia')],
                [Keyboard.button.callback('📇 Контакт менеджера Orlova', 'contact:orlova')],
                [Keyboard.button.callback('📇 Контакт менеджера Dao', 'contact:dao')],
                backToMainMenuKeyboard.payload.buttons[0],
            ]);

            await ctx.api.editMessage(ctx.messageId!, {
                text: feedbackText,
                format: 'html',
                attachments: [feedbackKeyboard]
            });
            break;
        case 'admin_create_promo':
            await editWithKeyboard('Введите текст новой акции:', backToMainMenuKeyboard);
            await setState(ctx.user?.user_id!, 'admin_waiting_promo_text');
            // Пользователь вводит текст => попадаем в обработчик ввода => insert в таблицу
            break;
        case 'admin_delete_promo':
            const promosToDelete = await db.all('SELECT id, text FROM promotions');
            if (promosToDelete.length === 0) {
                await editWithKeyboard('Нет акций для удаления.', adminMenuKeyboard);
                break;
            }

            const deleteButtons = promosToDelete.map(p => ([{
                type: 'callback' as const,
                text: `Удалить: ${p.text.substring(0, 30)}...`,
                payload: `del_${p.id}`
            }]));
            await editWithKeyboard('Выберите акцию для удаления:', {
                type: 'inline_keyboard',
                payload: {
                    buttons: [...deleteButtons, ...backToMainMenuKeyboard.payload.buttons]
                }
            });
            break;
        case 'admin_broadcast':
            const userId = ctx.user?.user_id;
            if (!userId) break;

            // Редактируем сообщение и просим контент
            await ctx.api.editMessage(ctx.messageId!, {
                text: '📢 Создание рассылки.\n\n' +
                    '> **Только текст:** Просто отправьте текст сообщения.\n' +
                    '> **Фото + текст:** Сначала отправьте фото, затем текст-подпись.',
                format: 'markdown',
                attachments: [backToMainMenuKeyboard]
            });

            // Сохраняем состояние: ждём контент для рассылки
            await setState(userId, 'admin_broadcast_waiting', { step: 'waiting_content' });
            break;
        case 'admin_amount_of_users':
            const result = await db.get('SELECT count(*) as total FROM users');
            await ctx.reply(`Количество активных пользователей: **${result.total}**`, {format: 'markdown'});
            break;
        case 'admin_edit_welcome':
            const currentWelcomeText = await db.get('SELECT value FROM bot_settings WHERE key = ?', ['welcome_text']);

            await setState(ctx.user?.user_id!, 'admin_waiting_welcome_text');
            await ctx.api.editMessage(ctx.messageId!, {
                text: 'Отправьте новый текст приветствия.\n\n' +
                    'Поддерживается HTML:\n' +
                    '<b>жирный</b>, <i>курсив</i>, <a href="https://...">ссылки</a>, <code>/start</code>' +
                    'Следующее собщение - текущее приветствие',
            });

            await ctx.reply(currentWelcomeText.value);
            break;
        default:
            if (payload?.startsWith('del_')) {
                const id = parseInt(payload.split('_')[1]);
                await db.run('DELETE FROM promotions WHERE id = ?', id);
                await editWithKeyboard('Акция удалена.', adminMenuKeyboard);
            }
            break;
    }
});

// Обработчик текстовых сообщений (для пошагового ввода)
bot.on('message_created', async (ctx: Context) => {
    // Пропускаем, если это ответ на callback (чтобы не дублировать)
    if (ctx.callback) return;

    const userId = ctx.user?.user_id;
    if (!userId) return;

    const state = await getState(userId);
    if (!state) return; // Нет активного состояния — игнорируем

    const stateData = JSON.parse(state.data);
    const text = ctx.message?.body?.text;
    const attachments = ctx.message?.body?.attachments || [];

    if (!text && !attachments.length) return;

    switch (state.state) {
        case 'reserve_waiting_name':
            await setState(userId, 'reserve_waiting_phone', {...stateData, name: text});
            await ctx.reply('Введите ваш номер телефона:', {
                attachments: [backToMainMenuKeyboard]
            });
            break;

        case 'reserve_waiting_phone':
            await setState(userId, 'reserve_waiting_date', {...stateData, phone: text});
            await ctx.reply('Введите дату бронирования (например, 25.12.2025):', {
                attachments: [backToMainMenuKeyboard]
            });
            break;

        case 'reserve_waiting_date':
            await setState(userId, 'reserve_waiting_time', {...stateData, date: text});
            await ctx.reply('Введите время бронирования (например, 19:00):', {
                attachments: [backToMainMenuKeyboard]
            });
            break;

        case 'reserve_waiting_time':
            await setState(userId, 'reserve_waiting_guests', {...stateData, time: text});
            await ctx.reply('Введите количество гостей:', {
                attachments: [backToMainMenuKeyboard]
            });
            break;

        case 'reserve_waiting_guests':
            const guests = text || '0';
            // @ts-ignore
            const {name, phone, date, time, place} = {...stateData, guests};

            // Отправка менеджеру
            const placeData = await dbPromise.then(db =>
                db.get('SELECT manager_id FROM places WHERE place = ?', [place])
            );

            if (placeData?.manager_id) {
                const userMention = formatUserMention(userId, ctx.user?.name || name);

                // Экранируем все пользовательские данные
                const safeName = escapeHtml(name);
                const safePhone = escapeHtml(phone);
                const safeDate = escapeHtml(date);
                const safeTime = escapeHtml(time);
                const safeGuests = escapeHtml(guests);

                await bot.api.sendMessageToUser(placeData.manager_id,
                    `🔔 Новая бронь:
📍 ${place}
👤 Имя: ${safeName}
📞 Телефон: ${safePhone}
📅 Дата: ${safeDate}
🕒 Время: ${safeTime}
👥 Гостей: ${safeGuests}
👤 Пользователь ID: ${userMention}`, {format: 'html'}
                );
            }

            await clearState(userId);
            await ctx.reply('✅ Ваше бронирование отправлено на подтверждение.\n⏳ Ожидайте ответа администратора.', {
                attachments: [mainMenuKeyboard]
            });
            break;
        case 'admin_waiting_promo_text':
            const promoText = text?.trim();
            const db = await dbPromise;

            // Валидация: не пустой текст
            if (!promoText || promoText.length < 5) {
                await ctx.reply('❌ Текст акции слишком короткий. Введите минимум 5 символов:');
                return; // Остаёмся в том же состоянии
            }

            try {
                // Сохраняем акцию в БД
                await db.run('INSERT INTO promotions (text) VALUES (?)', [promoText]);

                // Очищаем состояние
                await clearState(userId);

                // Показываем подтверждение + возвращаем в админ-меню
                await ctx.reply('✅ Акция успешно создана!', {attachments: [adminMenuKeyboard]});

            } catch (error) {
                console.error('Ошибка при создании акции:', error);
                await ctx.reply('❌ Не удалось сохранить акцию. Попробуйте позже.');
                // Не очищаем состояние — админ сможет повторить попытку
            }
            break;
        case 'admin_broadcast_waiting':
            const broadcastData = JSON.parse(state.data) || {};
            if (broadcastData.step === 'waiting_content') {
                const text = ctx.message?.body?.text?.trim();
                const attachments = ctx.message?.body?.attachments;

                const photo: any = attachments?.find((att: any) => att.type === 'image');

                if (photo) {
                    await setState(userId, 'admin_broadcast_waiting', {
                        step: 'waiting_caption',
                        photoToken: photo.payload.token
                    });
                    await ctx.reply('📝 Теперь введите текст-подпись к фото (или отправьте "-" для рассылки без текста):');
                    return;
                }

                if (text) {
                    // 📝 Получен только текст — сразу запускаем рассылку
                    await clearState(userId);
                    await sendBroadcast(ctx, { text });
                    return;
                }

                // Пустое сообщение — просим повторить
                await ctx.reply('❌ Отправьте текст или фото для рассылки:');
                return;
            }

            // Ждём текст-подпись к фото
            if (broadcastData.step === 'waiting_caption' && broadcastData.photoToken) {
                const caption = ctx.message?.body?.text?.trim();

                // Если админ отправил "-" или пустой текст — рассылаем только фото
                const textToSend = (caption && caption !== '-') ? caption : undefined;

                await clearState(userId);
                await sendBroadcast(ctx, { photoToken: broadcastData.photoToken, text: textToSend });
                return;
            }
        case 'admin_waiting_welcome_text': {
            const newText = text?.trim();
            if (!newText || newText.length < 5) {
                await ctx.reply('❌ Текст слишком короткий. Минимум 5 символов:');
                break;
            }

            try {
                const db = await dbPromise;
                await db.run(
                    'INSERT OR REPLACE INTO bot_settings (key, value) VALUES (?, ?)',
                    ['welcome_text', newText]
                );
                await clearState(userId);
                await ctx.reply('✅ Текст приветствия успешно обновлён!', {
                    attachments: [adminMenuKeyboard]
                });
            } catch (error) {
                console.error('Ошибка сохранения приветствия:', error);
                await ctx.reply('❌ Не удалось сохранить. Попробуйте позже.');
            }
            break;
        }

    }
});

// Обработчик события "пользователь начал диалог с ботом"
bot.on('bot_started', async (ctx: Context) => {
    const db = await dbPromise;
    const row = await db.get('SELECT value FROM bot_settings WHERE key = ?', ['welcome_text']);

    await ctx.reply(row?.value || '🌟 Добро пожаловать в Oz!', {
        format: 'html'
    });
});

// Запуск бота
async function startBot() {
    await initDatabase();
    console.log('Запуск бота...');
    await bot.start();
    console.log('Бот успешно запущен!');
}

// Сохранить состояние
async function setState(userId: number, state: string, data: any = {}) {
    const db = await dbPromise;
    await db.run(
        'INSERT INTO user_states (user_id, state, data) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET state = ?, data = ?, updated_at = strftime("%s", "now")',
        [userId, state, JSON.stringify(data), state, JSON.stringify(data)]
    );
}

// Получить состояние
async function getState(userId: number) {
    const db = await dbPromise;
    return await db.get('SELECT state, data FROM user_states WHERE user_id = ?', [userId]);
}

// Очистить состояние
async function clearState(userId: number) {
    const db = await dbPromise;
    await db.run('DELETE FROM user_states WHERE user_id = ?', [userId]);
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// Формирование упоминания пользователя
function formatUserMention(userId: number, userName: string | undefined): string {
    if (!userName) return `<code>${userId}</code>`;
    // имя должно точно совпадать с профилем в MAX для кликабельности
    const safeName = escapeHtml(userName);
    return `<a href="max://user/${userId}">${safeName}</a>`;
}

//Рассылает сообщение всем пользователям из БД
async function sendBroadcast(ctx: Context, content: { text?: string; photoToken?: string }) {
    const db = await dbPromise;

    // Получаем всех пользователей
    const users = await db.all('SELECT user_id FROM users');
    console.log(`[Broadcast] начинаем рассылку для ${users.length} пользователей`);

    let sentCount = 0;
    let errorCount = 0;

    // Отправляем каждому пользователю
    for (const row of users) {
        const targetUserId = row.user_id;

        try {
            if (content.photoToken) {
                // Отправка фото с подписью
                await bot.api.sendMessageToUser(targetUserId, content.text || '', {
                    attachments: [{
                        type: 'image',
                        payload: {
                            photos: {
                                photo: { token: content.photoToken }
                            }
                        }
                    }],
                    format: content.text ? 'markdown' : null
                });
            } else if (content.text) {
                // 📝 Отправка только текста
                await bot.api.sendMessageToUser(targetUserId, content.text, {
                    format: 'markdown'
                });
            }
            sentCount++;

            await new Promise(resolve => setTimeout(resolve, 50));

        } catch (error) {
            console.error(`[Broadcast] ошибка отправки пользователю ${targetUserId}:`, error);
            errorCount++;
        }
    }

    // Уведомляем админа о результатах
    await ctx.reply(
        `✅ Рассылка завершена!\n` +
        `📤 Отправлено: ${sentCount}\n` +
        `❌ Ошибок: ${errorCount}`,
        { attachments: [adminMenuKeyboard] }
    );

    console.log(`[Broadcast] завершено: отправлено=${sentCount}, ошибок=${errorCount}`);
}

function createContactAttachment(name: string, phone: string) {
    return {
        type: 'contact' as const,
        payload: {
            name: name,
            vcf_info: `BEGIN:VCARD\nVERSION:3.0\nFN:${name}\nTEL:${phone}\nEND:VCARD`
        }
    };
}

startBot().catch(console.error);
