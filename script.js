const tg = window.Telegram.WebApp;

// ВАЖНО: Перед запуском ngrok, вставьте сюда его HTTPS URL
const API_BASE_URL = 'https://bunny-brave-externally.ngrok-free.app';
const API_HEADERS = {
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': 'true'
};

// --- Инициализация приложения ---
document.addEventListener('DOMContentLoaded', () => {
    tg.ready();
    tg.expand();
    const startParam = tg.initDataUnsafe.start_param;

    // Определяем, какую страницу загружать
    if (startParam === 'profile') {
        loadProfileData();
    } else if (startParam === 'register') {
        renderRegistrationForm();
    } else {
        loadReadingsData();
    }
});

// --- Вспомогательные функции ---
function setHeader(title, address = '') {
    document.getElementById('header-title').textContent = title;
    document.getElementById('header-address').textContent = address;
}

function showLoader(text = 'Загрузка...') {
    const container = document.getElementById('meters-container');
    container.innerHTML = `<div class="loader-container"><div class="loader"></div><p>${text}</p></div>`;
    document.getElementById('profile-container').classList.add('hidden');
    tg.MainButton.hide();
}

function handleError(message, containerId = 'meters-container') {
    const container = document.getElementById(containerId);
    container.innerHTML = `<p class="error-message">❌ ${message}</p>`;
    tg.MainButton.hide();
}


// --- ЛОГИКА РЕГИСТРАЦИИ (Шаг 1, 2, 3) ---
function renderRegistrationForm() {
    setHeader('Регистрация', 'Шаг 1: Выберите строение');
    const container = document.getElementById('meters-container');
    container.innerHTML = `
        <div class="form-step" id="step-1">
            <h3>Выберите ваше строение</h3>
            <div class="button-group">
                <button class="btn-building" data-building="8В">Дом 8В</button>
                <button class="btn-building" data-building="8Г">Дом 8Г</button>
                <button class="btn-building" data-building="8Д">Дом 8Д</button>
            </div>
        </div>
        <div class="form-step hidden" id="step-2">
            <h3>Введите номер квартиры</h3>
            <div class="input-group">
                <label for="apartment">Номер квартиры</label>
                <input type="number" id="apartment" placeholder="например, 45" inputmode="numeric">
            </div>
            <div class="button-group">
                <button id="btn-check-address">Проверить адрес</button>
            </div>
        </div>
        <div class="form-step hidden" id="step-3">
            <h3>Подтвердите ваш лицевой счет</h3>
            <div class="input-group">
                <label for="account">Лицевой счет (6 цифр)</label>
                <input type="number" id="account" placeholder="например, 020045" inputmode="numeric">
            </div>
             <div class="input-group">
                <label for="email">Email (необязательно)</label>
                <input type="email" id="email" placeholder="user@example.com" inputmode="email">
            </div>
            <div class="policy-container">
                <p>Нажимая "Зарегистрироваться", вы соглашаетесь с политикой обработки персональных данных.</p>
            </div>
        </div>
    `;
    
    document.querySelectorAll('.btn-building').forEach(btn => {
        btn.addEventListener('click', () => {
            window.building = btn.dataset.building;
            document.getElementById('step-1').classList.add('hidden');
            document.getElementById('step-2').classList.remove('hidden');
            setHeader('Регистрация', `Шаг 2: Дом ${window.building}`);
        });
    });

    document.getElementById('btn-check-address').addEventListener('click', async () => {
        const apartment = document.getElementById('apartment').value;
        if (!apartment) { tg.showAlert('Пожалуйста, введите номер квартиры.'); return; }

        showLoader('Проверка адреса...');
        try {
            const response = await fetch(`${API_BASE_URL}/api/check-address`, {
                method: 'POST', headers: API_HEADERS,
                body: JSON.stringify({ building: window.building, apartment })
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Ошибка проверки адреса.');
            }
            window.apartment = apartment;
            document.getElementById('step-2').classList.add('hidden');
            document.getElementById('step-3').classList.remove('hidden');
            setHeader('Регистрация', `Шаг 3: Завершение`);
            tg.MainButton.setText('Зарегистрироваться').show();
            tg.onEvent('mainButtonClicked', submitRegistration);
        } catch (error) {
            handleError(error.message);
        }
    });
}

async function submitRegistration() {
    const account = document.getElementById('account').value;
    const email = document.getElementById('email').value;

    if (account.length !== 6 || !/^\d+$/.test(account)) {
        tg.showAlert('Лицевой счет должен состоять ровно из 6 цифр.'); return;
    }

    tg.MainButton.showProgress().disable();
    try {
        const response = await fetch(`${API_BASE_URL}/api/register`, {
            method: 'POST', headers: { ...API_HEADERS, 'Authorization': `tma ${tg.initData}` },
            body: JSON.stringify({
                building: window.building,
                apartment: window.apartment,
                account: account,
                email: email || null
            })
        });
         if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || 'Ошибка регистрации на сервере.');
        }
        tg.showAlert('✅ Вы успешно зарегистрированы! Бот отправит вам сообщение в чат.');
        tg.close();
    } catch (error) {
        tg.showAlert(`❌ Ошибка регистрации: ${error.message}`);
    } finally {
        tg.MainButton.hideProgress().enable();
    }
}


// --- ЛОГИКА ПЕРЕДАЧИ ПОКАЗАНИЙ ---
async function loadReadingsData() {
    setHeader('Передача показаний', 'Загрузка...');
    showLoader();
    try {
        const response = await fetch(`${API_BASE_URL}/api/get-meters`, {
            headers: { 'Authorization': `tma ${tg.initData}`, 'ngrok-skip-browser-warning': 'true' }
        });
        if (response.status === 404) {
             handleError('Вы не зарегистрированы. Пожалуйста, запустите команду /start в чате с ботом, чтобы начать регистрацию.');
             return;
        }
        if (!response.ok) throw new Error(`Ошибка сервера: ${response.status}`);
        
        const data = await response.json();
        renderReadingsPage(data);
    } catch (error) {
        handleError(error.message);
    }
}

function renderReadingsPage(data) {
    const metersContainer = document.getElementById('meters-container');
    metersContainer.innerHTML = ''; 

    setHeader('Передача показаний', `ул. Вахова, д. ${data.address.building}, кв. ${data.address.apartment}`);

    if (data.meters.length === 0) {
        metersContainer.innerHTML = '<p>Для вашей квартиры не найдено счетчиков.</p>';
        return;
    }

    data.meters.forEach(meter => {
        const card = document.createElement('div');
        card.className = 'meter-card';
        card.innerHTML = `
            <div class="meter-title">${meter.meter_type === 'ГВС' ? '🔥' : '❄️'} ${meter.meter_type}</div>
            <div class="meter-info">Заводской № ${meter.factory_number}</div>
            <div class="input-group">
                <label for="meter_${meter.id}">Текущие показания (прошлые: ${meter.last_reading.toFixed(3).replace('.', ',')})</label>
                <input type="text" id="meter_${meter.id}" inputmode="decimal" placeholder="12345,123">
                <div class="consumption-info" id="consumption_${meter.id}"></div>
            </div>
        `;
        metersContainer.appendChild(card);

        const input = card.querySelector(`#meter_${meter.id}`);
        input.addEventListener('input', () => {
            const consumptionDiv = card.querySelector(`#consumption_${meter.id}`);
            const currentValue = parseFloat(input.value.replace(',', '.'));
            if (!isNaN(currentValue)) {
                const consumption = currentValue - meter.last_reading;
                consumptionDiv.textContent = `Расход: ${consumption.toFixed(3).replace('.', ',')} м³`;
            } else {
                consumptionDiv.textContent = '';
            }
        });
    });

    tg.MainButton.setText('Отправить показания');
    tg.MainButton.show();
    tg.onEvent('mainButtonClicked', submitReadings);
}

async function submitReadings() {
    const payload = { readings: [] };
    const inputs = document.querySelectorAll('input[type="text"]');
    let hasErrors = false;

    inputs.forEach(input => {
        const meterId = parseInt(input.id.split('_')[1]);
        const valueStr = input.value.replace(',', '.').trim();
        if (valueStr === '') return;
        const value = parseFloat(valueStr);
        if (isNaN(value) || !/^\d{1,5}\.\d{3}$/.test(valueStr)) {
            tg.showAlert(`Неверный формат показаний для счетчика с заводским номером. Пример: 12345,123`);
            hasErrors = true;
            return;
        }
        payload.readings.push({ meter_id: meterId, value: value });
    });

    if (hasErrors || payload.readings.length === 0) {
        if (!hasErrors) tg.showAlert('Вы не ввели ни одного показания.');
        return;
    }

    tg.MainButton.showProgress().disable();
    try {
        const response = await fetch(`${API_BASE_URL}/api/submit-readings`, {
            method: 'POST',
            headers: { 'Authorization': `tma ${tg.initData}`, 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true'},
            body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error('Ошибка при отправке данных на сервер.');
        tg.showAlert('✅ Показания успешно отправлены!');
        tg.close();
    } catch (error) {
        tg.showAlert(`❌ ${error.message}`);
    } finally {
        tg.MainButton.hideProgress().enable();
    }
}


// --- ЛОГИКА ПРОФИЛЯ ---
async function loadProfileData() {
    setHeader('Профиль', 'Загрузка...');
    showLoader();
    try {
        const response = await fetch(`${API_BASE_URL}/api/get-profile`, {
            headers: { 'Authorization': `tma ${tg.initData}`, 'ngrok-skip-browser-warning': 'true' }
        });
        if (response.status === 404) {
             handleError('Вы не зарегистрированы. Пожалуйста, запустите команду /start в чате с ботом, чтобы начать регистрацию.');
             return;
        }
        if (!response.ok) throw new Error(`Ошибка сервера: ${response.status}`);
        const data = await response.json();
        renderProfilePage(data);
    } catch (error) {
        handleError(error.message);
    }
}

function renderProfilePage(data) {
    document.getElementById('meters-container').innerHTML = '';
    const profileContainer = document.getElementById('profile-container');
    profileContainer.classList.remove('hidden');

    setHeader('Профиль', `ул. Вахова, д. ${data.address.building}, кв. ${data.address.apartment}`);

    let profileHTML = `
        <div class="profile-section">
            <p><strong>Логин:</strong> ${data.user.login}</p>
            <p><strong>Email:</strong> ${data.user.email || 'не указан'}</p>
            <p><strong>Лицевой счет:</strong> <code>${data.address.account_number}</code></p>
        </div>
        <div class="history-section"><h3>📜 История показаний</h3>`;
    if (data.meters.length > 0) {
        data.meters.forEach(meter => {
            profileHTML += `<h4>${meter.meter_type === 'ГВС' ? '🔥' : '❄️'} ${meter.meter_type} (№ ${meter.factory_number})</h4>`;
            if (meter.history.length > 0) {
                meter.history.forEach(rec => {
                    profileHTML += `<div class="history-item"><strong>Период: ${rec.period}</strong><br>
                                    Показание: ${rec.curr_reading.toFixed(3).replace('.',',')} (Расход: ${rec.consumption.toFixed(3).replace('.',',')} м³)</div>`;
                });
            } else { profileHTML += `<div class="history-item">Нет истории.</div>`; }
        });
    } else { profileHTML += `<p>Счетчики не найдены.</p>`; }
    profileHTML += `</div>`;
    profileContainer.innerHTML = profileHTML;
    tg.MainButton.hide();
}