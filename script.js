// === МОДУЛЬ ХРАНЕНИЯ ДАННЫХ (STORAGE) ===
const Storage = {
    // Получение всех пользователей
    getUsers: () => JSON.parse(localStorage.getItem('messenger_users')) || {},
    
    // Регистрация нового или обновление старого
    saveUser: (username, userData) => {
        const users = Storage.getUsers();
        users[username] = userData;
        localStorage.setItem('messenger_users', JSON.stringify(users));
    },
    
    // История сообщений
    getMessages: () => JSON.parse(localStorage.getItem('messenger_history')) || {},
    saveMessages: (history) => localStorage.setItem('messenger_history', JSON.stringify(history)),
    
    // Текущий вход
    getSession: () => JSON.parse(localStorage.getItem('messenger_session')),
    setSession: (user) => localStorage.setItem('messenger_session', JSON.stringify(user)),
    clearSession: () => localStorage.removeItem('messenger_session')
};

// === ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ===
let currentUser = Storage.getSession();
let activeChatPartner = null;
let videoStream = null;
const EMOJIS = ['🔥', '😂', '❤️', '👍', '🚀', '💀', '🤡', '🍕', '🦾', '🌈', '💎', '🍦'];

// === МОДУЛЬ АВТОРИЗАЦИИ (AUTH) ===
const auth = {
    handleAuth() {
        const name = document.getElementById('username-input').value.trim();
        const pass = document.getElementById('password-input').value.trim();
        const avatar = document.getElementById('preview-avatar').src;

        if (!name || !pass) {
            alert("Пожалуйста, заполните все поля!");
            return;
        }

        const users = Storage.getUsers();

        if (users[name]) {
            // Если пользователь найден — проверяем пароль
            if (users[name].password === pass) {
                this.completeAuth(name, users[name].avatar);
            } else {
                alert("Неверный пароль!");
            }
        } else {
            // Если не найден — создаем новый аккаунт
            Storage.saveUser(name, { password: pass, avatar: avatar });
            this.completeAuth(name, avatar);
            alert("Аккаунт создан успешно!");
        }
    },

    completeAuth(name, avatar) {
        const userObj = { name, avatar };
        Storage.setSession(userObj);
        currentUser = userObj;
        location.reload(); // Перезапуск для инициализации UI
    },

    logout() {
        Storage.clearSession();
        location.reload();
    },

    updateProfile() {
        const newName = document.getElementById('edit-username-input').value.trim();
        const newAvatar = document.getElementById('edit-preview-avatar').src;
        
        if (!newName) return;

        let users = Storage.getUsers();
        const password = users[currentUser.name].password;

        // Удаляем старый ключ и создаем новый
        delete users[currentUser.name];
        users[newName] = { password, avatar: newAvatar };
        
        localStorage.setItem('messenger_users', JSON.stringify(users));
        this.completeAuth(newName, newAvatar);
    }
};

// === МОДУЛЬ ЧАТА (CHAT) ===
const chat = {
    openChat(partnerName) {
        activeChatPartner = partnerName;
        const users = Storage.getUsers();

        document.getElementById('empty-chat-view').classList.add('hidden');
        document.getElementById('active-chat-view').classList.remove('hidden');
        
        document.getElementById('active-chat-name').innerText = partnerName;
        document.getElementById('active-chat-avatar').src = users[partnerName] ? users[partnerName].avatar : 'https://via.placeholder.com/40';

        this.renderMessages();
    },

    sendMessage(emoji = null) {
        const input = document.getElementById('msg-input');
        const text = emoji || input.value.trim();

        if (!text || !activeChatPartner) return;

        let history = Storage.getMessages();
        const chatId = this.getChatId(currentUser.name, activeChatPartner);

        if (!history[chatId]) history[chatId] = [];

        history[chatId].push({
            sender: currentUser.name,
            content: text,
            isEmoji: !!emoji,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });

        Storage.saveMessages(history);
        input.value = '';
        if (emoji) ui.toggleEmojiPanel();
        this.renderMessages();
    },

    getChatId(u1, u2) {
        return [u1, u2].sort().join('_chat_with_');
    },

    renderMessages() {
        const container = document.getElementById('messages-list');
        container.innerHTML = '';

        const history = Storage.getMessages();
        const chatId = this.getChatId(currentUser.name, activeChatPartner);
        const messages = history[chatId] || [];

        messages.forEach(m => {
            const div = document.createElement('div');
            const side = m.sender === currentUser.name ? 'sent' : 'received';
            const style = m.isEmoji ? 'font-size: 40px; background: none;' : '';
            
            div.className = `msg ${side}`;
            div.style = style;
            div.innerHTML = `
                <div>${m.content}</div>
                <div style="font-size: 10px; opacity: 0.6; text-align: right; margin-top: 5px;">${m.time}</div>
            `;
            container.appendChild(div);
        });

        container.scrollTop = container.scrollHeight;
    }
};

// === МОДУЛЬ ЗВОНКОВ (CALLS) ===
const calls = {
    async initiateCall() {
        if (!activeChatPartner) return;

        const modal = document.getElementById('call-modal');
        const ringtone = document.getElementById('ringtone');
        const status = document.getElementById('call-status');
        
        document.getElementById('call-name').innerText = activeChatPartner;
        const users = Storage.getUsers();
        document.getElementById('call-avatar').src = users[activeChatPartner]?.avatar || '';

        modal.classList.remove('hidden');
        ringtone.play();

        try {
            // Работа с камерой
            videoStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            document.getElementById('local-video').srcObject = videoStream;
            status.innerText = "Ожидание ответа...";
        } catch (e) {
            status.innerText = "Ошибка: камера не найдена";
            console.error(e);
        }

        // Симуляция соединения
        setTimeout(() => {
            if (!modal.classList.contains('hidden')) {
                ringtone.pause();
                ringtone.currentTime = 0;
                status.innerText = "В разговоре...";
            }
        }, 3500);
    },

    endCall() {
        const modal = document.getElementById('call-modal');
        const ringtone = document.getElementById('ringtone');

        if (videoStream) {
            videoStream.getTracks().forEach(track => track.stop());
            document.getElementById('local-video').srcObject = null;
        }

        ringtone.pause();
        ringtone.currentTime = 0;
        modal.classList.add('hidden');
    }
};

// === МОДУЛЬ ИНТЕРФЕЙСА (UI) ===
const ui = {
    init() {
        if (!currentUser) return;

        document.getElementById('auth-screen').classList.add('hidden');
        document.getElementById('app-container').classList.remove('hidden');

        document.getElementById('my-name-display').innerText = currentUser.name;
        document.getElementById('my-avatar-img').src = currentUser.avatar;

        // Наполнение панели эмодзи
        const panel = document.getElementById('emoji-panel');
        EMOJIS.forEach(e => {
            const span = document.createElement('span');
            span.className = 'emoji-item';
            span.innerText = e;
            span.onclick = () => chat.sendMessage(e);
            panel.appendChild(span);
        });

        // Слушатель Enter
        document.getElementById('msg-input').onkeypress = (e) => {
            if (e.key === 'Enter') chat.sendMessage();
        };
    },

    toggleSettings(show) {
        const modal = document.getElementById('settings-modal');
        if (show) {
            modal.classList.remove('hidden');
            document.getElementById('edit-username-input').value = currentUser.name;
            document.getElementById('edit-preview-avatar').src = currentUser.avatar;
        } else {
            modal.classList.add('hidden');
        }
    },

    toggleEmojiPanel() {
        document.getElementById('emoji-panel').classList.toggle('hidden');
    }
};

// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---

// Поиск пользователей
document.getElementById('user-search').oninput = (e) => {
    const query = e.target.value.trim();
    const list = document.getElementById('contacts-list');
    list.innerHTML = '';

    if (query) {
        const allUsers = Storage.getUsers();
        // Берем фото из базы или дефолтное
        const pic = allUsers[query] ? allUsers[query].avatar : 'https://cdn-icons-png.flaticon.com/512/149/149071.png';

        const div = document.createElement('div');
        div.className = 'contact-item';
        div.innerHTML = `
            <img src="${pic}">
            <div>
                <strong>${query}</strong><br>
                <small>${allUsers[query] ? 'Пользователь системы' : 'Нажмите, чтобы написать'}</small>
            </div>
        `;
        div.onclick = () => chat.openChat(query);
        list.appendChild(div);
    }
};

// Загрузка фото через FileReader
function setupAvatarLogic(inputId, previewId) {
    document.getElementById(inputId).onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => document.getElementById(previewId).src = event.target.result;
            reader.readAsDataURL(file);
        }
    };
}
setupAvatarLogic('avatar-input', 'preview-avatar');
setupAvatarLogic('edit-avatar-input', 'edit-preview-avatar');

// СТАРТ
ui.init();