/* Отправка заявки из формы «Заказать демо» в amoCRM через Cloudflare Worker-прокси.
   Секретный токен amoCRM живёт только в воркере (Cloudflare secret), в клиент не попадает.
   Экспортирует window.alterSubmitLead(formEl) -> Promise. */
(function () {
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
    });
  };
})();
