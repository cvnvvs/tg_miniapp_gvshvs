// ВАЖНО: Перед запуском ngrok, вставьте сюда его АКТУАЛЬНЫЙ HTTPS URL
const API_BASE_URL = 'https://bunny-brave-externally.ngrok-free.app'; 

const tg = window.Telegram.WebApp;

// --- Централизованная функция для выполнения запросов к API ---
async function apiFetch(endpoint, options = {}) {
    const isPrivate = options.private !== false; // Все эндпоинты приватные по умолчанию
    const headers = { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true'};

    if (isPrivate) {
        // Для приватных эндпоинтов добавляем заголовок авторизации
        if (!tg.initData) throw new Error("Не удалось получить данные для авторизации (initData).");
        headers['Authorization'] = `tma ${tg.initData}`;
    }

    const config = { ...options, headers: { ...headers, ...options.headers } };
    const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
    
    if (response.ok) {
        return response.status === 204 ? null : response.json();
    } else {
        try {
            const errorData = await response.json();
            throw new Error(errorData.detail || 'Произошла неизвестная ошибка сервера.');
        } catch (e) {
            throw new Error(`Ошибка сети или сервера: ${response.status} ${response.statusText}`);
        }
    }
}

// --- Маршрутизация и запуск ---
document.addEventListener('DOMContentLoaded', () => {
    tg.ready();
    tg.expand();
    tg.MainButton.hide();
    const startParam = tg.initDataUnsafe.start_param || '';
    
    document.body.style.visibility = 'visible'; // Показываем контент после настройки
    
    if (startParam === 'register') {
        loadRegistrationPage();
    } else {
        // Проверяем, зарегистрирован ли пользователь
        apiFetch('/api/get-meters').then(data => {
            renderReadingsPage(data);
        }).catch(error => {
            if (error.message.includes('403')) {
                // Если 403, значит пользователь не зарегистрирован или неактивен
                routeToRegistration();
            } else {
                handleError(error.message);
            }
        });
    }
});

function routeToRegistration() {
    hideLoader();
    setHeader('Необходимо зарегистрироваться', 'Это нужно сделать только один раз');
    const container = document.getElementById('error-container');
    container.classList.add('active');
    container.innerHTML = `<div class="form-step"><p>Ваша регистрация не найдена или неактивна. Пожалуйста, пройдите регистрацию.</p><div class="button-grid">
    <button class="grid-button" onclick="loadRegistrationPage()">Начать регистрацию</button></div></div>`;
}

// --- Регистрация ---
let regData = {};
function loadRegistrationPage() {
    hideLoader();
    setHeader('Регистрация', 'Шаг 1 из 4');
    
    // --- ИСПРАВЛЕНИЕ ---
    // Сначала очищаем контейнер ошибок, где была кнопка
    const errorContainer = document.getElementById('error-container');
    errorContainer.classList.remove('active');
    errorContainer.innerHTML = '';
    // --- КОНЕЦ ИСПРАВЛЕНИЯ ---

    const container = document.getElementById('register-container');
    container.classList.add('active');
    container.innerHTML = `<div class="form-step"><p>Выберите ваше строение:</p><div class="button-grid">
        <button class="grid-button" onclick="selectBuilding('8В')">8В</button>
        <button class="grid-button" onclick="selectBuilding('8Г')">8Г</button>
        <button class="grid-button" onclick="selectBuilding('8Д')">8Д</button></div></div>`;
    tg.MainButton.hide();
}

function selectBuilding(building) {
    regData.building = building;
    setHeader('Регистрация', `Шаг 2 из 4: Строение ${building}`);
    const cont = document.getElementById('register-container');
    cont.innerHTML = `<div class="form-step"><p>Теперь введите номер квартиры:</p><input type="number" id="apartment-input" placeholder="Например: 45" inputmode="numeric"></div>`;
    tg.MainButton.setText('Далее').show().onClick(submitApartment);
}

async function submitApartment() {
    const apartment = document.getElementById('apartment-input').value;
    if (!apartment || !/^\d+$/.test(apartment)) { tg.showAlert('Введите корректный номер квартиры.'); return; }
    regData.apartment = apartment;
    tg.MainButton.showProgress().disable();
    try {
        await apiFetch('/api/check-address', { 
            method: 'POST', 
            body: JSON.stringify(regData),
            private: false // Это публичный эндпоинт
        });
        renderAccountStep();
    } catch (error) { tg.showAlert(error.message);
    } finally { tg.MainButton.hideProgress().enable(); }
}

function renderAccountStep() {
    setHeader('Регистрация', 'Шаг 3 из 4: Верификация');
    const cont = document.getElementById('register-container');
    cont.innerHTML = `<div class="form-step"><p>Адрес найден! Введите ваш <b>6-значный лицевой счет</b>.</p><input type="number" id="account-input" placeholder="000000" maxlength="6" inputmode="numeric"></div>`;
    tg.MainButton.offClick(submitApartment).onClick(submitAccount);
}

function submitAccount() {
    const account = document.getElementById('account-input').value;
    if (!account || !/^\d{6}$/.test(account)) { tg.showAlert('Лицевой счет должен состоять из 6 цифр.'); return; }
    regData.account = account;
    renderEmailStep();
}

function renderEmailStep() {
    setHeader('Регистрация', 'Шаг 4 из 4: Контакты');
    const cont = document.getElementById('register-container');
    
    // Используем HTML для создания псевдо-кнопки
    cont.innerHTML = `<div class="form-step">
        <p>Email (необязательно):</p>
        <input type="email" id="email-input" placeholder="user@example.com" inputmode="email">
        <div class="button-grid" style="margin-top: 20px; grid-template-columns: 1fr;">
            <button class="grid-button" onclick="handleEmailSubmission(true)">Пропустить этот шаг</button>
        </div>
    </div>`;
    
    // Главная кнопка теперь для подтверждения email
    tg.MainButton.setText('Подтвердить Email и далее').offClick(submitAccount).onClick(() => handleEmailSubmission(false));
    tg.MainButton.show();
}

// Новая функция для обработки шага с email
function handleEmailSubmission(isSkipped) {
    const emailInput = document.getElementById('email-input');
    const email = emailInput.value.trim();

    if (isSkipped) {
        regData.email = null;
        renderPolicyStep(); // Переходим к политике
        return;
    }

    if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        regData.email = email;
        renderPolicyStep(); // Переходим к политике
    } else {
        tg.showAlert('Вы ввели некорректный Email. Попробуйте снова или пропустите шаг.');
    }
}

// Новая функция для шага с политикой
function renderPolicyStep() {
    setHeader('Регистрация', 'Финальный шаг: Согласие');
    const cont = document.getElementById('register-container');
    
    const policyText = "<b>Политика конфиденциальности (кратко):</b><br><br>" +
                       "1. Мы храним ваш ID Telegram, адрес и введенные показания.<br>" +
                       "2. Эти данные используются исключительно для передачи в УК и отображения вам.<br>" +
                       "3. Мы не передаем ваши данные третьим лицам.<br><br>" +
                       "Нажимая 'Согласен', вы подтверждаете свое согласие на обработку данных.";

    cont.innerHTML = `<div class="form-step"><p style="text-align: left; font-size: 14px;">${policyText}</p></div>`;

    // Теперь используем встроенное подтверждение Telegram, оно выглядит лучше
    tg.MainButton.setText('✅ Согласен и завершить').offClick(handleEmailSubmission).onClick(finalSubmitWithPolicy);
    tg.MainButton.show();
}

// Финальная функция отправки
async function finalSubmitWithPolicy() {
    tg.MainButton.showProgress().disable();
    try {
        await apiFetch('/api/register', { 
            method: 'POST', 
            body: JSON.stringify(regData) 
        });
        tg.showAlert('✅ Регистрация успешно завершена!');
        tg.close();
    } catch (error) { 
        tg.showAlert(`❌ Ошибка: ${error.message}`);
    } finally { 
        tg.MainButton.hideProgress().enable(); 
    }
}


// --- Передача показаний ---
async function loadReadingsData() {
    setHeader('Передача показаний', 'Загрузка...');
    try {
        const data = await apiFetch('/api/get-meters');
        hideLoader();
        renderReadingsPage(data);
    } catch (error) {
        if (error.message.includes('403')) routeToRegistration();
        else handleError(error.message);
    }
}
function renderReadingsPage(data) {
    const metersContainer = document.getElementById('readings-container');
    metersContainer.innerHTML = ''; metersContainer.classList.add('active');
    setHeader('Передача показаний', `ул. Вахова, д. ${data.address.building}, кв. ${data.address.apartment}`);
    if (data.meters.length === 0) { metersContainer.innerHTML = '<p>Счетчики не найдены.</p>'; return; }
    
    data.meters.forEach(meter => {
        const card = document.createElement('div');
        card.className = 'meter-card';
        card.innerHTML = `<div class="meter-title">${meter.meter_type === 'ГВС' ? '🔥' : '❄️'} ${meter.meter_type}</div>
            <div class="meter-info">Заводской № ${meter.factory_number}</div>
            <div class="input-group">
                <label for="meter_${meter.id}">Текущие показания (прошлые: ${meter.last_reading.toFixed(3).replace('.', ',')})</label>
                <input type="text" id="meter_${meter.id}" inputmode="decimal" placeholder="12345,123">
                <div class="consumption-info" id="consumption_${meter.id}"></div>
            </div>`;
        metersContainer.appendChild(card);
        const input = card.querySelector(`#meter_${meter.id}`);
        input.addEventListener('input', () => {
            const consumptionDiv = card.querySelector(`#consumption_${meter.id}`);
            const currentValue = parseFloat(input.value.replace(',', '.'));
            if (!isNaN(currentValue)) {
                consumptionDiv.textContent = `Расход: ${(currentValue - meter.last_reading).toFixed(3).replace('.', ',')} м³`;
            } else { consumptionDiv.textContent = ''; }
        });
    });
    tg.MainButton.setText('Отправить показания').show().onClick(submitReadings);
}

async function submitReadings() {
    const payload = { readings: [] };
    const inputs = document.querySelectorAll('#readings-container input[type="text"]');
    let hasErrors = false;
    inputs.forEach(input => {
        const meterId = parseInt(input.id.split('_')[1]);
        const valueStr = input.value.replace(',', '.').trim();
        if (valueStr === '') return;
        if (!/^\d{1,5}\.\d{3}$/.test(valueStr)) {
            tg.showAlert(`Неверный формат показаний для счетчика №${meterId}. Пример: 123,456`);
            hasErrors = true; return;
        }
        payload.readings.push({ meter_id: meterId, value: parseFloat(valueStr) });
    });
    if (hasErrors || payload.readings.length === 0) {
        if (!hasErrors) tg.showAlert('Вы не ввели ни одного показания.'); return;
    }
    tg.MainButton.showProgress().disable();
    try {
        await apiFetch('/api/submit-readings', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        tg.showAlert('✅ Показания успешно отправлены!');
        tg.close();
    } catch (error) { tg.showAlert(`❌ ${error.message}`);
    } finally { tg.MainButton.hideProgress().enable(); }
}

// --- Профиль и История ---
async function loadProfileData() {
    setHeader('Профиль', 'Загрузка...');
    try {
        const data = await apiFetch('/api/get-profile');
        hideLoader();
        renderProfilePage(data);
    } catch (error) {
        handleError(error.message);
    }
}


// --- Вспомогательные функции ---
function setHeader(t, a) { document.getElementById('header-title').textContent = t; document.getElementById('header-address').textContent = a; }
function showLoader() { document.querySelectorAll('.page').forEach(p => p.classList.remove('active')); document.getElementById('loader-container').classList.add('active'); }
function hideLoader() { document.getElementById('loader-container').classList.remove('active'); }
function handleError(m) { hideLoader(); const c = document.getElementById('error-container'); c.classList.add('active'); c.innerHTML = `<p style="text-align: center; color: red;">${m}</p>`; tg.MainButton.hide(); }

