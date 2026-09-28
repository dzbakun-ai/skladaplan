/* =========================================================
   SKLADAPLAN — КАМЕРА-СКАНЕР
   =========================================================

   Что делает:
   - Находит все поля, похожие на «сканирующее» (по id,
     содержащему scanner/scan, или по inputmode="none").
   - Рядом с каждым полем добавляет кнопку 📷.
   - По нажатию открывает камеру, читает штрихкод
     (EAN-13, EAN-8, UPC, Code-128, Code-39, ITF, QR).
   - Подставляет значение в это же поле и отправляет
     синтетический Enter — срабатывает та же логика,
     что и при скане Bluetooth-пистолетом.

   Что НЕ делает:
   - Не трогает app.js, optimization.js, planner.js, tasks.js.
   - Не заменяет Bluetooth-сканеры — работает РЯДОМ с ними.
   - Не отправляет ничего на серверы — всё в браузере.

   Зависимости:
   - html5-qrcode подгружается с CDN при первом клике
     на кнопку 📷. Если нет интернета — библиотека не
     загрузится, но приложение продолжит работать как обычно.
   ========================================================= */

(function () {
  'use strict';

  /* ============ Константы ============ */

  const LIB_URL    = 'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js';
  const MODAL_ID   = 'spCameraScannerModal';
  const READER_ID  = 'spCameraScannerReader';
  const STYLES_ID  = 'spCameraScannerStyles';
  const STATUS_ID  = 'spCameraScannerStatus';
  const TORCH_ID   = 'spCameraTorch';
  const ATTACH_ATTR = 'data-camera-attached';
  const SCAN_COOLDOWN_MS = 1400;

  /* ============ Состояние ============ */

  let libraryLoading = null;   /* Promise загрузки библиотеки */
  let scannerInstance = null;  /* Текущий Html5Qrcode */
  let currentInput = null;     /* Поле, в которое пишем результат */
  let torchOn = false;
  let lastScanValue = '';
  let lastScanTime = 0;
  let scanLocked = false;
  let observer = null;
  let attachScheduled = false;

  /* ============ Стили ============ */

  function injectStyles() {
    if (document.getElementById(STYLES_ID)) return;

    const style = document.createElement('style');
    style.id = STYLES_ID;
    style.textContent = `
      /* Обёртка вокруг поля сканера */
      .sp-camera-wrap {
        position: relative;
        display: block;
        width: 100%;
      }
      .sp-camera-wrap > input {
        padding-right: 52px !important;
      }

      /* Кнопка 📷 */
      .sp-camera-btn {
        position: absolute;
        right: 8px;
        top: 50%;
        transform: translateY(-50%);
        width: 38px;
        height: 38px;
        border: 0;
        border-radius: 9px;
        background: rgba(37, 99, 235, .92);
        color: #fff;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 17px;
        cursor: pointer;
        z-index: 5;
        -webkit-tap-highlight-color: transparent;
        transition: background .15s ease, transform .1s ease;
      }
      .sp-camera-btn:hover { background: rgba(29, 78, 216, 1); }
      .sp-camera-btn:active { transform: translateY(-50%) scale(.94); }

      /* Модальное окно */
      #${MODAL_ID} {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, .78);
        z-index: 100000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
      }
      #${MODAL_ID} .sp-cam-card {
        background: #fff;
        border-radius: 18px;
        overflow: hidden;
        width: 100%;
        max-width: 520px;
        display: flex;
        flex-direction: column;
        max-height: 92vh;
        box-shadow: 0 25px 80px rgba(0,0,0,.35);
      }
      #${MODAL_ID} .sp-cam-head {
        padding: 14px 18px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        border-bottom: 1px solid #eee;
      }
      #${MODAL_ID} .sp-cam-title {
        font-size: 16px;
        font-weight: 700;
      }
      #${MODAL_ID} .sp-cam-close {
        border: 0;
        background: #f3f3f3;
        width: 34px;
        height: 34px;
        border-radius: 50%;
        cursor: pointer;
        font-size: 20px;
        line-height: 1;
        color: #444;
      }
      #${MODAL_ID} .sp-cam-close:hover { background: #e5e5e5; }
      #${MODAL_ID} .sp-cam-body {
        position: relative;
        background: #000;
        min-height: 240px;
      }
      #${READER_ID} {
        width: 100%;
      }
      #${READER_ID} video {
        width: 100% !important;
        display: block !important;
      }
      #${MODAL_ID} .sp-cam-status {
        padding: 12px 18px;
        font-size: 13px;
        color: #666;
        background: #fafafa;
        border-top: 1px solid #eee;
        min-height: 48px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }
      #${MODAL_ID} .sp-cam-status.is-ok {
        background: #eaf7ef;
        color: #18794e;
      }
      #${MODAL_ID} .sp-cam-status.is-err {
        background: #fff2f0;
        color: #b42318;
      }
      #${MODAL_ID} .sp-cam-torch {
        background: #fff;
        border: 1px solid #ccc;
        border-radius: 8px;
        padding: 6px 12px;
        cursor: pointer;
        font-size: 12px;
        font-weight: 600;
        color: #333;
      }
      #${MODAL_ID} .sp-cam-torch.is-on {
        background: #ffd54f;
        border-color: #ffb300;
      }

      /* На мобильном — на весь экран */
      @media (max-width: 640px) {
        #${MODAL_ID} { padding: 0; }
        #${MODAL_ID} .sp-cam-card {
          max-width: none;
          width: 100%;
          height: 100vh;
          max-height: none;
          border-radius: 0;
        }
        #${READER_ID} video {
          max-height: 70vh;
          object-fit: cover;
        }
      }
    `;
    document.head.appendChild(style);
  }

  /* ============ Загрузка библиотеки ============ */

  function loadLibrary() {
    if (window.Html5Qrcode) return Promise.resolve();
    if (libraryLoading) return libraryLoading;

    libraryLoading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = LIB_URL;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Не удалось загрузить библиотеку камеры. Проверьте соединение с интернетом.'));
      document.head.appendChild(s);
    });

    return libraryLoading;
  }

  /* ============ Определение сканер-полей ============ */

  function isScannerInput(el) {
    if (!el || el.tagName !== 'INPUT') return false;
    const type = (el.type || 'text').toLowerCase();
    if (type !== 'text' && type !== 'search') return false;
    if (el.hasAttribute(ATTACH_ATTR)) return false;

    /* 1. По id — если содержит «scanner» или «scan» (регистр не важен) */
    if (el.id && /scan/i.test(el.id)) return true;

    /* 2. По атрибуту inputmode="none" — это явный признак сканера */
    if (el.getAttribute('inputmode') === 'none') return true;

    return false;
  }

  function attachButton(input) {
    if (input.hasAttribute(ATTACH_ATTR)) return;

    const parent = input.parentNode;
    if (!parent) return;

    input.setAttribute(ATTACH_ATTR, '1');

    /* Оборачиваем поле в .sp-camera-wrap — чтобы кнопка позиционировалась относительно */
    const wrap = document.createElement('div');
    wrap.className = 'sp-camera-wrap';

    parent.insertBefore(wrap, input);
    wrap.appendChild(input);

    /* Кнопка */
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sp-camera-btn';
    btn.title = 'Сканировать камерой';
    btn.setAttribute('aria-label', 'Сканировать камерой');
    btn.innerHTML = '📷';

    /* Предотвращаем любые сайд-эффекты от родительских label'ов */
    const stop = e => { e.preventDefault(); e.stopPropagation(); };
    btn.addEventListener('mousedown', stop);
    btn.addEventListener('touchstart', stop, { passive: false });

    btn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      openCamera(input);
    });

    wrap.appendChild(btn);
  }

  function attachToAll() {
    const inputs = document.querySelectorAll('input');
    for (let i = 0; i < inputs.length; i++) {
      if (isScannerInput(inputs[i])) {
        attachButton(inputs[i]);
      }
    }
  }

  function scheduleAttach() {
    if (attachScheduled) return;
    attachScheduled = true;
    requestAnimationFrame(() => {
      attachScheduled = false;
      try { attachToAll(); } catch (e) { console.warn('[Camera] attach error:', e); }
    });
  }

  /* ============ Модальное окно ============ */

  function setStatus(text, kind) {
    const el = document.getElementById(STATUS_ID);
    if (!el) return;
    const span = el.querySelector('span');
    if (span) span.textContent = text;
    el.classList.remove('is-ok', 'is-err');
    if (kind === 'ok') el.classList.add('is-ok');
    if (kind === 'err') el.classList.add('is-err');
  }

  function openCamera(input) {
    if (!input) return;
    currentInput = input;
    closeModal();

    const overlay = document.createElement('div');
    overlay.id = MODAL_ID;
    overlay.innerHTML = `
      <div class="sp-cam-card">
        <div class="sp-cam-head">
          <div class="sp-cam-title">📷 Сканирование</div>
          <button type="button" class="sp-cam-close" aria-label="Закрыть">×</button>
        </div>
        <div class="sp-cam-body">
          <div id="${READER_ID}"></div>
        </div>
        <div class="sp-cam-status" id="${STATUS_ID}">
          <span>Запуск камеры…</span>
          <button type="button" class="sp-cam-torch" id="${TORCH_ID}" style="display:none;">🔦 Фонарик</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector('.sp-cam-close').addEventListener('click', closeModal);
    overlay.addEventListener('click', e => {
      if (e.target === overlay) closeModal();
    });

    const torchBtn = overlay.querySelector('#' + TORCH_ID);
    if (torchBtn) {
      torchBtn.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        toggleTorch();
      });
    }

    loadLibrary()
      .then(() => startScanner())
      .catch(err => {
        console.error('[Camera] load error:', err);
        setStatus(err.message || 'Ошибка загрузки камеры', 'err');
      });
  }

  async function startScanner() {
    const readerEl = document.getElementById(READER_ID);
    if (!readerEl) return;

    try {
      const formats = window.Html5QrcodeSupportedFormats || {};
      const supportedFormats = [
        formats.EAN_13, formats.EAN_8,
        formats.UPC_A, formats.UPC_E,
        formats.CODE_128, formats.CODE_39,
        formats.ITF, formats.CODABAR,
        formats.QR_CODE
      ].filter(Boolean);

      const ctorConfig = {
        verbose: false,
        useBarCodeDetectorIfSupported: true
      };
      if (supportedFormats.length) {
        ctorConfig.formatsToSupport = supportedFormats;
      }

      scannerInstance = new window.Html5Qrcode(READER_ID, ctorConfig);

      const startConfig = {
        fps: 12,
        qrbox: (viewfinderWidth, viewfinderHeight) => {
          const min = Math.min(viewfinderWidth, viewfinderHeight);
          return {
            width: Math.floor(min * 0.85),
            height: Math.floor(min * 0.45)
          };
        }
      };

      await scannerInstance.start(
        { facingMode: { ideal: 'environment' } },
        startConfig,
        onScanSuccess,
        () => { /* per-frame errors — игнорируем */ }
      );

      setStatus('Наведите камеру на штрихкод');
      setTimeout(checkTorchSupport, 600);

    } catch (err) {
      console.error('[Camera] start error:', err);
      let msg = 'Не удалось открыть камеру';
      const s = String(err && err.message || err);
      if (/permission/i.test(s) || /NotAllowed/i.test(s)) {
        msg = 'Нет доступа к камере. Разрешите в настройках браузера.';
      } else if (/NotFound/i.test(s) || /no camera/i.test(s)) {
        msg = 'Камера не найдена на устройстве.';
      } else if (s) {
        msg = 'Ошибка камеры: ' + s;
      }
      setStatus(msg, 'err');
    }
  }

  async function stopScanner() {
    if (!scannerInstance) return;
    const instance = scannerInstance;
    scannerInstance = null;
    try { await instance.stop(); } catch (e) { /* ignore */ }
    try { instance.clear(); } catch (e) { /* ignore */ }
    torchOn = false;
  }

  function closeModal() {
    stopScanner().then(() => {
      const modal = document.getElementById(MODAL_ID);
      if (modal) modal.remove();
      currentInput = null;
    }).catch(() => {
      const modal = document.getElementById(MODAL_ID);
      if (modal) modal.remove();
      currentInput = null;
    });
  }

  /* ============ Обработка сканирования ============ */

  function onScanSuccess(decodedText) {
    if (!decodedText) return;
    if (scanLocked) return;

    const now = Date.now();
    if (decodedText === lastScanValue && now - lastScanTime < 2000) return;

    lastScanValue = decodedText;
    lastScanTime = now;
    scanLocked = true;

    setStatus('✓ ' + decodedText, 'ok');

    /* Вибро-отклик (если поддерживается) */
    if (navigator.vibrate) {
      try { navigator.vibrate(60); } catch (e) {}
    }

    /* Отправляем в поле синтетический Enter — существующие
       обработчики в app.js подхватят ровно так же,
       как при скане Bluetooth-пистолетом */
    const target = currentInput;
    if (target) {
      try {
        target.value = decodedText;

        /* Триггерим существующий keydown-обработчик.
           Все обработчики в проекте проверяют event.key === 'Enter',
           поэтому достаточно установить именно key. */
        const enterEvent = new KeyboardEvent('keydown', {
          key: 'Enter',
          code: 'Enter',
          bubbles: true,
          cancelable: true
        });
        target.dispatchEvent(enterEvent);
      } catch (e) {
        console.error('[Camera] submit error:', e);
      }
    }

    /* Закрываем модалку через 350мс — чтобы пользователь
       успел увидеть «✓ код» */
    setTimeout(closeModal, 350);

    /* Снимаем блокировку */
    setTimeout(() => { scanLocked = false; }, SCAN_COOLDOWN_MS);
  }

  /* ============ Фонарик ============ */

  function getVideoTrack() {
    try {
      const videoEl = document.querySelector('#' + READER_ID + ' video');
      if (!videoEl) return null;
      const stream = videoEl.srcObject;
      if (!stream) return null;
      return stream.getVideoTracks()[0] || null;
    } catch (e) {
      return null;
    }
  }

  async function checkTorchSupport() {
    const torchBtn = document.getElementById(TORCH_ID);
    if (!torchBtn) return;

    const track = getVideoTrack();
    if (!track) return;

    try {
      const caps = track.getCapabilities ? track.getCapabilities() : {};
      if (caps && caps.torch) {
        torchBtn.style.display = 'inline-block';
      }
    } catch (e) {
      /* Некоторые браузеры не отдают capabilities — молча скроем */
    }
  }

  async function toggleTorch() {
    const track = getVideoTrack();
    if (!track) return;

    try {
      torchOn = !torchOn;
      await track.applyConstraints({ advanced: [{ torch: torchOn }] });
      const btn = document.getElementById(TORCH_ID);
      if (btn) btn.classList.toggle('is-on', torchOn);
    } catch (err) {
      console.warn('[Camera] torch error:', err);
      torchOn = false;
    }
  }

  /* ============ MutationObserver ============ */

  function startObserver() {
    if (observer) return;

    observer = new MutationObserver(() => {
      scheduleAttach();
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  /* ============ Инициализация ============ */

  function init() {
    injectStyles();

    const start = () => {
      scheduleAttach();
      startObserver();
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
      start();
    }

    console.log('[Camera] Модуль камера-сканера инициализирован');
  }

  init();

  /* ============ Публичный API (для отладки) ============ */

  window.spCameraScanner = {
    attachToAll,
    isLibraryLoaded: () => !!window.Html5Qrcode,
    version: '1.0.0'
  };

})();
