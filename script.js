// ВАЖНО: Перед запуском ngrok, вставьте сюда его АКТУАЛЬНЫЙ HTTPS URL
const API_BASE_URL = 'https://your-ngrok-url.ngrok-free.app'; 

const tg = window.Telegram.WebApp;

// --- Централизованная функция для выполнения запросов к API ---
async function apiFetch(endpoint, options = {}) {
    // Устанавливаем заголовки по умолчанию
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `tma ${tg.initData}`,
        'ngrok-skip-browser-warning': 'true' // Говорим ngrok не показывать страницу-предупреждение
    };

    // Объединяем заголовки по умолчанию с теми, что могли быть переданы
    const config = {
        ...options,
        headers: {
            ...headers,
            ...options.headers,
        },
    };

    const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
    
    // Улучшенная обработка ответа
    if (response.ok) {
        if (response.status === 204) return null; // No Content
        return response.json();
    } else {
        try {
            const errorData = await response.json();
            throw new Error(errorData.detail || 'Произошла неизвестная ошибка сервера.');
        } catch (e) {
            // Если ответ - не JSON (например, HTML от ngrok), показываем статус
            throw new Error(`Ошибка сети или сервера: ${response.status} ${response.statusText}`);
        }
    }
}

// --- Маршрутизация и запуск ---
document.addEventListener('DOMContentLoaded', () => {
    tg.ready();
    tg.expand();
    const startParam = tg.initDataUnsafe.start_param || '';
    route(startParam);
    tg.MainButton.hide();
});

function route(param) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    showLoader();
    if (param === 'profile') loadProfileData();
    else if (param === 'register') loadRegistrationPage();
    else loadReadingsData();
}

// --- Регистрация ---
let regData = {};
function loadRegistrationPage() {
    hideLoader();
    setHeader('Регистрация', 'Шаг 1 из 4');
    const container = document.getElementById('register-container');
    container.classList.add('active');
    container.innerHTML = `<div class="form-step"><p>Выберите ваше строение:</p><div class="button-grid">
        <button class="grid-button" onclick="selectBuilding('8В')">8В</button>
        <button class="grid-button" onclick="selectBuilding('8Г')">8Г</button>
        <button class="grid-button" onclick="selectBuilding('8Д')">8Д</button></div></div>`;
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
            body: JSON.stringify(regData) 
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
    cont.innerHTML = `<div class="form-step"><p>Email (необязательно):</p><input type="email" id="email-input" placeholder="user@example.com" inputmode="email"></div>`;
    tg.MainButton.setText('Завершить регистрацию').offClick(submitAccount).onClick(finalSubmit);
}
async function finalSubmit() {
    const email = document.getElementById('email-input').value;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { tg.showAlert('Вы ввели некорректный Email.'); return; }
    regData.email = email || null;
    tg.showConfirm("Вы согласны с политикой обработки персональных данных?", async (ok) => {
        if (!ok) { tg.showAlert('Регистрация отменена.'); return; }
        tg.MainButton.showProgress().disable();
        try {
            await apiFetch('/api/register', { 
                method: 'POST', 
                body: JSON.stringify(regData) 
            });
            tg.showAlert('✅ Регистрация успешно завершена!');
            tg.close();
        } catch (error) { tg.showAlert(`❌ Ошибка: ${error.message}`);
        } finally { tg.MainButton.hideProgress().enable(); }
    });
}

// --- Передача показаний ---
async function loadReadingsData() {
    setHeader('Передача показаний', 'Загрузка...');
    try {
        const data = await apiFetch('/api/get-meters');
        hideLoader();
        renderReadingsPage(data);
    } catch (error) {
        handleError(error.message);
    }
}
function renderReadingsPage(data) {
    const metersContainer = document.getElementById('readings-container');
    metersContainer.innerHTML = '';
    metersContainer.classList.add('active');
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
            </div>`;
        metersContainer.appendChild(card);
        const input = card.querySelector(`#meter_${meter.id}`);
        input.addEventListener('input', () => {
            const consumptionDiv = card.querySelector(`#consumption_${meter.id}`);
            const currentValue = parseFloat(input.value.replace(',', '.'));
            if (!isNaN(currentValue)) {
                const consumption = currentValue - meter.last_reading;
                consumptionDiv.textContent = `Расход: ${consumption.toFixed(3).replace('.', ',')} м³`;
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
function renderProfilePage(data) {
    const profileContainer = document.getElementById('profile-container');
    profileContainer.classList.add('active');
    setHeader('Профиль', `ул. Вахова, д. ${data.address.building}, кв. ${data.address.apartment}`);
    let profileHTML = `<div class="profile-section">
            <p><strong>Логин:</strong> ${data.user.login}</p>
            <p><strong>Email:</strong> ${data.user.email || 'не указан'}</p>
            <p><strong>Лицевой счет:</strong> <code>${data.address.account_number}</code></p>
        </div>`;
    profileHTML += `<div class="history-section"><h3>📜 История показаний</h3>`;
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

// --- Вспомогательные функции ---
function setHeader(t, a) { document.getElementById('header-title').textContent = t; document.getElementById('header-address').textContent = a; }
function showLoader() { document.querySelectorAll('.page').forEach(p => p.classList.remove('active')); document.getElementById('loader-container').classList.add('active'); }
function hideLoader() { document.getElementById('loader-container').classList.remove('active'); }
function handleError(m) { hideLoader(); const c = document.getElementById('error-container'); c.classList.add('active'); c.innerHTML = `<p style="text-align: center; color: red;">${m}</p>`; tg.MainButton.hide(); }