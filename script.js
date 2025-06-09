const API_BASE_URL = 'https://bunny-brave-externally.ngrok-free.app'; 

const tg = window.Telegram.WebApp;

// --- Улучшенный обработчик ошибок API ---
async function handleApiResponse(response) {
    if (response.ok) {
        // Если ответ 204 No Content, возвращаем null, а не пытаемся парсить JSON
        if (response.status === 204) return null;
        return response.json();
    }
    try {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Произошла неизвестная ошибка сервера.');
    } catch (e) {
        throw new Error(`Ошибка сервера: ${response.status} ${response.statusText}`);
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
        const response = await fetch(`${API_BASE_URL}/api/check-address`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(regData) });
        await handleApiResponse(response);
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
            const response = await fetch(`${API_BASE_URL}/api/register`, { method: 'POST', headers: {'Content-Type': 'application/json', 'Authorization': `tma ${tg.initData}`}, body: JSON.stringify(regData) });
            await handleApiResponse(response);
            tg.showAlert('✅ Регистрация успешно завершена!');
            tg.close();
        } catch (error) { tg.showAlert(`❌ Ошибка: ${error.message}`);
        } finally { tg.MainButton.hideProgress().enable(); }
    });
}
// --- Функции для показаний и профиля (вспомогательные) ---
function setHeader(t, a) { document.getElementById('header-title').textContent = t; document.getElementById('header-address').textContent = a; }
function showLoader() { document.getElementById('loader-container').classList.add('active'); }
function hideLoader() { document.getElementById('loader-container').classList.remove('active'); }
function handleError(m) { hideLoader(); const c = document.getElementById('error-container'); c.classList.add('active'); c.innerHTML = `<p style="text-align: center; color: red;">${m}</p>`; tg.MainButton.hide(); }
async function loadReadingsData() {
    setHeader('Передача показаний', 'Загрузка...');
    showLoader();
    try {
        const response = await fetch(`${API_BASE_URL}/api/get-meters`, {
            headers: { 'Authorization': `tma ${tg.initData}` }
        });
        if (!response.ok) throw new Error(`Ошибка сервера: ${response.status}`);
        
        const data = await response.json();
        renderReadingsPage(data);
    } catch (error) {
        handleError(error.message);
    }
}

function renderReadingsPage(data) {
    const metersContainer = document.getElementById('meters-container');
    metersContainer.innerHTML = ''; // Очищаем лоадер

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

        // Добавляем обработчик для подсчета расхода "на лету"
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

    // Настраиваем главную кнопку Telegram
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
        
        // Простая валидация на фронте
        if (valueStr === '') return; // Пропускаем пустые поля

        const value = parseFloat(valueStr);
        if (isNaN(value) || !/^\d{1,5}\.\d{3}$/.test(valueStr)) {
            tg.showAlert(`Неверный формат показаний для счетчика с ID ${meterId}. Пример: 12345,123`);
            hasErrors = true;
            return;
        }
        payload.readings.push({ meter_id: meterId, value: value });
    });

    if (hasErrors || payload.readings.length === 0) {
        if (!hasErrors) tg.showAlert('Вы не ввели ни одного показания.');
        return;
    }

    tg.MainButton.showProgress();
    tg.MainButton.disable();

    try {
        const response = await fetch(`${API_BASE_URL}/api/submit-readings`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `tma ${tg.initData}`
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error('Ошибка при отправке данных на сервер.');

        tg.showAlert('✅ Показания успешно отправлены!');
        tg.close();
    } catch (error) {
        tg.showAlert(`❌ ${error.message}`);
    } finally {
        tg.MainButton.hideProgress();
        tg.MainButton.enable();
    }
}


// --- ЛОГИКА ДЛЯ ПРОФИЛЯ ---

async function loadProfileData() {
    setHeader('Профиль', 'Загрузка...');
    showLoader();
    try {
        const response = await fetch(`${API_BASE_URL}/api/get-profile`, {
            headers: { 'Authorization': `tma ${tg.initData}` }
        });
        if (!response.ok) throw new Error(`Ошибка сервера: ${response.status}`);
        
        const data = await response.json();
        renderProfilePage(data);
    } catch (error) {
        handleError(error.message);
    }
}

function renderProfilePage(data) {
    document.getElementById('meters-container').innerHTML = ''; // Скрываем лоадер/формы
    const profileContainer = document.getElementById('profile-container');
    profileContainer.classList.remove('hidden');

    setHeader('Профиль', `ул. Вахова, д. ${data.address.building}, кв. ${data.address.apartment}`);

    let profileHTML = `
        <div class="profile-section">
            <p><strong>Логин:</strong> ${data.user.login}</p>
            <p><strong>Email:</strong> ${data.user.email || 'не указан'}</p>
            <p><strong>Лицевой счет:</strong> <code>${data.address.account_number}</code></p>
        </div>
    `;

    profileHTML += `<div class="history-section"><h3>📜 История показаний</h3>`;
    if (data.meters.length > 0) {
        data.meters.forEach(meter => {
            profileHTML += `<h4>${meter.meter_type === 'ГВС' ? '🔥' : '❄️'} ${meter.meter_type} (№ ${meter.factory_number})</h4>`;
            if (meter.history.length > 0) {
                meter.history.forEach(rec => {
                    profileHTML += `
                        <div class="history-item">
                            <strong>Период: ${rec.period}</strong><br>
                            Показание: ${rec.curr_reading.toFixed(3).replace('.',',')} (Расход: ${rec.consumption.toFixed(3).replace('.',',')} м³)
                        </div>
                    `;
                });
            } else {
                profileHTML += `<div class="history-item">Нет истории.</div>`;
            }
        });
    } else {
        profileHTML += `<p>Счетчики не найдены.</p>`;
    }
    profileHTML += `</div>`;
    
    profileContainer.innerHTML = profileHTML;

    // Кнопка в профиле не нужна, т.к. Mini App просто показывает информацию
    tg.MainButton.hide();
}