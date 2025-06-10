// ВАЖНО: Вставьте сюда ваш актуальный HTTPS URL от ngrok
const API_BASE_URL = 'https://breezy-bobcats-brush.loca.lt'; 

const tg = window.Telegram.WebApp;

let appState = { userData: null, regData: {} };

async function apiFetch(endpoint, options = {}) {
    const isPrivate = options.private !== false;
    const headers = { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' };
    if (isPrivate) {
        if (!tg.initData) throw new Error("Нет данных для авторизации.");
        headers['Authorization'] = `tma ${tg.initData}`;
    }
    const config = { ...options, headers: { ...headers, ...options.headers } };
    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
        if (response.ok) return response.status === 204 ? null : response.json();
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Ошибка сервера.');
    } catch (e) {
        throw new Error(e.message || 'Ошибка сети.');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    tg.ready();
    tg.expand();
    tg.MainButton.hide();
    document.body.style.visibility = 'visible';
    initialize();
});

function initialize() {
    showLoader();
    apiFetch('/api/get-profile').then(data => {
        appState.userData = data;
        showPage('profile');
    }).catch(() => showPage('register'));
}

function showPage(pageName) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(`${pageName}-container`).classList.add('active');
    tg.MainButton.hide();
    tg.BackButton.hide();
    const tabBar = document.getElementById('tab-bar');

    if (pageName === 'readings' || pageName === 'profile') {
        tabBar.classList.remove('hidden');
        document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
        const targetTab = document.querySelector(`.tab-button[onclick*="'${pageName}'"]`);
        if (targetTab) targetTab.classList.add('active');
        
        if (pageName === 'readings') renderReadingsPage(appState.userData);
        else renderProfilePage(appState.userData);
    } else {
        tabBar.classList.add('hidden');
        if (pageName === 'register') renderRegistrationStep1();
    }
}

// --- Регистрация ---
function renderRegistrationStep1() {
    hideLoader();
    setHeader('Регистрация', 'Шаг 1: Выбор строения');
    document.getElementById('register-container').innerHTML = `<div class="form-step"><p>Выберите ваше строение:</p><div class="button-grid" style="grid-template-columns: 1fr 1fr 1fr;">
        <button class="grid-button" onclick="handleBuildingSelect('8В')">8В</button>
        <button class="grid-button" onclick="handleBuildingSelect('8Г')">8Г</button>
        <button class="grid-button" onclick="handleBuildingSelect('8Д')">8Д</button></div></div>`;
}
function handleBuildingSelect(building) {
    appState.regData.building = building;
    setHeader('Регистрация', `Шаг 2: Номер квартиры`);
    document.getElementById('register-container').innerHTML = `<div class="form-step"><p>Строение <b>${building}</b>. Введите номер квартиры:</p><input type="number" id="apartment-input" placeholder="45" inputmode="numeric"></div>`;
    tg.MainButton.setText('Далее').show().onClick(handleApartmentSubmit);
}
async function handleApartmentSubmit() {
    const apartment = document.getElementById('apartment-input').value.trim();
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
    document.getElementById('register-container').innerHTML = `<div class="form-step"><p>Адрес найден! Введите ваш <b>6-значный лицевой счет</b>.</p><input type="number" id="account-input" placeholder="000000" maxlength="6" inputmode="numeric"></div>`;
    tg.BackButton.show().onClick(handleBuildingSelect.bind(null, appState.regData.building));
    tg.MainButton.offClick(handleApartmentSubmit).onClick(handleAccountSubmit);
}
function handleAccountSubmit() {
    const account = document.getElementById('account-input').value.trim();
    if (!account || !/^\d{6}$/.test(account)) { tg.showAlert('Лицевой счет должен состоять из 6 цифр.'); return; }
    appState.regData.account = account;
    renderEmailStep();
}
function renderEmailStep() {
    setHeader('Регистрация', 'Шаг 4: Контакты (необязательно)');
    document.getElementById('register-container').innerHTML = `<div class="form-step"><p>Email:</p><input type="email" id="email-input" placeholder="user@example.com" inputmode="email">
        <div class="button-grid" style="margin-top: 20px;">
        <button class="grid-button" onclick="handleEmailSubmit(true)">Пропустить</button></div></div>`;
    tg.MainButton.setText('Подтвердить Email и далее').offClick(handleAccountSubmit).onClick(() => handleEmailSubmit(false));
    tg.BackButton.show().onClick(renderAccountStep);
}
function handleEmailSubmit(isSkipped) {
    const emailInput = document.getElementById('email-input');
    const email = emailInput ? emailInput.value.trim() : '';
    if (isSkipped) { appState.regData.email = null;
    } else {
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { tg.showAlert('Неверный формат Email.'); return; }
        appState.regData.email = email;
    }
    renderPolicyStep();
}
function renderPolicyStep() {
    setHeader('Регистрация', 'Финальный шаг: Согласие');
    tg.MainButton.hide();
    tg.BackButton.show().onClick(renderEmailStep);
    const user = tg.initDataUnsafe.user;
    const userLogin = user.username ? `@${user.username}` : `ID: ${user.id}`;
    const fullAddress = `Хабаровский край, г.Хабаровск, ул. Вахова, д. ${appState.regData.building}, кв. ${appState.regData.apartment}`;
    const policyText = `Я, ${userLogin}, являясь потребителем жилищно-коммунальных услуг по адресу: ${fullAddress}, прошу осуществить мою авторизацию в телеграм приложении «ГВС ХВС» с целью дачи показаний по счётчикам ГВС и ХВС.<br><br>Даю согласие на предоставление и обработку персональных данных Оператору по ведению взаиморасчетов в соответствии с Федеральным законом от 27.07.2006г. № 152-ФЗ «О персональных данных».<br><br><b>Перечень персональных данных, на обработку которых дается согласие:</b><br>- Лицевой счет;<br>- Адрес;<br>- Номер контактного телефона и/или адрес электронной почты.<br><br><b>Целью обработки персональных данных</b> Оператором является надлежащее осуществление дачи показаний и оказание информационных услуг.<br><br>Согласие на обработку персональных данных выдается Оператору бессрочно, но может быть отозвано посредством письменного уведомления в Абонентный отдел. Потребитель подтверждает, что персональные данные могут быть получены Оператором от любых третьих лиц. Оператор не несет ответственность за достоверность персональных данных Потребителя, полученных от третьих лиц.`;
    document.getElementById('register-container').innerHTML = `<div class="form-step"><div style="text-align: left; font-size: 14px; max-height: 300px; overflow-y: auto; padding-right: 10px; margin-bottom: 20px;">${policyText}</div>
        <div class="button-grid" style="gap: 15px;">
            <button class="full-width-button" onclick="finalSubmit()">✅ Согласен и завершить</button>
            <button class="grid-button" onclick="handlePolicyDecline()">❌ Не согласен</button>
        </div></div>`;
}
function handlePolicyDecline() {
    tg.showAlert("Вы отказались от согласия. Регистрация отменена.");
    renderRegistrationStep1();
}
async function finalSubmit() {
    tg.BackButton.hide().offClick();
    tg.MainButton.showProgress().disable();
    try {
        // Мы НЕ проверяем подписку на фронте. Это делает бэкенд.
        const data = await apiFetch('/api/register', { method: 'POST', body: JSON.stringify(appState.regData) });
        
        tg.HapticFeedback.notificationOccurred('success');
        tg.showAlert('✅ Регистрация успешно завершена! Приложение будет перезагружено.', () => location.reload());

    } catch (error) { 
        // ИСПРАВЛЕНИЕ: Показываем любую ошибку, пришедшую с бэкенда
        tg.showAlert(`❌ Ошибка: ${error.message}`);
        // Возвращаем пользователя на предыдущий шаг (кнопки "Согласен/Не согласен"), чтобы он мог попробовать снова
        renderPolicyStep(); 
    } finally { 
        tg.MainButton.hideProgress().enable(); 
    }
}
// --- Передача показаний ---
function renderReadingsPage(data) {
    hideLoader();
    if (!data) { handleError("Не удалось загрузить данные пользователя."); return; }
    
    const metersContainer = document.getElementById('readings-container');
    setHeader('Передача показаний', `ул. Вахова, д. ${data.address.building}, кв. ${data.address.apartment}`);
    
    // ИСПРАВЛЕНИЕ: Проверяем флаг с бэкенда
    if (!data.is_active_period) {
        metersContainer.innerHTML = `<div class="form-step"><p>📅 Прием показаний закрыт.<br>Доступно только с 20 по 25 число месяца.</p></div>`;
        tg.MainButton.hide();
        return;
    }
    
    let metersHTML = '<div class="meters-grid">';
    if (data.meters.length === 0) {
        metersHTML = '<p>Счетчики не найдены.</p>';
    } else {
        const sortedMeters = data.meters.sort((a, b) => a.meter_type.localeCompare(b.meter_type) || a.id - b.id);
        sortedMeters.forEach(meter => {
            const isSubmitted = meter.current_reading !== null;
            const buttonClass = isSubmitted ? 'meter-button submitted' : 'meter-button';
            const checkmarkHTML = isSubmitted ? '<span class="checkmark">✅</span>' : '';
            const icon = meter.meter_type === 'ГВС' ? '🔥' : '❄️';
            
            metersHTML += `
                <button class="${buttonClass}" onclick="renderSingleReadingInput(${meter.id})">
                    <span class="meter-button-icon">${icon}</span>
                    <div class="meter-button-text">
                        <span class="meter-button-type">${meter.meter_type}</span>
                        <span class="meter-button-num">№ ${meter.factory_number}</span>
                    </div>
                    ${checkmarkHTML}
                </button>`;
        });
    }
    metersHTML += '</div>';
    metersContainer.innerHTML = metersHTML;
}

function renderSingleReadingInput(meterId) {
    document.getElementById('tab-bar').classList.add('hidden');
    const meter = appState.userData.meters.find(m => m.id === meterId);
    if (!meter) { handleError("Счетчик не найден"); return; }
    tg.BackButton.show().onClick(() => showPage('readings', appState.userData));
    setHeader('Ввод показаний', `${meter.meter_type} - № ${meter.factory_number}`);
    const container = document.getElementById('readings-container');
    const lastReadingStr = meter.last_reading.toFixed(3).replace('.', ',');
    const [currentInt, currentDec] = meter.current_reading ? meter.current_reading.toFixed(3).split('.') : ['', ''];
    container.innerHTML = `<div class="form-step"><p>Показания за прошлый месяц: <code>${lastReadingStr}</code></p>
        <p>Введите текущие показания:</p>
        <div class="readings-input-wrapper">
            <input type="number" id="reading-part1" class="readings-input-part" maxlength="5" placeholder="00000" value="${currentInt}" oninput="limitLength(this, 5); updateLiveInput();">
            <span class="readings-input-separator">,</span>
            <input type="number" id="reading-part2" class="readings-input-part" maxlength="3" placeholder="000" value="${currentDec}" oninput="limitLength(this, 3); updateLiveInput();">
        </div>
        <div class="consumption-info" id="consumption-live"></div>
        <p id="anomaly-warning" class="hidden" style="color: #ff8800; font-weight: bold;"></p></div>`;
    
    window.updateLiveInput = () => {
        const p1 = document.getElementById('reading-part1').value;
        const p2 = document.getElementById('reading-part2').value;
        if (p1 && p2.length === 3) {
            const fullValue = parseFloat(`${p1}.${p2}`);
            if (isNaN(fullValue)) return;
            const consumption = fullValue - meter.last_reading;
            document.getElementById('consumption-live').textContent = `Расход: ${consumption.toFixed(3).replace('.',',')} м³`;
            const warning = document.getElementById('anomaly-warning');
            if (Math.abs(consumption) > 500) {
                warning.textContent = 'ВНИМАНИЕ, БОЛЬШАЯ РАЗНИЦА В ПОКАЗАНИЯХ!';
                warning.classList.remove('hidden');
            } else { warning.classList.add('hidden'); }
            tg.MainButton.setText('Сохранить').show().onClick(() => submitSingleReading(meter, fullValue));
        } else {
            tg.MainButton.hide();
            document.getElementById('consumption-live').textContent = '';
            document.getElementById('anomaly-warning').classList.add('hidden');
        }
    };
    window.limitLength = (el, max) => { if (el.value.length > max) el.value = el.value.slice(0, max); };
    updateLiveInput();
}
async function submitSingleReading(meter, value) {
    tg.MainButton.showProgress().disable();
    tg.BackButton.hide().offClick();
    try {
        const payload = { readings: [{ meter_id: meter.id, value: value }] };
        await apiFetch('/api/submit-readings', { method: 'POST', body: JSON.stringify(payload) });
        tg.HapticFeedback.notificationOccurred('success');
        tg.showAlert('✅ Показания сохранены. Обновляем страницу...', () => location.reload());
    } catch(error) {
        tg.showAlert(`❌ Ошибка: ${error.message}`);
        tg.MainButton.hideProgress().enable();
        tg.BackButton.show().onClick(() => showPage('readings', appState.userData));
    }
}

// --- Профиль и сброс ---
function renderProfilePage(data) {
    hideLoader();
    if (!data) { handleError("Не удалось загрузить данные пользователя."); return; }
    
    const profileContainer = document.getElementById('profile-container');
    setHeader('Профиль', `ул. Вахова, д. ${data.address.building}, кв. ${data.address.apartment}`);
    const emailText = data.user.email || 'не указан';
    const emailButtonText = data.user.email ? 'Изменить Email' : 'Добавить Email';
    let profileHTML = `<div class="profile-section">
            <p><strong>Логин:</strong> ${data.user.login}</p>
            <p><strong>Email:</strong> ${emailText}</p>
            <p><strong>Лицевой счет:</strong> <code>${data.address.account_number}</code></p>
        </div><div class="history-section"><h3>📜 Информация по счетчикам</h3>`;
    if (data.meters.length > 0) {
        data.meters.forEach(meter => {
            const lastReadingStr = meter.last_reading.toFixed(3).replace('.', ',');
            const currentReadingStr = meter.current_reading !== null ? `<b>${meter.current_reading.toFixed(3).replace('.', ',')}</b>` : '-';
            const consumption = meter.current_reading !== null ? `${(meter.current_reading - meter.last_reading).toFixed(3).replace('.', ',')} м³` : '-';
            profileHTML += `<div class="meter-card"><h4>${meter.meter_type === 'ГВС' ? '🔥' : '❄️'} ${meter.meter_type} (№ ${meter.factory_number})</h4>
                <p><strong>Дата поверки:</strong> ${meter.checkup_date}</p>
                <p><strong>Показания (прошлый месяц) от ${meter.initial_reading_date}:</strong> <code>${lastReadingStr}</code></p>
                <p><strong>Показания (текущий месяц):</strong> <code>${currentReadingStr}</code></p>
                <p><strong>Расход за текущий период:</strong> <code>${consumption}</code></p></div>`;
        });
    } else { profileHTML += `<p>Счетчики не найдены.</p>`; }
    profileHTML += `</div>
        <div class="button-grid" style="gap: 15px;">
            <button class="grid-button" onclick="openEmailModal()">${emailButtonText}</button>
            <button class="full-width-button" onclick="handleResetClick()" style="background-color: #d9534f;">❌ Сменить квартиру</button>
        </div>`;
    profileContainer.innerHTML = profileHTML;
}
function openEmailModal() {
    document.getElementById('modal-input').value = appState.userData.user.email || '';
    document.getElementById('modal-overlay').classList.remove('hidden');
}
function closeModal() { document.getElementById('modal-overlay').classList.add('hidden'); }
async function submitModal() {
    const emailInput = document.getElementById('modal-input');
    const newEmail = emailInput.value.trim() || null; // Если поле пустое, отправляем null

    if (newEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
        tg.showAlert('Неверный формат Email.'); 
        return;
    }

    // Показываем индикатор загрузки на кнопке, а не стираем контент
    const confirmButton = document.querySelector('.modal-button-confirm');
    const originalButtonText = confirmButton.textContent;
    confirmButton.textContent = 'Сохранение...';
    confirmButton.disabled = true;

    try {
        await apiFetch('/api/update-email', { method: 'POST', body: JSON.stringify({ email: newEmail }) });
        
        // Обновляем email в локальном состоянии
        appState.userData.user.email = newEmail;

        tg.HapticFeedback.notificationOccurred('success');
        tg.showAlert('Email успешно обновлен!');
        
        closeModal();
        renderProfilePage(appState.userData); // Перерисовываем профиль с новыми данными

    } catch (error) { 
        tg.showAlert(`❌ Ошибка: ${error.message}`);
    } finally {
        // Возвращаем кнопку в исходное состояние
        confirmButton.textContent = originalButtonText;
        confirmButton.disabled = false;
    }
}
function handleResetClick() {
    tg.showConfirm("Вы уверены, что хотите сменить квартиру?", async (ok) => {
        if (!ok) return;
        showLoader();
        try {
            await apiFetch('/api/reset-registration', { method: 'POST' });
            tg.HapticFeedback.notificationOccurred('success');
            tg.showAlert('Регистрация сброшена. Приложение будет перезагружено.', () => location.reload());
        } catch (error) { tg.showAlert(`❌ Ошибка: ${error.message}`); }
    });
}

// --- Вспомогательные функции ---
function setHeader(t, a) { document.getElementById('header-title').textContent = t; document.getElementById('header-address').textContent = a; }
function showLoader() { document.querySelectorAll('.page').forEach(p => p.classList.remove('active')); document.getElementById('loader-container').classList.add('active'); tg.MainButton.hide(); }
function hideLoader() { document.getElementById('loader-container').classList.remove('active'); }
function handleError(m) { hideLoader(); const c = document.getElementById('error-container'); c.classList.add('active'); c.innerHTML = `<p style="text-align: center; color: red;">${m}</p>`; tg.MainButton.hide(); }
