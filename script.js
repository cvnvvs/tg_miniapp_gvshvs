// ВАЖНО: Перед запуском ngrok, вставьте сюда его АКТУАЛЬНЫЙ HTTPS URL
const API_BASE_URL = 'https://bunny-brave-externally.ngrok-free.app'; 
const tg = window.Telegram.WebApp;

// --- Глобальное состояние приложения ---
let appState = {
    userData: null,
    regData: {}
};

// --- Централизованный API Fetch ---
async function apiFetch(endpoint, options = {}) {
    const isPrivate = options.private !== false;
    const headers = { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' };
    if (isPrivate) {
        if (!tg.initData) throw new Error("Нет данных для авторизации (initData).");
        headers['Authorization'] = `tma ${tg.initData}`;
    }
    const config = { ...options, headers: { ...headers, ...options.headers } };
    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
        if (response.ok) return response.status === 204 ? null : response.json();
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Ошибка сервера.');
    } catch (e) { throw new Error(e.message || 'Ошибка сети.'); }
}

// --- Маршрутизация и запуск ---
document.addEventListener('DOMContentLoaded', () => {
    tg.ready();
    tg.expand();
    tg.MainButton.hide();
    document.body.style.visibility = 'visible';
    
    showLoader();
    apiFetch('/api/get-profile')
        .then(data => {
            appState.userData = data;
            showPage('profile'); // Начинаем с профиля
        })
        .catch(() => {
            showPage('register');
        });
});

// --- Навигация ---
function showPage(pageName) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(`${pageName}-container`).classList.add('active');
    tg.MainButton.hide();
    const tabBar = document.getElementById('tab-bar');

    if (pageName === 'readings' || pageName === 'profile') {
        tabBar.classList.remove('hidden');
        document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
        if (pageName === 'readings') {
            document.querySelector('.tab-button[onclick*="readings"]').classList.add('active');
            renderReadingsPage();
        } else {
            document.querySelector('.tab-button[onclick*="profile"]').classList.add('active');
            renderProfilePage();
        }
    } else {
        tabBar.classList.add('hidden');
        if (pageName === 'register') renderRegistrationStep1();
    }
}

// --- Регистрация ---
function renderRegistrationStep1() {
    hideLoader();
    setHeader('Регистрация', 'Шаг 1: Выбор строения');
    const container = document.getElementById('register-container');
    container.innerHTML = `<div class="form-step"><p>Выберите ваше строение:</p><div class="button-grid" style="grid-template-columns: 1fr 1fr 1fr;">
        <button class="grid-button" onclick="handleBuildingSelect('8В')">8В</button>
        <button class="grid-button" onclick="handleBuildingSelect('8Г')">8Г</button>
        <button class="grid-button" onclick="handleBuildingSelect('8Д')">8Д</button></div></div>`;
}
function handleBuildingSelect(building) {
    appState.regData.building = building;
    setHeader('Регистрация', `Шаг 2: Номер квартиры`);
    const cont = document.getElementById('register-container');
    cont.innerHTML = `<div class="form-step"><p>Строение <b>${building}</b>. Введите номер квартиры:</p><input type="number" id="apartment-input" placeholder="45" inputmode="numeric"></div>`;
    tg.MainButton.setText('Далее').show().onClick(handleApartmentSubmit);
}
async function handleApartmentSubmit() {
    const apartment = document.getElementById('apartment-input').value;
    if (!apartment || !/^\d+$/.test(apartment)) { tg.showAlert('Введите корректный номер квартиры.'); return; }
    appState.regData.apartment = apartment;
    tg.MainButton.showProgress().disable();
    try {
        await apiFetch('/api/check-address', { method: 'POST', body: JSON.stringify(appState.regData), private: false });
        renderAccountStep();
    } catch (error) { tg.showAlert(error.message);
    } finally { tg.MainButton.hideProgress().enable(); }
}
function renderAccountStep() {
    setHeader('Регистрация', 'Шаг 3: Верификация');
    const cont = document.getElementById('register-container');
    cont.innerHTML = `<div class="form-step"><p>Адрес найден! Введите ваш <b>6-значный лицевой счет</b>.</p><input type="number" id="account-input" placeholder="000000" maxlength="6" inputmode="numeric"></div>`;
    tg.MainButton.offClick(handleApartmentSubmit).onClick(handleAccountSubmit);
}
function handleAccountSubmit() {
    const account = document.getElementById('account-input').value;
    if (!account || !/^\d{6}$/.test(account)) { tg.showAlert('Лицевой счет должен состоять из 6 цифр.'); return; }
    appState.regData.account = account;
    renderEmailStep();
}
function renderEmailStep() {
    setHeader('Регистрация', 'Шаг 4: Контакты (необязательно)');
    const cont = document.getElementById('register-container');
    cont.innerHTML = `<div class="form-step"><p>Email:</p><input type="email" id="email-input" placeholder="user@example.com" inputmode="email"></div>`;
    tg.MainButton.setText('Далее').offClick(handleAccountSubmit).onClick(handleEmailSubmit);
}
function handleEmailSubmit() {
    const email = document.getElementById('email-input').value.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { tg.showAlert('Неверный формат Email.'); return; }
    appState.regData.email = email || null;
    renderPolicyStep();
}
function renderPolicyStep() {
    setHeader('Регистрация', 'Финальный шаг: Согласие');
    const user = tg.initDataUnsafe.user;
    const userLogin = user.username ? `@${user.username}` : `ID: ${user.id}`;
    const fullAddress = `Хабаровский край, г.Хабаровск, ул. Вахова, д. ${appState.regData.building}, кв. ${appState.regData.apartment}`;
    const policyText = `Я, ${userLogin}, являясь потребителем... (ваш полный текст)`; // Сокращено
    const cont = document.getElementById('register-container');
    cont.innerHTML = `<div class="form-step"><p style="text-align: left; font-size: 14px; max-height: 300px; overflow-y: auto;">${policyText}</p></div>`;
    tg.MainButton.setText('✅ Согласен и завершить').offClick(handleEmailSubmit).onClick(finalSubmit);
    tg.BackButton.show().onClick(renderEmailStep); // Кнопка Назад
}
async function finalSubmit() {
    tg.BackButton.hide().offClick();
    tg.MainButton.showProgress().disable();
    try {
        const data = await apiFetch('/api/register', { method: 'POST', body: JSON.stringify(appState.regData) });
        appState.userData = data.user_data;
        tg.showAlert('✅ Регистрация успешно завершена!');
        showPage('profile');
    } catch (error) { tg.showAlert(`❌ Ошибка: ${error.message}`);
    } finally { tg.MainButton.hideProgress().enable(); }
}

// --- Передача показаний ---
function renderReadingsPage() {
    hideLoader();
    const data = appState.userData;
    const metersContainer = document.getElementById('readings-container');
    metersContainer.innerHTML = '';
    setHeader('Передача показаний', `ул. Вахова, д. ${data.address.building}, кв. ${data.address.apartment}`);
    if (data.meters.length === 0) { metersContainer.innerHTML = '<p>Счетчики не найдены.</p>'; return; }
    
    data.meters.forEach(meter => {
        const card = document.createElement('div');
        card.className = 'meter-card';
        card.innerHTML = `<div class="meter-title">${meter.meter_type === 'ГВС' ? '🔥' : '❄️'} ${meter.meter_type}</div>
            <div class="meter-info">Заводской № ${meter.factory_number}</div>
            <div class="input-group">
                <label for="meter_${meter.id}">Текущие показания (прошлые: ${meter.last_reading.toFixed(3).replace('.', ',')})</label>
                <input type="text" id="meter_${meter.id}" inputmode="decimal" placeholder="123,456">
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
            tg.showAlert(`Неверный формат для счетчика с заводским номером, который связан с ID ${meterId}. Пример: 123,456`);
            hasErrors = true; return;
        }
        payload.readings.push({ meter_id: meterId, value: parseFloat(valueStr) });
    });
    if (hasErrors || payload.readings.length === 0) {
        if (!hasErrors) tg.showAlert('Вы не ввели ни одного показания.'); return;
    }
    tg.MainButton.showProgress().disable();
    try {
        await apiFetch('/api/submit-readings', { method: 'POST', body: JSON.stringify(payload) });
        tg.showAlert('✅ Показания успешно отправлены!');
        tg.close();
    } catch (error) { tg.showAlert(`❌ ${error.message}`);
    } finally { tg.MainButton.hideProgress().enable(); }
}

// --- Профиль и сброс ---
function renderProfilePage() {
    hideLoader();
    const data = appState.userData;
    const profileContainer = document.getElementById('profile-container');
    setHeader('Профиль', `ул. Вахова, д. ${data.address.building}, кв. ${data.address.apartment}`);
    let profileHTML = `<div class="profile-section">
            <p><strong>Логин:</strong> ${data.user.login}</p>
            <p><strong>Email:</strong> ${data.user.email || 'не указан'}</p>
            <p><strong>Лицевой счет:</strong> <code>${data.address.account_number}</code></p>
        </div>`;
    profileHTML += `<div class="history-section"><h3>📜 История показаний</h3>`;
    if (data.meters.length > 0) {
        data.meters.forEach(meter => {
            profileHTML += `<h4>${meter.meter_type === 'ГВС' ? '🔥' : '❄️'} ${meter.meter_type} (№ ${meter.factory_number})</h4>
                <p><strong>Показания за прошлый месяц (${meter.initial_reading_date}):</strong> <code>${meter.initial_reading.toFixed(3).replace('.',',')}</code></p>`;
        });
    } else { profileHTML += `<p>Счетчики не найдены.</p>`; }
    profileHTML += `</div>`;
    profileContainer.innerHTML = profileHTML;

    const resetButton = document.createElement('button');
    resetButton.className = 'full-width-button';
    resetButton.textContent = '❌ Сбросить регистрацию';
    resetButton.style.marginTop = '20px';
    resetButton.onclick = handleResetClick;
    profileContainer.appendChild(resetButton);
}
function handleResetClick() {
    tg.showConfirm("Вы уверены, что хотите сбросить регистрацию? Это действие необратимо.", async (ok) => {
        if (!ok) return;
        showLoader();
        try {
            await apiFetch('/api/reset-registration', { method: 'POST' });
            appState.userData = null;
            tg.showAlert('Регистрация сброшена.');
            showPage('register');
        } catch (error) { tg.showAlert(`❌ Ошибка: ${error.message}`); }
    });
}

// --- Вспомогательные функции ---
function setHeader(t, a) { document.getElementById('header-title').textContent = t; document.getElementById('header-address').textContent = a; }
function showLoader() { document.querySelectorAll('.page').forEach(p => p.classList.remove('active')); document.getElementById('loader-container').classList.add('active'); }
function hideLoader() { document.getElementById('loader-container').classList.remove('active'); }
function handleError(m) { hideLoader(); const c = document.getElementById('error-container'); c.classList.add('active'); c.innerHTML = `<p style="text-align: center; color: red;">${m}</p>`; tg.MainButton.hide(); }
