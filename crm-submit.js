/* Отправка заявки из формы «Заказать демо» в amoCRM через Cloudflare Worker-прокси.
   Секретный токен amoCRM живёт только в воркере (Cloudflare secret), в клиент не попадает.
   Экспортирует window.alterSubmitLead(formEl) -> Promise. */
(function () {
  if (window.alterSubmitLead) return; // защита от повторного исполнения скрипта
  // URL развёрнутого Cloudflare Worker. После деплоя воркера подставить сюда его адрес.
  // Можно переопределить до загрузки страницы через window.ALTER_CRM_ENDPOINT.
  var ENDPOINT = window.ALTER_CRM_ENDPOINT || 'https://alter-crm.alter-b2b.workers.dev/';

  function val(el) { return el && el.value ? String(el.value).trim() : ''; }

  // Читаем 6 полей формы синхронно, в DOM-порядке:
  // Имя, Название компании, Телефон, Почта, «Где связаться», «Размер компании».
  function readForm(formEl) {
    var f = formEl.querySelectorAll('input, select');
    return {
      name: val(f[0]),
      company: val(f[1]),
      phone: val(f[2]),
      email: val(f[3]),
      contactMethod: val(f[4]),
      companySize: val(f[5]),
      page: location.pathname
    };
  }

  // Воркер создает личный кабинет при любой заявке и возвращает токен сессии.
  // Сохраняем его под тем же ключом, что и cabinet-client.js, — лид входит
  // в кабинет без повторных форм. Новому кабинету показываем плашку со ссылкой.
  var TOKEN_KEY = 'alter_cab_token';

  function cabinetToast() {
    if (document.getElementById('alter-cab-toast')) return;
    var box = document.createElement('div');
    box.id = 'alter-cab-toast';
    box.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:9999;' +
      'background:#282C3E;color:#fff;padding:14px 20px;border-radius:14px;' +
      'box-shadow:0 12px 32px rgba(40,44,62,.35);font-family:inherit;font-size:15px;' +
      'display:flex;align-items:center;gap:14px;max-width:92vw;';
    box.innerHTML = 'Мы создали вам личный кабинет — заявка и полезные материалы уже там. ' +
      '<a href="kabinet.dc.html" style="color:#7DE0B8;font-weight:700;white-space:nowrap;">Открыть кабинет</a>' +
      '<button type="button" aria-label="Закрыть" style="background:none;border:none;color:#9AA0B5;' +
      'font-size:18px;cursor:pointer;line-height:1;padding:0;">&times;</button>';
    box.querySelector('button').onclick = function () { box.remove(); };
    document.body.appendChild(box);
    setTimeout(function () { if (box.parentNode) box.remove(); }, 15000);
  }

  function handleCabinet(body) {
    if (!body || !body.token) return;
    try { localStorage.setItem(TOKEN_KEY, body.token); } catch (_) {}
    if (body.cabinetCreated) cabinetToast();
  }

  window.alterSubmitLead = function (formEl) {
    var payload;
    try {
      payload = readForm(formEl);
    } catch (err) {
      return Promise.reject(err);
    }
    return fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (res) {
      if (!res.ok) throw new Error('CRM submit failed: HTTP ' + res.status);
      return res.json().catch(function () { return { ok: true }; });
    }).then(function (body) {
      try { handleCabinet(body); } catch (_) {}
      return body;
    });
  };
})();
