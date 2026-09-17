<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SKLADAPLAN — WMS UI Concept</title>
  <style>
    :root {
      --brand-primary: #0f766e;
      --brand-primary-hover: #115e59;
      --brand-accent: #10b981;
      --brand-accent-light: #ecfdf5;
      --cargo-amber: #f59e0b;
      --cargo-amber-light: #fffbeb;
      --cargo-amber-border: #fcd34d;
      --bg-main: #f8fafc;
      --bg-card: #ffffff;
      --bg-sidebar: #0f172a;
      --text-main: #0f172a;
      --text-muted: #64748b;
      --border-subtle: #e2e8f0;
      --radius-card: 16px;
      --radius-btn: 10px;
      --shadow-card: 0 10px 25px -5px rgba(15, 23, 42, 0.04), 0 4px 6px -4px rgba(15, 23, 42, 0.02);
    }

    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { background-color: var(--bg-main); color: var(--text-main); display: flex; height: 100vh; overflow: hidden; }

    /* Sidebar */
    aside { width: 240px; background: var(--bg-sidebar); color: #fff; padding: 24px 16px; display: flex; flex-direction: column; gap: 32px; }
    .logo { display: flex; align-items: center; gap: 12px; }
    .logo-icon { width: 36px; height: 36px; background: var(--brand-primary); border-radius: 10px; display: grid; place-items: center; font-weight: bold; font-size: 18px; }
    .logo-text h1 { font-size: 15px; letter-spacing: 0.5px; }
    .logo-text p { font-size: 10px; color: #64748b; font-weight: 600; }
    
    nav { display: flex; flex-direction: column; gap: 6px; }
    .nav-item { display: flex; align-items: center; gap: 12px; padding: 10px 14px; border-radius: var(--radius-btn); color: #94a3b8; font-size: 13px; font-weight: 500; text-decoration: none; transition: all 0.2s; }
    .nav-item:hover { background: rgba(255, 255, 255, 0.05); color: #fff; }
    .nav-item.active { background: var(--brand-primary); color: #fff; font-weight: 600; }

    /* Main Content */
    main { flex: 1; padding: 24px 32px; overflow-y: auto; display: flex; flex-direction: column; gap: 24px; }
    
    /* Header */
    header { display: flex; justify-content: space-between; align-items: center; }
    .breadcrumbs { font-size: 12px; color: var(--text-muted); margin-bottom: 4px; }
    .page-title { font-size: 22px; font-weight: 700; }
    .header-actions { display: flex; align-items: center; gap: 16px; }
    .search-bar { padding: 8px 16px; border: 1px solid var(--border-subtle); border-radius: var(--radius-btn); background: #fff; font-size: 13px; width: 220px; outline: none; }
    .user-avatar { width: 36px; height: 36px; border-radius: 50%; background: #e2e8f0; display: grid; place-items: center; font-weight: 700; font-size: 12px; color: var(--text-main); }

    /* KPI Grid */
    .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
    .kpi-card { background: var(--bg-card); padding: 18px; border-radius: var(--radius-card); border: 1px solid var(--border-subtle); box-shadow: var(--shadow-card); }
    .kpi-title { font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; }
    .kpi-value { font-size: 24px; font-weight: 800; margin: 8px 0 4px 0; }
    .kpi-sub { font-size: 12px; color: var(--brand-accent); font-weight: 600; }

    /* Content Layout */
    .content-grid { display: grid; grid-template-columns: 1fr 300px; gap: 20px; }
    
    /* Main Card */
    .main-card { background: var(--bg-card); border-radius: var(--radius-card); border: 1px solid var(--border-subtle); padding: 24px; box-shadow: var(--shadow-card); display: flex; flex-direction: column; gap: 20px; }
    .card-header { display: flex; justify-content: space-between; align-items: flex-start; }
    .card-title { font-size: 18px; font-weight: 700; }
    .card-subtitle { font-size: 13px; color: var(--text-muted); margin-top: 4px; }
    .badge { background: var(--cargo-amber-light); color: #b45309; border: 1px solid var(--cargo-amber-border); padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; }

    /* Tabs */
    .tabs { display: flex; gap: 24px; border-bottom: 1px solid var(--border-subtle); }
    .tab { padding-bottom: 10px; font-size: 13px; font-weight: 600; color: var(--text-muted); cursor: pointer; border-bottom: 2px solid transparent; }
    .tab.active { color: var(--brand-primary); border-bottom-color: var(--brand-primary); }

    /* Textarea Area */
    .input-box { background: var(--bg-main); border: 1px solid var(--border-subtle); border-radius: var(--radius-btn); padding: 16px; font-family: monospace; font-size: 13px; line-height: 1.6; min-height: 180px; outline: none; }
    .input-box:focus { border-color: var(--brand-primary); background: #fff; }

    /* Action Footer */
    .card-footer { display: flex; justify-content: space-between; align-items: center; margin-top: auto; pt: 10px; }
    .status-text { font-size: 13px; color: var(--brand-primary); font-weight: 600; }
    .btn-submit { background: var(--cargo-amber); color: #fff; border: none; padding: 12px 24px; border-radius: var(--radius-btn); font-weight: 700; font-size: 14px; cursor: pointer; transition: all 0.2s; box-shadow: 0 4px 12px rgba(245, 158, 11, 0.25); }
    .btn-submit:hover { background: #d97706; transform: translateY(-1px); }

    /* Side Cards */
    .side-card { background: var(--bg-card); border-radius: var(--radius-card); border: 1px solid var(--border-subtle); padding: 20px; box-shadow: var(--shadow-card); margin-bottom: 20px; }
    .side-title { font-size: 14px; font-weight: 700; margin-bottom: 16px; }
    .progress-item { margin-bottom: 14px; }
    .progress-label { display: flex; justify-content: space-between; font-size: 11px; font-weight: 600; color: var(--text-muted); margin-bottom: 6px; }
    .progress-bar { height: 6px; background: var(--bg-main); border-radius: 3px; overflow: hidden; }
    .progress-fill { height: 100%; border-radius: 3px; }
  </style>
</head>
<body>

  <!-- Sidebar -->
  <aside>
    <div class="logo">
      <div class="logo-icon">S</div>
      <div class="logo-text">
        <h1>SKLADAPLAN</h1>
        <p>WAREHOUSE MANAGEMENT</p>
      </div>
    </div>
    <nav>
      <a href="#" class="nav-item active">● Главный экран</a>
      <a href="#" class="nav-item">База товаров</a>
      <a href="#" class="nav-item">Приёмка</a>
      <a href="#" class="nav-item">Сборка</a>
      <a href="#" class="nav-item">Собрано</a>
      <a href="#" class="nav-item">Убыло</a>
      <a href="#" class="nav-item">Перемещение</a>
      <a href="#" class="nav-item">Задачи</a>
    </nav>
  </aside>

  <!-- Main Content -->
  <main>
    <header>
      <div>
        <div class="breadcrumbs">SKLADAPLAN / Главная</div>
        <div class="page-title">Обзор склада</div>
      </div>
      <div class="header-actions">
        <input type="text" class="search-bar" placeholder="Поиск по ШК или артикулу...">
        <div class="user-avatar">ДБ</div>
      </div>
    </header>

    <!-- KPI Row -->
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-title">В сборке</div>
        <div class="kpi-value">14 заяв.</div>
        <div class="kpi-sub">82% от нормы смены</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-title">Принято сегодня</div>
        <div class="kpi-value">45 кор.</div>
        <div class="kpi-sub" style="color: var(--brand-accent)">+12% к вчера</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-title">Загрузка ячеек</div>
        <div class="kpi-value">64%</div>
        <div class="kpi-sub" style="color: var(--text-muted)">128 из 200 свободна</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-title">Точность подбора</div>
        <div class="kpi-value">99.8%</div>
        <div class="kpi-sub" style="color: var(--brand-accent)">Без ошибок 5 дней</div>
      </div>
    </div>

    <!-- Main Workspace Grid -->
    <div class="content-grid">
      <!-- Main Form -->
      <div class="main-card">
        <div class="card-header">
          <div>
            <div class="card-title">Новая заявка на подбор</div>
            <div class="card-subtitle">Вставьте список штрихкодов со сканера или импортируйте Excel</div>
          </div>
          <span class="badge">1 штрихкод = 1 коробка</span>
        </div>

        <div class="tabs">
          <div class="tab active">Ввести списком</div>
          <div class="tab">Загрузить Excel</div>
        </div>

        <div class="input-box" contenteditable="true">
4810122595003<br>
4810122595003<br>
4810122591104
        </div>

        <div class="card-footer">
          <div class="status-text">✓ Распознано: 3 коробки</div>
          <button class="btn-submit">📦 Сформировать подбор</button>
        </div>
      </div>

      <!-- Right Column -->
      <div>
        <div class="side-card">
          <div class="side-title">Загрузка секторов</div>
          <div class="progress-item">
            <div class="progress-label"><span>Сектор А (Паллеты)</span><span>85%</span></div>
            <div class="progress-bar"><div class="progress-fill" style="width: 85%; background: var(--brand-primary)"></div></div>
          </div>
          <div class="progress-item">
            <div class="progress-label"><span>Сектор B (Мезонин)</span><span>42%</span></div>
            <div class="progress-bar"><div class="progress-fill" style="width: 42%; background: var(--cargo-amber)"></div></div>
          </div>
          <div class="progress-item">
            <div class="progress-label"><span>Сектор C (Отгрузка)</span><span>15%</span></div>
            <div class="progress-bar"><div class="progress-fill" style="width: 15%; background: var(--brand-accent)"></div></div>
          </div>
        </div>

        <div class="side-card">
          <div class="side-title">Активные задачи</div>
          <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 8px;"><b>#1084</b> — Сборка (8/10 кор.)</div>
          <div style="font-size: 12px; color: var(--text-muted);"><b>#402</b> — Приёмка (в очереди)</div>
        </div>
      </div>
    </div>
  </main>

</body>
</html>