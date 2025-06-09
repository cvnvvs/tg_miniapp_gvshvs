const API_BASE_URL = 'https://bunny-brave-externally.ngrok-free.app'; 
const tg = window.Telegram.WebApp;

// --- ОБРАБОТЧИКИ СОБЫТИЙ И ЗАГРУЗКА ---
document.addEventListener('DOMContentLoaded', () => {
    tg.ready();
    tg.expand();
    
    const startParam = tg.initDataUnsafe.start_param;
    route(startParam);

    // Скрываем основную кнопку по умолчанию
    tg.MainButton.hide();
});

function route(param) {
    // Убираем все активные страницы
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

    if (param === 'profile') {
        loadProfileData();
    } else if (param === 'register') {
        loadRegistrationPage();
    } else {
        loadReadingsData();
    }
}

// --- РЕГИСТРАЦИЯ ---
let registrationData = {};

function loadRegistrationPage() {
    hideLoader();
    setHeader('Регистрация', 'Шаг 1 из 4');
    const container = document.getElementById('register-container');
    container.classList.add('active');
    container.innerHTML = `
        <div class="form-step">
            <p>Выберите ваше строение (корпус):</p>
            <div class="button-grid">
                <button class="grid-button" onclick="handleBuildingSelect('8В')">8В</button>
                <button class="grid-button" onclick="handleBuildingSelect('8Г')">8Г</button>
                <button class="grid-button" onclick="handleBuildingSelect('8Д')">8Д</button>
            </div>
        </div>
    `;
}

function handleBuildingSelect(building) {
    registrationData.building = building;
    setHeader('Регистрация', `Шаг 2 из 4: Строение ${building}`);
    const container = document.getElementById('register-container');
    container.innerHTML = `
        <div class="form-step">
            <p>Теперь введите номер вашей квартиры:</p>
            <input type="number" id="apartment-input" placeholder="Например: 45">
        </div>
    `;
    tg.MainButton.setText('Далее').show();
    tg.MainButton.onClick(handleApartmentSubmit);
}

async function handleApartmentSubmit() {
    const apartment = document.getElementById('apartment-input').value;
    if (!apartment || !/^\d+$/.test(apartment)) {
        tg.showAlert('Пожалуйста, введите корректный номер квартиры.');
        return;
    }
    registrationData.apartment = apartment;
    tg.MainButton.showProgress();

    try {
        const response = await fetch(`${API_BASE_URL}/api/check-address`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ building: registrationData.building, apartment: registrationData.apartment })
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail);
        }
        await response.json(); // Адрес найден
        renderAccountStep();
    } catch (error) {
        tg.showAlert(error.message);
    } finally {
        tg.MainButton.hideProgress();
    }
}

function renderAccountStep() {
    setHeader('Регистрация', 'Шаг 3 из 4: Верификация');
    const container = document.getElementById('register-container');
    container.innerHTML = `
        <div class="form-step">
            <p>Адрес найден! Для подтверждения введите ваш <b>6-значный лицевой счет</b>.</p>
            <input type="number" id="account-input" placeholder="000000" maxlength="6">
        </div>
    `;
    tg.MainButton.setText('Далее').show();
    tg.MainButton.offClick(handleApartmentSubmit);
    tg.MainButton.onClick(handleAccountSubmit);
}

function handleAccountSubmit() {
    const account = document.getElementById('account-input').value;
    if (!account || !/^\d{6}$/.test(account)) {
        tg.showAlert('Лицевой счет должен состоять ровно из 6 цифр.');
        return;
    }
    registrationData.account = account;
    renderEmailStep();
}

function renderEmailStep() {
    setHeader('Регистрация', 'Шаг 4 из 4: Контакты');
    const container = document.getElementById('register-container');
    container.innerHTML = `
        <div class="form-step">
            <p>Почти готово! Введите ваш Email (необязательно) или оставьте поле пустым.</p>
            <input type="email" id="email-input" placeholder="user@example.com">
        </div>
    `;
    tg.MainButton.setText('Завершить регистрацию').show();
    tg.MainButton.offClick(handleAccountSubmit);
    tg.MainButton.onClick(handleFinalSubmit);
}

async function handleFinalSubmit() {
    const email = document.getElementById('email-input').value;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        tg.showAlert('Вы ввели некорректный Email.');
        return;
    }
    registrationData.email = email || null;
    
    // Показываем политику для финального согласия
    tg.showConfirm("Вы согласны с политикой обработки персональных данных?", async (isConfirmed) => {
        if (isConfirmed) {
            tg.MainButton.showProgress();
            try {
                const response = await fetch(`${API_BASE_URL}/api/register`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json', 'Authorization': `tma ${tg.initData}`},
                    body: JSON.stringify(registrationData)
                });
                if (!response.ok) { const err = await response.json(); throw new Error(err.detail); }
                tg.showAlert('✅ Регистрация успешно завершена!');
                tg.close();
            } catch (error) {
                tg.showAlert(`❌ Ошибка: ${error.message}`);
            } finally {
                tg.MainButton.hideProgress();
            }
        } else {
            tg.showAlert('Регистрация отменена. Вы можете начать заново, перезапустив приложение.');
        }
    });
}

// --- ЛОГИКА ДЛЯ ПЕРЕДАЧИ ПОКАЗАНИЙ ---

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


// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---

function setHeader(title, address) { document.getElementById('header-title').textContent = title; document.getElementById('header-address').textContent = address; }
function showLoader() { document.getElementById('loader-container').classList.add('active'); }
function hideLoader() { document.getElementById('loader-container').classList.remove('active'); }
function handleError(message) { hideLoader(); const container = document.getElementById('error-container'); container.classList.add('active'); container.innerHTML = `<p style="text-align: center; color: red;">${message}</p>`; tg.MainButton.hide();}