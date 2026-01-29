/**
 * ВЕСЬ КОД ОБОРАЧИВАЕМ В ОЖИДАНИЕ FIREBASE
 * Это предотвращает ошибку "window.dbRefs is undefined"
 */
window.addEventListener('firebase-ready', () => {
    
    // 1. Извлекаем инструменты Firebase из глобального окна
    const { ref, set, push, onValue, update } = window.dbRefs;
    const database = window.db;

    // 2. Управление сессией (кто залогинен в этом браузере)
    const storage = {
        getSession: () => JSON.parse(localStorage.getItem('m_session')),
        setSession: (user) => localStorage.setItem('m_session', JSON.stringify(user)),
        clearSession: () => localStorage.removeItem('m_session')
    };

    let currentUser = storage.getSession();
    let activeRecipient = null;
    const STICKERS = ['🔥', '😂', '❤️', '👍', '🚀', '💀', '🤡', '🍕', '🌈', '💎'];

    // 3. ЛОГИКА АВТОРИЗАЦИИ
    const auth = {
        handleAuth() {
            const nameInput = document.getElementById('username-input');
            const passInput = document.getElementById('password-input');
            const avatarImg = document.getElementById('preview-avatar');

            const name = nameInput.value.trim();
            const pass = passInput.value.trim();

            if (!name || !pass) {
                alert("Введите логин и пароль!");
                return;
            }

            // Ищем пользователя в облаке
            const userRef = ref(database, 'users/' + name);
            onValue(userRef, (snapshot) => {
                const data = snapshot.val();
                if (data) {
                    if (data.password === pass) {
                        this.completeLogin(name, data.avatar);
                    } else {
                        alert("Неверный пароль!");
                    }
                } else {
                    // Создаем нового пользователя, если его нет
                    set(userRef, { password: pass, avatar: avatarImg.src })
                        .then(() => this.completeLogin(name, avatarImg.src));
                }
            }, { onlyOnce: true });
        },

        completeLogin(name, avatar) {
            const userObj = { name, avatar };
            storage.setSession(userObj);
            currentUser = userObj;
            location.reload();
        },

        logout() {
            storage.clearSession();
            location.reload();
        }
    };

    // 4. ЛОГИКА ЧАТА И СООБЩЕНИЙ
    const chat = {
        open(name) {
            activeRecipient = name;
            
            // Переключение экранов интерфейса
            document.getElementById('welcome-msg').classList.add('hidden');
            document.getElementById('chat-active').classList.remove('hidden');
            document.getElementById('chat-with-name').innerText = name;
            
            // Загружаем аватар собеседника
            onValue(ref(database, 'users/' + name), (snap) => {
                const val = snap.val();
                if (val) document.getElementById('chat-with-avatar').src = val.avatar;
            }, { onlyOnce: true });

            this.listenMessages();
        },

        // СЛУШАЕМ ОБЛАКО В РЕАЛЬНОМ ВРЕМЕНИ
        listenMessages() {
            const chatId = [currentUser.name, activeRecipient].sort().join('_vs_');
            const chatRef = ref(database, 'messages/' + chatId);

            onValue(chatRef, (snapshot) => {
                const container = document.getElementById('messages-display');
                container.innerHTML = '';
                
                const data = snapshot.val();
                if (data) {
                    Object.values(data).forEach(m => {
                        const div = document.createElement('div');
                        const isMy = m.sender === currentUser.name;
                        
                        div.className = `msg ${isMy ? 'sent' : 'received'}`;
                        if (m.isSticker) {
                            div.style.background = 'none';
                            div.style.fontSize = '45px';
                        }
                        
                        div.innerHTML = `
                            <div>${m.text}</div>
                            <small style="font-size:10px; opacity:0.5; display:block; margin-top:5px;">${m.time}</small>
                        `;
                        container.appendChild(div);
                    });
                    container.scrollTop = container.scrollHeight;
                }
            });
        },

        send(sticker = null) {
            const input = document.getElementById('msg-input');
            const text = sticker || input.value.trim();

            if (!text || !activeRecipient) return;

            const chatId = [currentUser.name, activeRecipient].sort().join('_vs_');
            const chatRef = ref(database, 'messages/' + chatId);
            const newMessageRef = push(chatRef);

            set(newMessageRef, {
                sender: currentUser.name,
                text: text,
                isSticker: !!sticker,
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });

            input.value = '';
            if (sticker) ui.toggleStickers();
        }
    };

    // 5. ИНТЕРФЕЙС И КНОПКИ
    const ui = {
        init() {
            if (!currentUser) return;

            document.getElementById('auth-screen').classList.add('hidden');
            document.getElementById('app-container').classList.remove('hidden');

            document.getElementById('my-name-display').innerText = currentUser.name;
            document.getElementById('my-avatar-img').src = currentUser.avatar;

            // Настройка стикеров
            const picker = document.getElementById('sticker-picker');
            picker.innerHTML = ''; // Очистка на всякий случай
            STICKERS.forEach(s => {
                const span = document.createElement('span');
                span.className = 'sticker';
                span.innerText = s;
                span.style.cursor = 'pointer';
                span.onclick = () => chat.send(s);
                picker.appendChild(span);
            });

            // Слушатель Enter
            document.getElementById('msg-input').onkeypress = (e) => {
                if (e.key === 'Enter') chat.send();
            };
        },
        toggleStickers() {
            document.getElementById('sticker-picker').classList.toggle('hidden');
        }
    };

    // --- ПОИСК ---
    document.getElementById('user-search').oninput = (e) => {
        const q = e.target.value.trim();
        const list = document.getElementById('contacts-list');
        list.innerHTML = '';

        if (q && q !== currentUser.name) {
            const item = document.createElement('div');
            item.className = 'contact-item';
            item.style.padding = '15px';
            item.style.cursor = 'pointer';
            item.innerHTML = `<strong>${q}</strong> <br> <small style="color:gray">Открыть чат</small>`;
            item.onclick = () => chat.open(q);
            list.appendChild(item);
        }
    };

    // --- ОБРАБОТКА ФОТО ---
    const avatarInput = document.getElementById('avatar-input');
    if (avatarInput) {
        avatarInput.onchange = (e) => {
            const reader = new FileReader();
            reader.onload = (ev) => document.getElementById('preview-avatar').src = ev.target.result;
            reader.readAsDataURL(e.target.files[0]);
        };
    }

    // Запускаем всё!
    ui.init();
    
    // Делаем объекты глобальными для кнопок в HTML (onclick)
    window.auth = auth;
    window.chat = chat;
    window.ui = ui;
});