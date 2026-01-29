/**
 * ГЛОБАЛЬНЫЙ ОБРАБОТЧИК СОБЫТИЯ 'firebase-ready'
 * Мы оборачиваем весь код в это событие, чтобы script.js не запускался раньше,
 * чем Firebase в файле index.html успеет загрузиться и создать объект window.dbRefs.
 */
window.addEventListener('firebase-ready', function() {
    
    // ПРОВЕРКА: Если по какой-то причине объект не создался, выводим ошибку в консоль
    if (!window.dbRefs) {
        console.error("Критическая ошибка: Инструменты Firebase не найдены в объекте window.");
        return;
    }

    // Извлекаем все необходимые функции из глобального объекта window
    const { ref, set, push, onValue, update } = window.dbRefs;
    const database = window.db;

    // --- МОДУЛЬ ЛОКАЛЬНОГО ХРАНЕНИЯ (SESSION) ---
    // Позволяет приложению помнить, кто вошел в систему, даже после перезагрузки страницы
    const storage = {
        getSession: function() {
            const sessionData = localStorage.getItem('messenger_user_session');
            return sessionData ? JSON.parse(sessionData) : null;
        },
        setSession: function(userData) {
            localStorage.setItem('messenger_user_session', JSON.stringify(userData));
        },
        clearSession: function() {
            localStorage.removeItem('messenger_user_session');
        }
    };

    // Глобальные переменные текущего состояния
    let currentUser = storage.getSession();
    let activeRecipient = null;
    const STICKERS_LIST = ['🔥', '😂', '❤️', '👍', '🚀', '💀', '🤡', '🍕', '🌈', '💎', '🦾', '🍦'];

    // --- МОДУЛЬ АВТОРИЗАЦИИ И РЕГИСТРАЦИИ ---
    const auth = {
        /**
         * handleAuth: Обрабатывает нажатие кнопки "Войти/Создать"
         * Проверяет наличие пользователя в Firebase Realtime Database
         */
        handleAuth: function() {
            const usernameField = document.getElementById('username-input');
            const passwordField = document.getElementById('password-input');
            const avatarPreview = document.getElementById('preview-avatar');

            const name = usernameField.value.trim();
            const pass = passwordField.value.trim();

            if (name === "" || pass === "") {
                alert("Пожалуйста, заполните логин и пароль!");
                return;
            }

            // Создаем ссылку на путь пользователя в базе данных
            const userRef = ref(database, 'users/' + name);

            // Один раз запрашиваем данные по этому пути
            onValue(userRef, (snapshot) => {
                const userData = snapshot.val();

                if (userData) {
                    // Если пользователь существует — проверяем пароль
                    if (userData.password === pass) {
                        this.executeLogin(name, userData.avatar);
                    } else {
                        alert("Пароль введен неверно. Попробуйте снова.");
                    }
                } else {
                    // Если пользователя нет — регистрируем его (создаем запись в облаке)
                    set(userRef, {
                        password: pass,
                        avatar: avatarPreview.src
                    }).then(() => {
                        this.executeLogin(name, avatarPreview.src);
                    }).catch((error) => {
                        console.error("Ошибка при регистрации:", error);
                    });
                }
            }, { onlyOnce: true });
        },

        executeLogin: function(name, avatar) {
            const userObject = { name: name, avatar: avatar };
            storage.setSession(userObject);
            currentUser = userObject;
            // Перезагружаем страницу, чтобы инициализировать интерфейс чата
            location.reload();
        },

        logout: function() {
            storage.clearSession();
            location.reload();
        }
    };

    // --- МОДУЛЬ ЧАТА И СООБЩЕНИЙ ---
    const chat = {
        /**
         * open: Активирует окно чата с выбранным пользователем
         */
        open: function(targetName) {
            activeRecipient = targetName;
            
            // Скрываем приветствие и показываем активный чат
            document.getElementById('welcome-msg').classList.add('hidden');
            document.getElementById('chat-active').classList.remove('hidden');
            
            // Устанавливаем имя и аватар собеседника в шапке чата
            document.getElementById('chat-with-name').innerText = targetName;
            
            // Загружаем актуальный аватар собеседника из базы
            onValue(ref(database, 'users/' + targetName), (snap) => {
                const data = snap.val();
                if (data && data.avatar) {
                    document.getElementById('chat-with-avatar').src = data.avatar;
                }
            }, { onlyOnce: true });

            // Запускаем прослушивание сообщений именно для этой пары людей
            this.startMessageListener();
        },

        /**
         * startMessageListener: Слушает изменения в облаке и мгновенно обновляет экран
         */
        startMessageListener: function() {
            // Генерируем уникальный ID чата (сортируем имена, чтобы ID был одинаков для обоих)
            const chatId = [currentUser.name, activeRecipient].sort().join('_id_');
            const messagesRef = ref(database, 'messages/' + chatId);

            // Эта функция будет срабатывать КАЖДЫЙ РАЗ, когда кто-то пишет сообщение
            onValue(messagesRef, (snapshot) => {
                const messagesDisplay = document.getElementById('messages-display');
                messagesDisplay.innerHTML = ''; // Очищаем экран перед перерисовкой
                
                const allMessages = snapshot.val();
                
                if (allMessages) {
                    // Превращаем объект сообщений в массив и проходим по каждому
                    Object.values(allMessages).forEach(message => {
                        const messageElement = document.createElement('div');
                        const isOutgoing = message.sender === currentUser.name;
                        
                        // Определяем стиль сообщения (свое или чужое)
                        messageElement.className = isOutgoing ? 'msg sent' : 'msg received';
                        
                        // Если это стикер — убираем фон и увеличиваем размер
                        if (message.isSticker) {
                            messageElement.style.background = 'none';
                            messageElement.style.fontSize = '50px';
                        }
                        
                        messageElement.innerHTML = `
                            <div class="msg-text">${message.text}</div>
                            <div class="msg-time" style="font-size: 10px; opacity: 0.5; margin-top: 5px;">${message.time}</div>
                        `;
                        
                        messagesDisplay.appendChild(messageElement);
                    });
                    
                    // Автоматически прокручиваем чат в самый низ
                    messagesDisplay.scrollTop = messagesDisplay.scrollHeight;
                }
            });
        },

        /**
         * send: Отправляет текстовое сообщение или стикер в Firebase
         */
        send: function(stickerContent = null) {
            const inputField = document.getElementById('msg-input');
            const messageBody = stickerContent || inputField.value.trim();

            if (messageBody === "" || !activeRecipient) {
                return;
            }

            const chatId = [currentUser.name, activeRecipient].sort().join('_id_');
            const chatPath = ref(database, 'messages/' + chatId);
            
            // Создаем новый уникальный ключ для сообщения в облаке
            const newMessageRef = push(chatPath);

            set(newMessageRef, {
                sender: currentUser.name,
                text: messageBody,
                isSticker: !!stickerContent,
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            }).then(() => {
                // Очищаем ввод и закрываем панель стикеров
                inputField.value = '';
                if (stickerContent) {
                    ui.toggleStickers();
                }
            });
        }
    };

    // --- МОДУЛЬ ИНТЕРФЕЙСА (UI) ---
    const ui = {
        init: function() {
            // Если пользователь не авторизован — ничего не делаем, он видит экран входа
            if (!currentUser) {
                return;
            }

            // Переключаем видимость экранов
            document.getElementById('auth-screen').classList.add('hidden');
            document.getElementById('app-container').classList.remove('hidden');

            // Отображаем данные профиля текущего пользователя
            document.getElementById('my-name-display').innerText = currentUser.name;
            document.getElementById('my-avatar-img').src = currentUser.avatar;

            // Генерируем список стикеров в панели
            const stickerPicker = document.getElementById('sticker-picker');
            stickerPicker.innerHTML = ''; // Чистим на всякий случай
            
            STICKERS_LIST.forEach(emoji => {
                const stickerSpan = document.createElement('span');
                stickerSpan.className = 'sticker';
                stickerSpan.innerText = emoji;
                stickerSpan.style.cursor = 'pointer';
                stickerSpan.style.fontSize = '24px';
                // При клике на стикер — отправляем его
                stickerSpan.onclick = function() {
                    chat.send(emoji);
                };
                stickerPicker.appendChild(stickerSpan);
            });

            // Навешиваем событие на клавишу Enter в поле ввода
            document.getElementById('msg-input').onkeypress = function(event) {
                if (event.key === 'Enter') {
                    chat.send();
                }
            };
        },

        toggleStickers: function() {
            const panel = document.getElementById('sticker-picker');
            panel.classList.toggle('hidden');
        }
    };

    // --- ОБРАБОТЧИКИ СОБЫТИЙ ДЛЯ ПОИСКА И АВАТАРОВ ---

    // Поиск пользователей в реальном времени
    document.getElementById('user-search').oninput = function(event) {
        const query = event.target.value.trim();
        const contactsContainer = document.getElementById('contacts-list');
        contactsContainer.innerHTML = '';

        if (query !== "" && query !== currentUser.name) {
            const contactItem = document.createElement('div');
            contactItem.className = 'contact-item';
            contactItem.style.padding = '15px';
            contactItem.style.cursor = 'pointer';
            contactItem.style.borderBottom = '1px solid #222d34';
            contactItem.innerHTML = `<strong>${query}</strong><br><small style="color: gray;">Начать чат</small>`;
            
            contactItem.onclick = function() {
                chat.open(query);
            };
            
            contactsContainer.appendChild(contactItem);
        }
    };

    // Загрузка и превью аватара при регистрации
    const avatarInput = document.getElementById('avatar-input');
    if (avatarInput) {
        avatarInput.onchange = function(event) {
            const file = event.target.files[0];
            if (file) {
                const fileReader = new FileReader();
                fileReader.onload = function(e) {
                    document.getElementById('preview-avatar').src = e.target.result;
                };
                fileReader.readAsDataURL(file);
            }
        };
    }

    // --- ФИНАЛЬНЫЙ ЗАПУСК ---
    ui.init();

    // Привязываем модули к глобальному окну, чтобы HTML-атрибуты (onclick) могли их вызвать
    window.auth = auth;
    window.chat = chat;
    window.ui = ui;

    console.log("Приложение Messenger успешно инициализировано и готово к работе.");
});