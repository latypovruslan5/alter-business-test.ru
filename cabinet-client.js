/* Личный кабинет лида: гейт скачивания материалов, вход по коду, профиль, события.
   Работает поверх Cloudflare Worker (см. worker/README.md). Паттерн как у crm-submit.js:
   подключается <script src> в <head>, вне снапшота #dc-root — пререндер не требуется.

   Экспортирует window.AlterCabinet (api, gate, track, getToken...) и window.ALTER_MATERIALS.
   Демо-режим почты: /api/request-code возвращает demoCode — показываем его в плашке. */
(function () {
  // Защита от повторного исполнения: dc-рантайм может исполнить helmet-скрипт
  // дважды, а второй экземпляр вешал бы второй document-обработчик (двойные модалки).
  if (window.AlterCabinet) return;
  var IS_LOCAL = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  // URL воркера. После деплоя вписать реальный адрес workers.dev (как в crm-submit.js).
  var ENDPOINT = window.ALTER_CAB_ENDPOINT ||
    (IS_LOCAL ? 'http://127.0.0.1:8787' : 'https://alter-crm.alter-b2b.workers.dev');

  var TOKEN_KEY = 'alter_cab_token';

  /* ---------- Каталог материалов (единый источник для гейта и кабинета) ----------
     status: ready   — файл существует, отдаем сразу;
             soon    — карточка «скоро», материал закрепляется за лидом;
             request — файла нет, запрос уходит менеджеру (сигнал интереса). */
  var MATERIALS = {
    'ubedit-rukovodstvo': { title: 'Гайд «Как убедить руководство подключить корпоративную психотерапию»', type: 'Гайд', topic: 'ROI', status: 'ready', file: 'assets/materials/gaid-kak-ubedit-rukovodstvo.pdf' },
    'calc-xlsx': { title: 'Калькулятор бюджета программы поддержки (Excel)', type: 'Калькулятор', topic: 'ROI', status: 'ready', file: 'assets/materials/kalkulyator-byudzheta-alter.xlsx' },
    'criteria-table': { title: 'Таблица с критериями выбора сервиса психотерапии', type: 'Таблица', topic: 'Культура', status: 'soon' },
    '1': { title: 'Признаки выгорания в команде', type: 'Чек-лист', topic: 'Выгорание', status: 'soon' },
    '2': { title: 'Как поддержать сотрудника в кризис', type: 'Гайд', topic: 'Лидерство', status: 'soon' },
    '3': { title: 'Исследование Alter & HeadHunter «Психологическое здоровье сотрудников в России 2025»', type: 'Исследование', topic: 'Культура', status: 'request' },
    '4': { title: 'Экологичная обратная связь', type: 'Чек-лист', topic: 'Культура', status: 'soon' },
    '5': { title: 'Профилактика конфликтов в коллективе', type: 'Гайд', topic: 'Лидерство', status: 'soon' },
    '8': { title: 'Онбординг без стресса', type: 'Гайд', topic: 'Онбординг', status: 'soon' },
    '9': { title: 'Тревожность и продуктивность', type: 'Исследование', topic: 'Стресс и тревога', status: 'soon' },
    '11': { title: 'Готова ли компания к well-being программе', type: 'Чек-лист', topic: 'Культура', status: 'soon' },
    '13': { title: 'Выгорание в IT: масштаб проблемы', type: 'Исследование', topic: 'Выгорание', status: 'soon' }
  };

  /* ---------- Отрасли и кейсы ----------
     Слаги отраслей — копия белого списка воркера (INDUSTRY_LABELS).
     Маппинг кейсов на отрасли черновой — согласовать с продуктом. */

  var INDUSTRIES = {
    it: 'IT и разработка',
    retail: 'Ритейл и e-com',
    gamedev: 'Геймдев',
    horeca: 'HoReCa и сервис',
    fin: 'Финансы и финтех',
    media: 'Медиа и креатив',
    gov: 'Госсектор и образование',
    other: 'Другое'
  };

  var CASES = {
    'selectel': { company: 'Selectel', quote: '«Сотрудники находят поддержку у компетентных психологов Alter в любой трудный для них момент».', href: 'keys-selectel.dc.html', industries: ['it'] },
    'custis': { company: 'CUSTIS', quote: '«Alter пользуется большой популярностью среди наших сотрудников».', href: 'keys-custis.dc.html', industries: ['it', 'gov'] },
    'oggetto': { company: 'Oggetto', quote: '«Выбрали Alter за тщательный подбор психологов и гибкость условий сотрудничества».', href: 'keys-oggetto.dc.html', industries: ['it'] },
    'x5': { company: 'X5 Digital', quote: '«В нашей компании забота о ментальном здоровье коллег — важный поинт на карте корпоративной культуры».', href: 'keys-x5.dc.html', industries: ['retail', 'fin', 'other'] },
    'dodo': { company: 'Додо Пицца', quote: '«Додо стала первой в России компанией, которая запустила психологическую поддержку для 22 000 сотрудников».', href: 'keys-dodo.dc.html', industries: ['horeca', 'retail', 'other'] },
    'azur': { company: 'Azur Games', quote: '«Сотрудники стали всё больше обращаться к сервису».', href: 'keys-azur-games.dc.html', industries: ['gamedev'] },
    'pikcher': { company: 'Пикчер', quote: '«Для нас это не просто HR-инструмент, а способ сохранить эмоциональное здоровье команды в сложные времена».', href: 'keys-pikcher.dc.html', industries: ['gamedev', 'media'] },
    'fistashki': { company: 'Fistashki', quote: '«Текучесть за год снизилась на 35%. Считаю, это одна из лучших инвестиций в нашу команду».', href: 'keys-fistashki.dc.html', industries: ['horeca', 'media'] },
    'koshelek': { company: 'Кошелёк', quote: '«Команда на 20% стала спокойнее, выгорать стали меньше».', href: 'keys-koshelek.dc.html', industries: ['fin'] },
    'yanao': { company: 'Институт управления Правительства ЯНАО', quote: '«Получаем много благодарностей со стороны наших коллег».', href: 'keys-yanao.dc.html', industries: ['gov'] },
    'revolt': { company: 'Револьт-центр', quote: '«Психотерапия — один из самых эффективных путей начать работать над собой».', href: 'keys-revolt-centr.dc.html', industries: ['media', 'gov'] }
  };

  /* ---------- API-клиент ---------- */

  function getToken() { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (_) { return ''; } }
  function setToken(t) { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch (_) {} }

  function api(path, body) {
    return fetch(ENDPOINT + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    }).then(function (res) {
      return res.json().then(function (data) {
        if (res.status === 401) { setToken(''); }
        if (!res.ok && !data) throw new Error('HTTP ' + res.status);
        return data;
      });
    });
  }

  function track(event, meta) {
    var token = getToken();
    if (!token) return Promise.resolve({ ok: false });
    return api('/api/track', { token: token, event: event, meta: meta || null }).catch(function () { return { ok: false }; });
  }

  /* ---------- Память ROI-расчета ----------
     Расчет сохраняется в профиль (воркер пересчитывает цифры сам). Без сессии —
     черновик в localStorage, подтянется после первого входа (syncRoiDraft). */

  var ROI_DRAFT_KEY = 'alter_cab_roi_draft';

  function saveRoi(inputs) {
    try { localStorage.setItem(ROI_DRAFT_KEY, JSON.stringify({ inputs: inputs, t: Date.now() })); } catch (_) {}
    if (!getToken()) return Promise.resolve({ ok: false });
    return track('roi_saved', inputs).then(function (r) {
      if (r && r.ok) { try { localStorage.removeItem(ROI_DRAFT_KEY); } catch (_) {} }
      return r;
    });
  }

  function syncRoiDraft() {
    if (!getToken()) return;
    var raw = null;
    try { raw = localStorage.getItem(ROI_DRAFT_KEY); } catch (_) {}
    if (!raw) return;
    var draft = null;
    try { draft = JSON.parse(raw); } catch (_) {}
    if (!draft || !draft.inputs) {
      try { localStorage.removeItem(ROI_DRAFT_KEY); } catch (_) {}
      return;
    }
    track('roi_saved', draft.inputs).then(function (r) {
      if (r && r.ok) { try { localStorage.removeItem(ROI_DRAFT_KEY); } catch (_) {} }
    });
  }

  /* ---------- Лента рекомендаций (правила, без ML) ---------- */

  function buildFeed(profile) {
    var unlocked = profile.unlocked || [];
    var events = profile.events || [];
    var topicScore = {};
    unlocked.forEach(function (id) {
      var m = MATERIALS[id];
      if (m && m.topic) topicScore[m.topic] = (topicScore[m.topic] || 0) + 1;
    });
    // Проблемные темы из мини-диагностики весят сильнее поведенческого скоринга.
    var md = profile.miniDiag || null;
    if (md && md.topics) {
      md.topics.forEach(function (t) { topicScore[t] = (topicScore[t] || 0) + 2; });
    }

    var items = Object.keys(MATERIALS)
      .filter(function (id) { return unlocked.indexOf(id) === -1; })
      .map(function (id) {
        var m = MATERIALS[id];
        return { id: id, title: m.title, type: m.type, topic: m.topic, status: m.status, file: m.file || null, score: (topicScore[m.topic] || 0) * 10 + (m.status === 'ready' ? 5 : 0) + (m.status === 'request' ? 2 : 0) };
      })
      .sort(function (a, b) { return b.score - a.score; })
      .slice(0, 6);

    // Кейсы по отрасли: до 2 карточек в топ ленты; уже открытые не повторяем.
    var industry = profile.industry || '';
    if (industry && INDUSTRIES[industry]) {
      var openedCases = {};
      events.forEach(function (e) { if (e.type === 'case_opened' && e.meta && e.meta.id) openedCases[e.meta.id] = 1; });
      var caseItems = Object.keys(CASES)
        .filter(function (id) { return CASES[id].industries.indexOf(industry) !== -1 && !openedCases[id]; })
        .slice(0, 2)
        .map(function (id) {
          var c = CASES[id];
          return { id: 'case-' + id, kind: 'case', caseId: id, title: c.quote, company: c.company, type: 'Кейс', topic: c.company, status: 'case', file: null, href: c.href, score: 0 };
        });
      if (caseItems.length) items = caseItems.concat(items).slice(0, 6);
    }

    var usedCalc = events.some(function (e) { return e.type === 'calculator_used'; }) || unlocked.indexOf('calc-xlsx') !== -1;
    var size = String(profile.companySize || '');
    var isSmall = size.indexOf('50–200') === 0 || size.indexOf('50-200') === 0;

    return {
      items: items,
      showPilot: usedCalc,
      pushDiagnostic: !isSmall,
      diagnosticDone: events.some(function (e) { return e.type === 'diagnostic_requested'; }),
      consultDone: events.some(function (e) { return e.type === 'consult_requested'; })
    };
  }

  /* ---------- Гейт-модалка ---------- */

  var FONT = "font-family:'Futura PT', 'Helvetica Neue', Arial, sans-serif;";
  var INPUT_STYLE = FONT + 'font-size:16px; padding:14px 16px; border:1px solid #DCE5DF; border-radius:12px; outline:none; color:#282C3E; background:#fff; width:100%; box-sizing:border-box;';
  var BTN_STYLE = FONT + 'font-weight:700; font-size:16px; color:#fff; background:#29B981; border:none; padding:15px 20px; border-radius:40px; cursor:pointer; width:100%; box-shadow:0 8px 20px rgba(41,185,129,0.3);';
  var LINK_BTN = FONT + 'font-size:14px; color:#239266; background:none; border:none; cursor:pointer; text-decoration:underline; text-underline-offset:3px; padding:0;';

  var modalEl = null;

  function closeModal() {
    if (modalEl) { modalEl.remove(); modalEl = null; document.body.style.overflow = ''; }
  }

  function openModal(innerHTML) {
    closeModal();
    modalEl = document.createElement('div');
    modalEl.setAttribute('data-cabinet-modal', '1');
    modalEl.style.cssText = 'position:fixed; inset:0; z-index:9000; display:flex; align-items:center; justify-content:center; padding:20px; background:rgba(40,44,62,0.5); backdrop-filter:blur(4px);';
    modalEl.innerHTML =
      '<div style="' + FONT + 'position:relative; background:#fff; border-radius:22px; max-width:440px; width:100%; max-height:92vh; overflow-y:auto; padding:34px 30px 30px; box-shadow:0 24px 60px rgba(40,44,62,0.25);">' +
      '<button data-cab-close style="position:absolute; top:14px; right:14px; width:36px; height:36px; border-radius:50%; border:none; background:#F1F5F2; color:#3A3F58; font-size:16px; cursor:pointer;">✕</button>' +
      innerHTML + '</div>';
    document.body.appendChild(modalEl);
    document.body.style.overflow = 'hidden';
    modalEl.addEventListener('click', function (e) {
      if (e.target === modalEl || e.target.closest('[data-cab-close]')) closeModal();
    });
    return modalEl.firstElementChild;
  }

  function h3(text) { return '<h3 style="' + FONT + 'font-weight:700; font-size:23px; line-height:1.25; color:#282C3E; margin:0 0 8px;">' + text + '</h3>'; }
  function pMuted(text) { return '<p style="font-size:14.5px; line-height:1.5; color:#6A7088; margin:0 0 18px;">' + text + '</p>'; }

  function successBox(title, text, extraHTML) {
    return '<div style="text-align:center; padding:8px 0 2px;">' +
      '<div style="width:56px; height:56px; border-radius:50%; background:#29B981; color:#fff; font-size:26px; display:flex; align-items:center; justify-content:center; margin:0 auto 16px;">✓</div>' +
      '<h3 style="' + FONT + 'font-weight:700; font-size:22px; color:#282C3E; margin:0 0 8px;">' + title + '</h3>' +
      '<p style="font-size:15px; line-height:1.5; color:#6A7088; margin:0 0 20px;">' + text + '</p>' +
      (extraHTML || '') +
      '<a href="kabinet.dc.html" style="' + FONT + 'display:inline-block; font-weight:700; font-size:16px; color:#fff; background:#29B981; padding:14px 28px; border-radius:40px; text-decoration:none; box-shadow:0 8px 20px rgba(41,185,129,0.3);">Перейти в личный кабинет →</a></div>';
  }

  function deliver(materialId) {
    var m = MATERIALS[materialId];
    if (m && m.status === 'ready' && m.file) {
      // Открываем файл в новой вкладке; ссылка остается и в кабинете.
      window.open(m.file, '_blank');
      return successBox('Материал открыт', 'Если вкладка не открылась — <a href="' + m.file + '" target="_blank" style="color:#239266;">скачать напрямую</a>.<br/>Все ваши материалы теперь живут в личном кабинете.');
    }
    if (m && m.status === 'request') {
      return successBox('Запрос принят', 'Менеджер Alter пришлет материал на вашу почту в течение рабочего дня.');
    }
    return successBox('Материал закреплен за вами', 'Он появится в вашем личном кабинете, как только будет готов. А пока там уже есть другие полезные материалы.');
  }

  function gateFormHTML(m) {
    return h3('Получить «' + m.title + '»') +
      pMuted('Оставьте контакты один раз — все материалы будут доступны в вашем личном кабинете без повторных форм.') +
      '<form data-cab-register style="display:flex; flex-direction:column; gap:11px;">' +
      '<input name="name" type="text" required placeholder="Имя" style="' + INPUT_STYLE + '"/>' +
      '<input name="email" type="email" required placeholder="Рабочая почта" style="' + INPUT_STYLE + '"/>' +
      '<input name="company" type="text" placeholder="Название компании" style="' + INPUT_STYLE + '"/>' +
      '<select name="companySize" style="' + INPUT_STYLE + 'color:#6A7088;">' +
      '<option value="">Размер компании</option><option>50–200 сотрудников</option><option>200–500 сотрудников</option><option>500–1000 сотрудников</option><option>более 1000 сотрудников</option></select>' +
      '<select name="industry" style="' + INPUT_STYLE + 'color:#6A7088;">' +
      '<option value="">Отрасль компании (необязательно)</option>' +
      Object.keys(INDUSTRIES).map(function (k) { return '<option value="' + k + '">' + INDUSTRIES[k] + '</option>'; }).join('') +
      '</select>' +
      '<p style="font-size:12.5px; line-height:1.5; color:#8A90A6; margin:2px 0 0;">Нажимая «Получить», вы принимаете условия <span style="text-decoration:underline;">пользовательского соглашения</span>, даете согласие на обработку <span style="text-decoration:underline;">персональных данных</span> и на получение рекламно-информационной рассылки.</p>' +
      '<button type="submit" style="' + BTN_STYLE + 'margin-top:4px;">Получить</button>' +
      '<div style="text-align:center; margin-top:6px;"><button type="button" data-cab-tologin style="' + LINK_BTN + '">Уже были у нас? Войти по коду</button></div>' +
      '<div data-cab-error style="display:none; font-size:14px; color:#C0392B; text-align:center;"></div></form>';
  }

  function loginFormHTML(prefillEmail) {
    return h3('Вход в личный кабинет') +
      pMuted('Введите почту, которую оставляли раньше, — пришлем 6-значный код для входа.') +
      '<form data-cab-login style="display:flex; flex-direction:column; gap:11px;">' +
      '<input name="email" type="email" required placeholder="Почта" value="' + (prefillEmail || '') + '" style="' + INPUT_STYLE + '"/>' +
      '<div data-cab-codeblock style="display:none; flex-direction:column; gap:11px;">' +
      '<div data-cab-demobox style="display:none; background:#FFF7E6; border:1px solid #F0DCAF; border-radius:12px; padding:12px 14px; font-size:13.5px; line-height:1.5; color:#8A6D2F;"></div>' +
      '<input name="code" type="text" inputmode="numeric" maxlength="6" placeholder="Код из письма" style="' + INPUT_STYLE + 'letter-spacing:4px; text-align:center;"/></div>' +
      '<button type="submit" data-cab-loginbtn style="' + BTN_STYLE + '">Получить код</button>' +
      '<div style="text-align:center; margin-top:6px;"><button type="button" data-cab-toregister style="' + LINK_BTN + '">Впервые у нас? Получить материал</button></div>' +
      '<div data-cab-error style="display:none; font-size:14px; color:#C0392B; text-align:center;"></div></form>';
  }

  function showError(box, msg) {
    var el = box.querySelector('[data-cab-error]');
    if (el) { el.style.display = 'block'; el.textContent = msg; }
  }

  var ERRORS = {
    not_registered: 'Эта почта нам не знакома. Получите первый материал — кабинет создастся автоматически.',
    code_expired: 'Код истек. Запросите новый.',
    wrong_code: 'Неверный код. Проверьте и попробуйте еще раз.',
    too_many_attempts: 'Слишком много попыток. Запросите новый код.'
  };

  function wireGate(box, materialId, afterAuth) {
    var m = MATERIALS[materialId] || { title: 'материал', topic: '', status: 'soon' };

    function showRegister() {
      box.querySelector('[data-cab-body]').innerHTML = gateFormHTML(m);
      var form = box.querySelector('[data-cab-register]');
      box.querySelector('[data-cab-tologin]').addEventListener('click', showLogin);
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var f = form.elements;
        api('/api/register', {
          name: f.name.value.trim(), email: f.email.value.trim(),
          company: f.company.value.trim(), companySize: f.companySize.value,
          industry: f.industry ? f.industry.value : '',
          materialId: materialId, materialTitle: m.title, topic: m.topic, page: location.pathname
        }).then(function (r) {
          if (!r.ok) throw new Error(r.error || 'register failed');
          setToken(r.token);
          syncRoiDraft();
          box.querySelector('[data-cab-body]').innerHTML = deliver(materialId);
          renderChip();
          if (afterAuth) afterAuth(r.profile);
        }).catch(function () {
          showError(box, 'Не получилось отправить. Попробуйте позже или напишите на business@alter.ru.');
        });
      });
    }

    function showLogin() {
      box.querySelector('[data-cab-body]').innerHTML = loginFormHTML('');
      var form = box.querySelector('[data-cab-login]');
      var codeSent = false;
      box.querySelector('[data-cab-toregister]').addEventListener('click', showRegister);
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var email = form.elements.email.value.trim();
        if (!codeSent) {
          api('/api/request-code', { email: email }).then(function (r) {
            if (!r.ok) throw new Error(r.error || 'code failed');
            codeSent = true;
            form.querySelector('[data-cab-codeblock]').style.display = 'flex';
            form.querySelector('[data-cab-loginbtn]').textContent = 'Войти';
            if (r.demoCode) {
              var db = form.querySelector('[data-cab-demobox]');
              db.style.display = 'block';
              db.innerHTML = '<b>Демо-режим:</b> письмо не отправляется. Ваш код: <b style="letter-spacing:2px;">' + r.demoCode + '</b>';
            }
            form.elements.code.focus();
          }).catch(function (err) {
            showError(box, ERRORS[err.message] || 'Не получилось запросить код. Попробуйте позже.');
          });
        } else {
          api('/api/verify-code', { email: email, code: form.elements.code.value.trim() }).then(function (r) {
            if (!r.ok) throw new Error(r.error || 'verify failed');
            setToken(r.token);
            syncRoiDraft();
            renderChip();
            if (materialId) {
              api('/api/unlock', { token: r.token, materialId: materialId, materialTitle: m.title, topic: m.topic }).catch(function () {});
              box.querySelector('[data-cab-body]').innerHTML = deliver(materialId);
            } else {
              location.href = 'kabinet.dc.html';
            }
            if (afterAuth) afterAuth(r.profile);
          }).catch(function (err) {
            showError(box, ERRORS[err.message] || 'Не получилось войти. Попробуйте позже.');
          });
        }
      });
    }

    if (materialId) showRegister(); else showLogin();
    return { showRegister: showRegister, showLogin: showLogin };
  }

  /* Точка входа гейта: клик по материалу. Если сессия уже есть — без формы. */
  function gate(materialId, afterAuth) {
    var m = MATERIALS[materialId] || { title: 'материал', topic: '', status: 'soon' };
    var token = getToken();
    var box = openModal('<div data-cab-body></div>');

    if (token) {
      box.querySelector('[data-cab-body]').innerHTML = '<p style="font-size:15px; color:#6A7088; margin:8px 0;">Открываем…</p>';
      api('/api/unlock', { token: token, materialId: materialId, materialTitle: m.title, topic: m.topic })
        .then(function (r) {
          if (!r.ok) throw new Error(r.error || 'unlock failed');
          box.querySelector('[data-cab-body]').innerHTML = deliver(materialId);
          if (afterAuth) afterAuth(r.profile);
        })
        .catch(function () {
          // Сессия истекла — обычный сценарий гейта.
          setToken('');
          wireGate(box, materialId, afterAuth);
        });
    } else {
      wireGate(box, materialId, afterAuth);
    }
  }

  /* Модалка входа без материала (для страницы кабинета и плашки). */
  function loginModal() {
    var box = openModal('<div data-cab-body></div>');
    wireGate(box, null, null);
  }

  /* ---------- Плашка «Личный кабинет» ---------- */

  function renderChip() {
    if (/kabinet\.dc\.html$/i.test(location.pathname)) return;
    if (!getToken()) return;
    if (document.querySelector('[data-cab-chip]')) return;
    var a = document.createElement('a');
    a.setAttribute('data-cab-chip', '1');
    a.href = 'kabinet.dc.html';
    a.style.cssText = FONT + 'position:fixed; right:22px; bottom:22px; z-index:8000; display:flex; align-items:center; gap:9px; background:#282C3E; color:#fff; font-weight:700; font-size:14.5px; padding:13px 20px; border-radius:44px; text-decoration:none; box-shadow:0 12px 30px rgba(40,44,62,0.35);';
    a.innerHTML = '<span style="width:9px; height:9px; border-radius:50%; background:#29B981; flex:0 0 auto;"></span>Личный кабинет';
    document.body.appendChild(a);
  }

  /* ---------- Делегированный клик по гейченным ссылкам ---------- */

  document.addEventListener('click', function (e) {
    var a = e.target.closest ? e.target.closest('[data-mat-id]') : null;
    if (!a) return;
    e.preventDefault();
    gate(String(a.getAttribute('data-mat-id')));
  });

  /* ---------- Трекинг калькулятора ROI ---------- */

  function wireRoiTracking() {
    if (!/roi\.dc\.html$/i.test(location.pathname)) return;
    var fired = false;
    function onTouch() {
      if (fired || !getToken()) return;
      try { if (sessionStorage.getItem('alter_cab_roi_tracked')) return; } catch (_) {}
      fired = true;
      try { sessionStorage.setItem('alter_cab_roi_tracked', '1'); } catch (_) {}
      track('calculator_used', { title: 'Калькулятор ROI' });
    }
    document.addEventListener('input', onTouch, true);
    document.addEventListener('change', onTouch, true);
  }

  /* ---------- Экспорт и инициализация ---------- */

  window.ALTER_MATERIALS = MATERIALS;
  window.ALTER_INDUSTRIES = INDUSTRIES;
  window.ALTER_CASES = CASES;
  window.AlterCabinet = {
    endpoint: ENDPOINT,
    getToken: getToken,
    setToken: setToken,
    api: api,
    track: track,
    saveRoi: saveRoi,
    gate: gate,
    loginModal: loginModal,
    buildFeed: buildFeed,
    logout: function () { setToken(''); var c = document.querySelector('[data-cab-chip]'); if (c) c.remove(); },
    me: function () {
      var token = getToken();
      if (!token) return Promise.resolve(null);
      return api('/api/me', { token: token }).then(function (r) { return r.ok ? r.profile : null; }).catch(function () { return null; });
    }
  };

  function init() { renderChip(); wireRoiTracking(); syncRoiDraft(); }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
