// ВАЖНО: Перед запуском ngrok, вставьте сюда его HTTPS URL
const API_BASE_URL = 'https://your-ngrok-https-url.ngrok-free.app'; 

const tg = window.Telegram.WebApp;

document.addEventListener('DOMContentLoaded', () => {
    tg.ready();
    tg.expand(); // Раскрываем приложение на весь экран

    // Определяем, какую страницу загружать, по start_param
    const startParam = tg.initDataUnsafe.start_param;

    if (startParam === 'profile') {
        loadProfileData();
    } else {
        loadReadingsData();
    }
});

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

function setHeader(title, address) {
    document.getElementById('header-title').textContent = title;
    document.getElementById('header-address').textContent = address;
}

function showLoader() {
    document.getElementById('meters-container').innerHTML = '<div class="loader"></div>';
    document.getElementById('profile-container').classList.add('hidden');
    tg.MainButton.hide();
}

function handleError(message) {
    document.getElementById('meters-container').innerHTML = `<p style="text-align: center; color: red;">${message}</p>`;
    tg.MainButton.hide();
}