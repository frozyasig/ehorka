// === ПОДКЛЮЧЕНИЕ К FIREBASE ===
// Эти переменные прилетают из блока <script type="module"> в index.html
const { ref, set, push, onValue } = window.dbRefs;
const database = window.db;

// === ХРАНИЛИЩЕ СЕССИИ (Чтобы не вылетало при обновлении) ===
const storage = {
    getSession: () => JSON.parse(localStorage.getItem('m_session')),
    setSession: (user) => localStorage.setItem('m_session', JSON.stringify(user)),
    clearSession: () => localStorage.removeItem('m_session')
};

let currentUser = storage.getSession();
let activeRecipient = null;
const STICKERS = ['🔥', '😂', '❤️', '👍', '🚀', '💀', '🤡', '🍕', '🌈', '💎'];

// === СИСТЕМА ВХОДА ===
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

        // Запрашиваем данные пользователя из облака
        const userRef = ref(database, 'users/' + name);
        onValue(userRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                // Если юзер есть — сверяем пароль
                if (data.password === pass) {
                    this.completeLogin(name, data.avatar);
                } else {
                    alert("Неверный пароль!");
                }
            } else {
                // Если юзера нет — создаем в Firebase
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

// === СИСТЕМА ЧАТА ===
const chat = {
    open(name) {
        activeRecipient = name;
        
        // Переключаем экраны
        document.getElementById('welcome-msg').classList.add('hidden');
        document.getElementById('chat-active').classList.remove('hidden');
        
        // Ставим имя собеседника
        document.getElementById('chat-with-name').innerText = name;
        
        // Получаем аватар собеседника из базы
        onValue(ref(database, 'users/' + name), (snap) => {
            const val = snap.val();
            if (val) document.getElementById('chat-with-avatar').src = val.avatar;
        }, { onlyOnce: true });

        // Начинаем слушать сообщения
        this.listenMessages();
    },

    listenMessages() {
        // Создаем уникальный ID чата для двух людей (всегда одинаковый)
        const chatId = [currentUser.name, activeRecipient].sort().join('_vs_');
        const chatRef = ref(database, 'messages/' + chatId);

        // Firebase сам вызовет эту функцию, если кто-то (ты или друг) напишет сообщение
        onValue(chatRef, (snapshot) => {
            const container = document.getElementById('messages-display');
            container.innerHTML = ''; // Очищаем перед рендером
            
            const data = snapshot.val();
            if (data) {
                // Проходим по всем сообщениям в объекте
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
                // Скролл вниз к последнему сообщению
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
        
        // Генерируем новый ключ для сообщения
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

// === ИНТЕРФЕЙС ===
const ui = {
    init() {
        if (!currentUser) return;

        // Показываем мессенджер
        document.getElementById('auth-screen').classList.add('hidden');
        document.getElementById('app-container').classList.remove('hidden');

        // Данные своего профиля
        document.getElementById('my-name-display').innerText = currentUser.name;
        document.getElementById('my-avatar-img').src = currentUser.avatar;

        // Заполняем стикеры
        const picker = document.getElementById('sticker-picker');
        STICKERS.forEach(s => {
            const span = document.createElement('span');
            span.className = 'sticker';
            span.innerText = s;
            span.style.cursor = 'pointer';
            span.onclick = () => chat.send(s);
            picker.appendChild(span);
        });

        // Отправка на Enter
        document.getElementById('msg-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') chat.send();
        });
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
        item.style.borderBottom = '1px solid #222d34';
        item.innerHTML = `<strong>${q}</strong> <br> <small style="color:gray">Нажмите, чтобы открыть чат</small>`;
        item.onclick = () => chat.open(q);
        list.appendChild(item);
    }
};

// --- ОБРАБОТКА АВАТАРА ---
document.getElementById('avatar-input').onchange = (e) => {
    const reader = new FileReader();
    reader.onload = (ev) => document.getElementById('preview-avatar').src = ev.target.result;
    reader.readAsDataURL(e.target.files[0]);
};

// ЗАПУСК
ui.init();