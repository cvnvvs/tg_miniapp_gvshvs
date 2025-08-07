const API_BASE_URL = 'https://site.cvnvvs.ru'; 

const tg = window.Telegram.WebApp;

let appState = { userData: null, regData: {} };

async function apiFetch(endpoint, options = {}) {
    const isPrivate = options.private !== false;
    const headers = { 'Content-Type': 'application/json'};
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
    apiFetch('/api/get-profile')
        .then(data => {
            appState.userData = data;
            showPage('profile');
        })
        .catch(() => showPage('register'));
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
    document.getElementById('register-container').innerHTML = `
      <div class="form-step">
        <p>Выберите ваше строение:</p>
        <div class="button-grid" style="grid-template-columns: repeat(3, 1fr);">
          <button class="grid-button" onclick="handleBuildingSelect('8В')">8В</button>
          <button class="grid-button" onclick="handleBuildingSelect('8Г')">8Г</button>
          <button class="grid-button" onclick="handleBuildingSelect('8Д')">8Д</button>
        </div>
      </div>`;
}


function handleBuildingSelect(building) {
    appState.regData.building = building;
    setHeader('Регистрация', 'Шаг 2: Номер квартиры');
    document.getElementById('register-container').innerHTML = `
      <div class="form-step">
        <p>Строение <b>${building}</b>. Введите номер квартиры:</p>
        <input type="text" id="apartment-input" placeholder="45, 1а, 12б," inputmode="text">
      </div>`;
    tg.MainButton.setText('Далее').show().onClick(handleApartmentSubmit);
}

async function handleApartmentSubmit() {
    const apartment = document.getElementById('apartment-input').value.trim();
    if (!apartment || apartment.length > 6) {
        tg.showAlert('Введите корректный номер квартиры (до 5 символов).');
        return;
    }
    appState.regData.apartment = apartment;
    tg.MainButton.showProgress().disable();
    try {
        await apiFetch('/api/check-address', {
            method: 'POST',
            body: JSON.stringify(appState.regData),
            private: false
        });
        renderAccountStep();
    } catch (error) {
        tg.showAlert(error.message);
    } finally {
        tg.MainButton.hideProgress().enable();
    }
}

function renderAccountStep() {
    setHeader('Регистрация', 'Шаг 3: Верификация');
    document.getElementById('register-container').innerHTML = `
      <div class="form-step">
         <p>Адрес найден! Введите ваш <b>лицевой счет</b>.</p>
        <input type="number" id="account-input" placeholder="00000" inputmode="numeric">
      </div>`;
    tg.BackButton.show().onClick(handleBuildingSelect.bind(null, appState.regData.building));
    tg.MainButton.offClick(handleApartmentSubmit).onClick(handleAccountSubmit);
}

function handleAccountSubmit() {
    const account = document.getElementById('account-input').value.trim();
    if (!account || !/^\d{5,6}$/.test(account)) {
        tg.showAlert('Лицевой счет должен содержать 5-6 цифр.');
        return;
    }
    appState.regData.account = account;
    renderContactsStep();
}

function applyPhoneMask(phoneInput) {
    phoneInput.addEventListener('input', (e) => {
        let value = e.target.value.replace(/\D/g, '');
        if (!value) { e.target.value = ''; return; }
        if (value.startsWith('7') || value.startsWith('8')) value = value.slice(1);
        let formatted = '+7 (';
        if (value.length > 0) formatted += value.slice(0, 3);
        if (value.length >= 4) formatted += ') ' + value.slice(3, 6);
        if (value.length >= 7) formatted += '-' + value.slice(6, 8);
        if (value.length >= 9) formatted += '-' + value.slice(8, 10);
        e.target.value = formatted;
    });
}

function renderContactsStep() {
    setHeader('Регистрация', 'Шаг 4: Контакты (необязательно)');
    document.getElementById('register-container').innerHTML = `
      <div class="form-step">
        <p>Email:</p>
        <input type="email" id="email-input" placeholder="user@example.com" inputmode="email" style="margin-bottom:15px;">
        <p>Номер телефона:</p>
        <input type="tel" id="phone-input" placeholder="+7 (___) ___-__-__" inputmode="tel">
        <div class="button-grid" style="margin-top:20px;">
          <button class="grid-button" onclick="handleContactsSubmit(true)">Пропустить</button>
        </div>
      </div>`;
    applyPhoneMask(document.getElementById('phone-input'));
    tg.MainButton.setText('Подтвердить и далее')
        .offClick(handleAccountSubmit)
        .onClick(() => handleContactsSubmit(false));
    tg.BackButton.show().onClick(renderAccountStep);
}

function handleContactsSubmit(isSkipped) {
    if (isSkipped) {
        appState.regData.email = null;
        appState.regData.phone = null;
        renderPolicyStep();
        return;
    }
    const email = document.getElementById('email-input').value.trim();
    const phone = document.getElementById('phone-input').value.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        tg.showAlert('Неверный формат Email.');
        return;
    }
    const digits = phone.replace(/\D/g, '');
    if (phone && digits.length !== 11) {
        tg.showAlert('Номер телефона должен быть введен полностью.');
        return;
    }
    appState.regData.email = email || null;
    appState.regData.phone = phone || null;
    renderPolicyStep();
}

function renderPolicyStep() {
    setHeader('Регистрация', 'Финальный шаг: Согласие');
    tg.MainButton.hide();
    tg.BackButton.show().onClick(renderContactsStep);
    const user = tg.initDataUnsafe.user;
    const userLogin = user.username ? `@${user.username}` : `ID: ${user.id}`;
    const fullAddress = `Краснодарский край, г. Краснодар, пер. Краснодарский, д. ${appState.regData.building}, кв. ${appState.regData.apartment}`;
    const policyText = `
        Я, ${userLogin}, являясь потребителем жилищно‑коммунальных услуг по адресу: ${fullAddress}, 
        прошу осуществить мою авторизацию в телеграм‑приложении «ГВС ХВС» с целью дачи показаний по счётчикам ГВС и ХВС.<br><br>
        Даю согласие на предоставление и обработку персональных данных Оператору по ведению взаиморасчетов 
        в соответствии с Федеральным законом от 27.07.2006г. № 152‑ФЗ «О персональных данных».<br><br>
        <b>Перечень персональных данных:</b><br>
        - Лицевой счет;<br>
        - Адрес;<br>
        - Номер контактного телефона и/или адрес электронной почты.<br><br>
        <b>Цель обработки:</b> надлежащее осуществление дачи показаний и оказание информационных услуг.<br><br>
        Согласие действует бессрочно, может быть отозвано письменным уведомлением в Абонентный отдел.
    `;
    document.getElementById('register-container').innerHTML = `
      <div class="form-step">
        <div style="text-align:left;font-size:14px;max-height:300px;overflow-y:auto;padding-right:10px;margin-bottom:20px;">
          ${policyText}
        </div>
        <div class="button-grid" style="gap:15px;">
          <button class="full-width-button" onclick="finalSubmit()">✅ Согласен и завершить</button>
          <button class="grid-button" onclick="handlePolicyDecline()">❌ Не согласен</button>
        </div>
      </div>`;
}

function handlePolicyDecline() {
    tg.showAlert("Вы отказались от согласия. Регистрация отменена.");
    renderRegistrationStep1();
}

async function finalSubmit() {
    tg.BackButton.hide().offClick();
    tg.MainButton.showProgress().disable();
    try {
        await apiFetch('/api/register', {
            method: 'POST',
            body: JSON.stringify(appState.regData)
        });
        tg.HapticFeedback.notificationOccurred('success');
        tg.showAlert('✅ Регистрация успешно завершена! Приложение будет перезагружено.', () => location.reload());
    } catch (error) {
        tg.showAlert(`❌ Ошибка: ${error.message}`);
        renderPolicyStep();
    } finally {
        tg.MainButton.hideProgress().enable();
    }
}

// --- Передача показаний ---
function renderReadingsPage(data) {
    hideLoader();
    if (!data) {
        handleError("Не удалось загрузить данные пользователя.");
        return;
    }
    setHeader('Передача показаний', `пер. Краснодарский, д. ${data.address.building}, кв. ${data.address.apartment}`);
    const metersContainer = document.getElementById('readings-container');
    if (!data.is_active_period) {
        metersContainer.innerHTML = `
          <div class="form-step">
            <p>📅 Прием показаний закрыт.<br>Доступно только с 20 по 25 число месяца.</p>
          </div>`;
        tg.MainButton.hide();
        return;
    }
    let metersHTML = '<div class="meters-grid">';
    if (data.meters.length === 0) {
        metersHTML = '<p>Счетчики не найдены.</p>';
    } else {
        data.meters
            .sort((a, b) => a.meter_type.localeCompare(b.meter_type) || a.id - b.id)
            .forEach(m => {
                const submitted = m.current_reading !== null;
                metersHTML += `
                  <button class="meter-button${submitted ? ' submitted' : ''}" onclick="renderSingleReadingInput(${m.id})">
                    <span class="meter-button-icon">${m.meter_type === 'ГВС' ? '🔥' : '❄️'}</span>
                    <div class="meter-button-text">
                      <span class="meter-button-type">${m.meter_type}</span>
                      <span class="meter-button-num">№ ${m.factory_number}</span>
                    </div>
                    ${submitted ? '<span class="checkmark">✅</span>' : ''}
                  </button>`;
            });
    }
    metersHTML += '</div>';
    metersContainer.innerHTML = metersHTML;
}

function renderSingleReadingInput(meterId) {
    document.getElementById('tab-bar').classList.add('hidden');
    const meter = appState.userData.meters.find(m => m.id === meterId);
    if (!meter) {
        handleError("Счетчик не найден");
        return;
    }
    tg.BackButton.show().onClick(() => showPage('readings'));
    setHeader('Ввод показаний', `${meter.meter_type} - № ${meter.factory_number}`);
    const container = document.getElementById('readings-container');
    const lastStr = meter.last_reading.toFixed(3).replace('.', ',');
    const [intPart, decPart] = meter.current_reading
        ? meter.current_reading.toFixed(3).split('.')
        : ['', ''];
    container.innerHTML = `
      <div class="form-step">
        <p>Показания за прошлый месяц: <code>${lastStr}</code></p>
        <p>Введите текущие показания:</p>
        <div class="readings-input-wrapper">
          <input type="number" id="reading-part1" class="readings-input-part" maxlength="5" placeholder="00000" value="${intPart}" oninput="limitLength(this,5); updateLiveInput();">
          <span class="readings-input-separator">,</span>
          <input type="number" id="reading-part2" class="readings-input-part" maxlength="3" placeholder="000" value="${decPart}" oninput="limitLength(this,3); updateLiveInput();">
        </div>
        <div class="consumption-info" id="consumption-live"></div>
        <p id="anomaly-warning" class="hidden" style="color:#ff8800;font-weight:bold;"></p>
      </div>`;
    window.limitLength = (el, max) => {
        if (el.value.length > max) el.value = el.value.slice(0, max);
    };
    window.updateLiveInput = () => {
        const p1 = document.getElementById('reading-part1').value;
        const p2 = document.getElementById('reading-part2').value;
        if (p1 && p2.length === 3) {
            const val = parseFloat(`${p1}.${p2}`);
            if (isNaN(val)) return;
            const cons = val - meter.last_reading;
            document.getElementById('consumption-live').textContent =
                `Расход: ${cons.toFixed(3).replace('.', ',')} м³`;
            const warnEl = document.getElementById('anomaly-warning');
            if (Math.abs(cons) > 500) {
                warnEl.textContent = 'ВНИМАНИЕ, БОЛЬШАЯ РАЗНИЦА В ПОКАЗАНИЯХ!';
                warnEl.classList.remove('hidden');
            } else {
                warnEl.classList.add('hidden');
            }
            tg.MainButton.setText('Сохранить').show().onClick(() => submitSingleReading(meter, val));
        } else {
            tg.MainButton.hide();
            document.getElementById('consumption-live').textContent = '';
            document.getElementById('anomaly-warning').classList.add('hidden');
        }
    };
    updateLiveInput();
}

async function submitSingleReading(meter, value) {
    tg.MainButton.showProgress().disable();
    tg.BackButton.hide().offClick();
    try {
        const payload = { readings: [{ meter_id: meter.id, value }] };
        await apiFetch('/api/submit-readings', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        tg.HapticFeedback.notificationOccurred('success');
        tg.showAlert('✅ Показания сохранены. Обновляем страницу...', () => location.reload());
    } catch (error) {
        tg.showAlert(`❌ Ошибка: ${error.message}`);
        tg.MainButton.hideProgress().enable();
        tg.BackButton.show().onClick(() => showPage('readings'));
    }
}

// --- Профиль и сброс ---
function renderProfilePage(data) {
    hideLoader();
    if (!data) {
        handleError("Не удалось загрузить данные пользователя.");
        return;
    }
    setHeader('Профиль', `пер. Краснодарский, д. ${data.address.building}, кв. ${data.address.apartment}`);
    const emailText = data.user.email || 'не указан';
    const phoneText = data.user.phone || 'не указан';
    const emailBtn = data.user.email ? 'Изменить Email' : 'Добавить Email';
    const phoneBtn = data.user.phone ? 'Изменить Телефон' : 'Добавить Телефон';
    let html = `
      <div class="profile-section">
        <p><strong>Логин:</strong> ${data.user.login}</p>
        <p><strong>Email:</strong> ${emailText}</p>
        <p><strong>Телефон:</strong> ${phoneText}</p>
        <p><strong>Лицевой счет:</strong> <code>${data.address.account_number}</code></p>
      </div>
      <div class="history-section"><h3>📜 Информация по счетчикам</h3>`;
    if (data.meters.length > 0) {
        data.meters.forEach(m => {
            const last = m.last_reading.toFixed(3).replace('.', ',');
            const curr = m.current_reading !== null
                ? `<b>${m.current_reading.toFixed(3).replace('.', ',')}</b>`
                : '-';
            const cons = m.current_reading !== null
                ? `${(m.current_reading - m.last_reading).toFixed(3).replace('.', ',')} м³`
                : '-';
            html += `
              <div class="meter-card">
                <h4>${m.meter_type === 'ГВС' ? '🔥' : '❄️'} ${m.meter_type} (№ ${m.factory_number})</h4>
                <p><strong>Дата поверки:</strong> ${m.checkup_date}</p>
                <p><strong>Показания (прошлый месяц):</strong> <code>${last}</code></p>
                <p><strong>Показания (текущий месяц):</strong> <code>${curr}</code></p>
                <p><strong>Расход за текущий период:</strong> <code>${cons}</code></p>
              </div>`;
        });
    } else {
        html += `<p>Счетчики не найдены.</p>`;
    }
    html += `
      </div>
      <div class="button-grid" style="gap:15px;grid-template-columns:1fr 1fr;">
        <button class="grid-button" onclick="openEmailModal()">${emailBtn}</button>
        <button class="grid-button" onclick="openPhoneModal()">${phoneBtn}</button>
        <button class="full-width-button" onclick="handleResetClick()" style="background-color:#d9534f;grid-column:1/-1;">
          ❌ Сменить квартиру
        </button>
      </div>`;
    document.getElementById('profile-container').innerHTML = html;
}

function closeModal() {
    document.getElementById('modal-overlay').classList.add('hidden');
}

function openEmailModal() {
    const modalInput = document.getElementById('modal-input');
    const newInput = modalInput.cloneNode(true);
    modalInput.parentNode.replaceChild(newInput, modalInput);
    document.getElementById('modal-title').textContent = 'Изменить Email';
    document.getElementById('modal-text').textContent = 'Введите новый email или оставьте поле пустым, чтобы удалить его.';
    newInput.type = 'email';
    newInput.placeholder = 'user@example.com';
    newInput.value = appState.userData.user.email || '';
    document.querySelector('.modal-button-confirm').onclick = submitEmailModal;
    document.getElementById('modal-overlay').classList.remove('hidden');
}

async function submitEmailModal() {
    const emailInput = document.getElementById('modal-input');
    const newEmail = emailInput.value.trim() || null;
    if (newEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
        tg.showAlert('Неверный формат Email.'); return;
    }
    const btn = document.querySelector('.modal-button-confirm');
    const orig = btn.textContent;
    btn.textContent = 'Сохранение...';
    btn.disabled = true;
    try {
        await apiFetch('/api/update-email', {
            method: 'POST',
            body: JSON.stringify({ email: newEmail })
        });
        appState.userData.user.email = newEmail;
        tg.HapticFeedback.notificationOccurred('success');
        tg.showAlert('Email успешно обновлен!');
        closeModal();
        renderProfilePage(appState.userData);
    } catch (error) {
        tg.showAlert(`❌ Ошибка: ${error.message}`);
    } finally {
        btn.textContent = orig;
        btn.disabled = false;
    }
}

function openPhoneModal() {
    const modalInput = document.getElementById('modal-input');
    const newInput = modalInput.cloneNode(true);
    modalInput.parentNode.replaceChild(newInput, modalInput);
    document.getElementById('modal-title').textContent = 'Изменить Телефон';
    document.getElementById('modal-text').textContent = 'Введите новый номер или оставьте поле пустым, чтобы удалить его.';
    newInput.type = 'tel';
    newInput.placeholder = '+7 (___) ___-__-__';
    newInput.value = appState.userData.user.phone || '';
    applyPhoneMask(newInput);
    document.querySelector('.modal-button-confirm').onclick = submitPhoneModal;
    document.getElementById('modal-overlay').classList.remove('hidden');
}

async function submitPhoneModal() {
    const phoneInput = document.getElementById('modal-input');
    const newPhone = phoneInput.value.trim() || null;
    const digits = newPhone ? newPhone.replace(/\D/g, '') : '';
    if (newPhone && digits.length !== 11) {
        tg.showAlert('Номер телефона должен состоять из 11 цифр.'); return;
    }
    const btn = document.querySelector('.modal-button-confirm');
    const orig = btn.textContent;
    btn.textContent = 'Сохранение...';
    btn.disabled = true;
    try {
        await apiFetch('/api/update-phone', {
            method: 'POST',
            body: JSON.stringify({ phone: newPhone })
        });
        appState.userData.user.phone = newPhone;
        tg.HapticFeedback.notificationOccurred('success');
        tg.showAlert('Телефон успешно обновлен!');
        closeModal();
        renderProfilePage(appState.userData);
    } catch (error) {
        tg.showAlert(`❌ Ошибка: ${error.message}`);
    } finally {
        btn.textContent = orig;
        btn.disabled = false;
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
        } catch (error) {
            tg.showAlert(`❌ Ошибка: ${error.message}`);
        }
    });
}

// --- Вспомогательные функции ---
function setHeader(title, addr) {
    document.getElementById('header-title').textContent = title;
    document.getElementById('header-address').textContent = addr;
}

function showLoader() {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('loader-container').classList.add('active');
    tg.MainButton.hide();
}

function hideLoader() {
    document.getElementById('loader-container').classList.remove('active');
}

function handleError(msg) {
    hideLoader();
    const err = document.getElementById('error-container');
    err.classList.add('active');
    err.innerHTML = `<p style="text-align:center;color:red;">${msg}</p>`;
    tg.MainButton.hide();
}
