/* =========================================================
   SKLADAPLAN — КАРТОЧКА «История и аналитика»
   =========================================================

   Что делает:
   - Находит кнопки «Открыть журнал действий» и
     «Открыть аналитику», которые вставляют модули
     audit-log.js и analytics.js.
   - Создаёт для них общую карточку в стиле остальных
     карточек страницы «Данные» (заголовок, подзаголовок,
     нормальные отступы).
   - Перемещает кнопки внутрь карточки.

   Что НЕ делает:
   - Не трогает сами кнопки и их обработчики.
   - Не трогает audit-log.js и analytics.js.
   - Если что-то из этого модуля не подключено —
     просто ничего не произойдёт.
   ========================================================= */

(function () {
  'use strict';

  const CARD_ID = 'spDataToolsCard';
  const STYLES_ID = 'spDataToolsCardStyles';

  function injectStyles() {
    if (document.getElementById(STYLES_ID)) return;

    const style = document.createElement('style');
    style.id = STYLES_ID;
    style.textContent = `
      #${CARD_ID} {
        margin-bottom: 16px;
      }
      #${CARD_ID} h3 {
        margin: 0 0 4px;
        font-size: 16px;
        font-weight: 700;
        color: #0f172a;
      }
      #${CARD_ID} .sp-dt-sub {
        margin: 0 0 16px;
        font-size: 13px;
        color: #64748b;
        line-height: 1.4;
      }
      #${CARD_ID} .sp-dt-body {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
      }
      /* Перебиваем inline-стили от audit-log.js и analytics.js */
      #${CARD_ID} .sp-dt-body > button {
        display: inline-flex !important;
        align-items: center !important;
        gap: 8px !important;
        background: var(--primary, #2563EB) !important;
        color: #fff !important;
        border: 0 !important;
        border-radius: 10px !important;
        padding: 12px 20px !important;
        font-size: 14px !important;
        font-weight: 600 !important;
        cursor: pointer !important;
        margin: 0 !important;
        transition: background .15s ease !important;
        -webkit-tap-highlight-color: transparent;
      }
      #${CARD_ID} .sp-dt-body > button:hover {
        background: var(--primary-hover, #1D4ED8) !important;
      }
      #${CARD_ID} .sp-dt-body > button:active {
        transform: scale(.98);
      }

      @media (max-width: 640px) {
        #${CARD_ID} .sp-dt-body {
          flex-direction: column;
        }
        #${CARD_ID} .sp-dt-body > button {
          width: 100%;
          justify-content: center;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function reorganize() {
    /* Карточка уже создана — выходим */
    if (document.getElementById(CARD_ID)) return;

    /* Находим обе кнопки. Пока обеих нет — ждём. */
    const auditBtn = document.getElementById('spAuditLogOpenBtn');
    const analyticsBtn = document.getElementById('spAnalyticsOpenBtn');
    if (!auditBtn || !analyticsBtn) return;

    /* Куда вставлять — после карточки «Аккаунт». */
    const accountCard = document.querySelector('#logoutBtn')?.closest('.sp-card');
    if (!accountCard) return;

    /* Создаём карточку */
    const card = document.createElement('div');
    card.id = CARD_ID;
    card.className = 'sp-card';
    card.innerHTML = `
      <h3>📊 История и аналитика</h3>
      <p class="sp-dt-sub">
        Журнал всех действий на складе и графики —
        оборот, распределение по статусам, топ зон и активность операторов.
      </p>
      <div class="sp-dt-body"></div>
    `;

    const body = card.querySelector('.sp-dt-body');

    /* Перемещаем кнопки в карточку.
       ВАЖНО: moveChild сохраняет обработчики кликов —
       потому что это тот же DOM-узел, просто в другом месте. */
    body.appendChild(auditBtn);
    body.appendChild(analyticsBtn);

    /* Вставляем карточку сразу после «Аккаунт» */
    accountCard.insertAdjacentElement('afterend', card);

    console.log('[DataToolsCard] Кнопки собраны в общую карточку');
  }

  function init() {
    injectStyles();

    /* MutationObserver отслеживает появление кнопок.
       Когда оба модуля отрисуют свои кнопки — соберём карточку. */
    const obs = new MutationObserver(reorganize);
    obs.observe(document.body, { childList: true, subtree: true });

    /* Плюс несколько разовых проверок на случай,
       если MutationObserver что-то пропустит. */
    setTimeout(reorganize, 300);
    setTimeout(reorganize, 1000);
    setTimeout(reorganize, 2500);

    console.log('[DataToolsCard] Модуль инициализирован');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

})();
