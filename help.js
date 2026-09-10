/* =========================================================
   SKLADAPLAN
   HELP / СПРАВКА

   Весь файл отвечает только за страницу справки.
   Логику WMS, Базу, Подбор и Сборку НЕ изменяет.
   ========================================================= */


/* =========================================================
   HELP VIEW
   ========================================================= */

function helpView() {

  return `

    <div class="help-page">

      <!-- =================================================
           HEADER
           ================================================= -->

      <header class="help-hero">

        <div class="help-eyebrow">
          SKLADAPLAN / HELP
        </div>

        <div class="help-hero-main">

          <div>

            <h1>
              Справка
            </h1>

            <p>
              Краткое руководство по работе
              со складской системой SKLADAPLAN.
            </p>

          </div>

          <div class="help-version">
            WEB
          </div>

        </div>


        <div class="help-core-rule">

          <div class="help-core-rule-label">
            ГЛАВНОЕ ПРАВИЛО
          </div>

          <strong>
            1 запись = 1 физическая коробка
          </strong>

          <span>
            Один и тот же штрихкод может встречаться
            у нескольких отдельных физических коробок.
          </span>

        </div>

      </header>


      <!-- =================================================
           QUICK NAV
           ================================================= -->

      <nav
        class="help-quick-nav"
        aria-label="Разделы справки"
      >

        <div class="help-quick-nav-title">
          БЫСТРАЯ НАВИГАЦИЯ
        </div>

        <div class="help-quick-nav-links">

          <a href="#help-system">
            О системе
          </a>

          <a href="#help-workflow">
            Процесс
          </a>

          <a href="#help-dashboard">
            Главный экран
          </a>

          <a href="#help-base">
            База
          </a>

          <a href="#help-receiving">
            Приёмка
          </a>

          <a href="#help-picking">
            Подбор
          </a>

          <a href="#help-assembly">
            Сборка
          </a>

          <a href="#help-collected">
            Скомплектовано
          </a>

          <a href="#help-shipped">
            Убыло
          </a>

          <a href="#help-inventory">
            Инвентаризация
          </a>

          <a href="#help-comparison">
            Сравнение
          </a>

          <a href="#help-excel">
            Excel
          </a>

          <a href="#help-statuses">
            Статусы
          </a>

          <a href="#help-warehouses">
            Склады
          </a>

          <a href="#help-tools">
            Инструменты
          </a>

          <a href="#help-users">
            Пользователи
          </a>

          <a href="#help-errors">
            Ошибки
          </a>

          <a href="#help-rules">
            Правила
          </a>

          <a href="#help-faq">
            FAQ
          </a>

          <a href="#help-current">
            Текущая версия
          </a>

        </div>

      </nav>


      <!-- =================================================
           01
           О СИСТЕМЕ
           ================================================= -->

      <section
        class="help-dropdown-section is-open"
        id="help-system"
      >

        <button
          type="button"
          class="help-dropdown-header"
          aria-expanded="true"
        >

          <span class="help-section-number">
            01
          </span>

          <span class="help-dropdown-title">

            <small>
              ОСНОВЫ
            </small>

            <strong>
              О системе
            </strong>

          </span>

          <span class="help-dropdown-icon">
            −
          </span>

        </button>


        <div class="help-dropdown-body">

          <p class="help-lead">
            <strong>SKLADAPLAN</strong> —
            система управления складом для учёта
            физических коробок, их размещения,
            подбора, сборки и отгрузки.
          </p>

          <p>
            Основная идея системы —
            перевести складской процесс
            из ручных таблиц в понятную цифровую
            последовательность действий.
          </p>


          <div class="help-simple-grid">

            <div>
              <strong>
                Физическая коробка
              </strong>

              <span>
                Каждая физическая коробка
                хранится отдельной записью.
              </span>
            </div>


            <div>
              <strong>
                Штрихкод
              </strong>

              <span>
                Один штрихкод может принадлежать
                нескольким коробкам.
              </span>
            </div>


            <div>
              <strong>
                Местоположение
              </strong>

              <span>
                Склад, зона/ряд и паллета
                позволяют определить расположение.
              </span>
            </div>


            <div>
              <strong>
                Статус
              </strong>

              <span>
                Показывает текущее состояние коробки.
              </span>
            </div>

          </div>

        </div>

      </section>


      <!-- =================================================
           02
           ПРОЦЕСС
           ================================================= -->

      <section
        class="help-dropdown-section"
        id="help-workflow"
      >

        <button
          type="button"
          class="help-dropdown-header"
          aria-expanded="false"
        >

          <span class="help-section-number">
            02
          </span>

          <span class="help-dropdown-title">

            <small>
              WORKFLOW
            </small>

            <strong>
              Полный рабочий процесс
            </strong>

          </span>

          <span class="help-dropdown-icon">
            +
          </span>

        </button>


        <div class="help-dropdown-body">

          <p class="help-lead">
            Базовая последовательность движения
            физической коробки внутри системы.
          </p>


          <div class="help-process">

            <div>
              <span>01</span>
              <strong>Приёмка</strong>
              <small>Коробка попадает на склад</small>
            </div>

            <i>→</i>

            <div>
              <span>02</span>
              <strong>База</strong>
              <small>Коробка хранится на складе</small>
            </div>

            <i>→</i>

            <div>
              <span>03</span>
              <strong>Подбор</strong>
              <small>Коробка выбирается под заявку</small>
            </div>

            <i>→</i>

            <div>
              <span>04</span>
              <strong>Сборка</strong>
              <small>Заказ физически комплектуется</small>
            </div>

            <i>→</i>

            <div>
              <span>05</span>
              <strong>Скомплектовано</strong>
              <small>Заказ готов</small>
            </div>

            <i>→</i>

            <div>
              <span>06</span>
              <strong>Убыло</strong>
              <small>Коробка отгружена</small>
            </div>

          </div>


          <div class="help-note">

            <strong>
              Важно
            </strong>

            <p>
              Доступные действия зависят от текущего
              статуса коробки и прав пользователя.
            </p>

          </div>

        </div>

      </section>


      <!-- =================================================
           03
           ГЛАВНЫЙ ЭКРАН
           ================================================= -->

      <section
        class="help-dropdown-section"
        id="help-dashboard"
      >

        <button
          type="button"
          class="help-dropdown-header"
          aria-expanded="false"
        >

          <span class="help-section-number">
            03
          </span>

          <span class="help-dropdown-title">

            <small>
              OVERVIEW
            </small>

            <strong>
              Главный экран
            </strong>

          </span>

          <span class="help-dropdown-icon">
            +
          </span>

        </button>


        <div class="help-dropdown-body">

          <p class="help-lead">
            Главный экран предназначен для быстрого
            контроля состояния склада.
          </p>


          <div class="help-list">

            <div>
              <strong>
                Количество коробок
              </strong>

              <span>
                Общее количество физических коробок
                в текущей базе.
              </span>
            </div>


            <div>
              <strong>
                Статусы
              </strong>

              <span>
                Распределение коробок
                по текущему состоянию.
              </span>
            </div>


            <div>
              <strong>
                Склады
              </strong>

              <span>
                Информация может быть разделена
                между складскими площадками.
              </span>
            </div>


            <div>
              <strong>
                Операции
              </strong>

              <span>
                Быстрый переход
                к основным процессам.
              </span>
            </div>

          </div>

        </div>

      </section>


      <!-- =================================================
           04
           БАЗА
           ================================================= -->

      <section
        class="help-dropdown-section"
        id="help-base"
      >

        <button
          type="button"
          class="help-dropdown-header"
          aria-expanded="false"
        >

          <span class="help-section-number">
            04
          </span>

          <span class="help-dropdown-title">

            <small>
              INVENTORY
            </small>

            <strong>
              База
            </strong>

          </span>

          <span class="help-dropdown-icon">
            +
          </span>

        </button>


        <div class="help-dropdown-body">

          <p class="help-lead">
            <strong>База</strong> —
            основной справочник физических коробок,
            известных системе.
          </p>

          <p>
            В записи коробки могут храниться
            штрихкод, артикул, количество в коробке,
            зона/ряд, паллета, статус, дата,
            склад и пользователь.
          </p>


          <div class="help-table-wrap">

            <table class="help-table">

              <thead>

                <tr>
                  <th>Поле</th>
                  <th>Назначение</th>
                </tr>

              </thead>

              <tbody>

                <tr>
                  <td>Штрихкод</td>
                  <td>
                    Идентификатор коробки.
                  </td>
                </tr>

                <tr>
                  <td>Артикул</td>
                  <td>
                    Артикул товара.
                  </td>
                </tr>

                <tr>
                  <td>Кол-во в коробке</td>
                  <td>
                    Количество товара внутри коробки.
                    Не является количеством физических коробок.
                  </td>
                </tr>

                <tr>
                  <td>Зона/ряд</td>
                  <td>
                    Местоположение на складе.
                  </td>
                </tr>

                <tr>
                  <td>Поддон</td>
                  <td>
                    Идентификатор паллеты.
                  </td>
                </tr>

                <tr>
                  <td>Статус</td>
                  <td>
                    Текущее состояние коробки.
                  </td>
                </tr>

                <tr>
                  <td>Дата размещения</td>
                  <td>
                    Дата размещения коробки.
                  </td>
                </tr>

                <tr>
                  <td>Склад</td>
                  <td>
                    Склад, на котором находится коробка.
                  </td>
                </tr>

                <tr>
                  <td>Изменил</td>
                  <td>
                    Пользователь или сотрудник.
                  </td>
                </tr>

              </tbody>

            </table>

          </div>


          <div class="help-warning">

            <strong>
              Главное правило
            </strong>

            <p>
              Если на складе находятся 10 физических
              коробок с одинаковым штрихкодом,
              в базе должно быть 10 отдельных записей.
            </p>

          </div>

        </div>

      </section>


      <!-- =================================================
           05
           ПРИЁМКА
           ================================================= -->

      <section
        class="help-dropdown-section"
        id="help-receiving"
      >

        <button
          type="button"
          class="help-dropdown-header"
          aria-expanded="false"
        >

          <span class="help-section-number">
            05
          </span>

          <span class="help-dropdown-title">

            <small>
              RECEIVING
            </small>

            <strong>
              Приёмка
            </strong>

          </span>

          <span class="help-dropdown-icon">
            +
          </span>

        </button>


        <div class="help-dropdown-body">

          <p class="help-lead">
            Приёмка используется для занесения
            физических коробок на склад
            и фиксации их местоположения.
          </p>


          <div class="help-steps">

            <div>
              <span>01</span>
              <strong>Выберите склад</strong>
            </div>

            <div>
              <span>02</span>
              <strong>Укажите зону / ряд</strong>
            </div>

            <div>
              <span>03</span>
              <strong>
                Выберите или создайте паллету,
                если это необходимо
              </strong>
            </div>

            <div>
              <span>04</span>
              <strong>Сканируйте коробки</strong>
            </div>

            <div>
              <span>05</span>
              <strong>
                Проверьте результат в базе
              </strong>
            </div>

          </div>


          <div class="help-note">

            <strong>
              Совет
            </strong>

            <p>
              После приёмки рекомендуется проверить,
              что коробки получили правильный склад,
              зону/ряд и паллету.
            </p>

          </div>

        </div>

      </section>


      <!-- =================================================
           06
           ПОДБОР
           ================================================= -->

      <section
        class="help-dropdown-section"
        id="help-picking"
      >

        <button
          type="button"
          class="help-dropdown-header"
          aria-expanded="false"
        >

          <span class="help-section-number">
            06
          </span>

          <span class="help-dropdown-title">

            <small>
              PICKING
            </small>

            <strong>
              Заявки и подбор
            </strong>

          </span>

          <span class="help-dropdown-icon">
            +
          </span>

        </button>


        <div class="help-dropdown-body">

          <p class="help-lead">
            Подбор превращает потребность заявки
            в конкретные физические коробки,
            существующие в базе.
          </p>


          <div class="help-core-rule">

            <div class="help-core-rule-label">
              ПРИНЦИП ПОДБОРА
            </div>

            <strong>
              Система работает с физическими коробками,
              а не с количеством товара внутри них.
            </strong>

            <span>
              Повторяющиеся штрихкоды из заявки
              суммируются, после чего система ищет
              необходимое количество отдельных записей
              коробок в базе.
            </span>

          </div>


          <h3>
            Пример
          </h3>


          <div class="help-example">

            <div>
              <span>ЗАЯВКА</span>

              <code>
                4810122638540 × 3
              </code>
            </div>

            <i>↓</i>

            <div>
              <span>БАЗА</span>

              <strong>
                3 физические коробки
              </strong>
            </div>

            <i>↓</i>

            <div>
              <span>РЕЗУЛЬТАТ</span>

              <strong>
                3 конкретные коробки
                отправлены в подбор
              </strong>
            </div>

          </div>


          <h3>
            Повторяющийся штрихкод
          </h3>

          <p>
            Если один штрихкод указан в заявке
            несколько раз, система суммирует
            требуемое количество.
          </p>

          <p>
            Например, если штрихкод требуется
            12 раз, система ищет 12 отдельных
            физических коробок с этим штрихкодом.
          </p>


          <div class="help-warning">

            <strong>
              Не путайте два значения
            </strong>

            <p>
              «Кол-во в коробке» показывает,
              сколько товара находится внутри одной
              коробки. Это не означает, что одна запись
              заменяет несколько физических коробок.
            </p>

          </div>

        </div>

      </section>


      <!-- =================================================
           07
           СБОРКА
           ================================================= -->

      <section
        class="help-dropdown-section"
        id="help-assembly"
      >

        <button
          type="button"
          class="help-dropdown-header"
          aria-expanded="false"
        >

          <span class="help-section-number">
            07
          </span>

          <span class="help-dropdown-title">

            <small>
              ASSEMBLY
            </small>

            <strong>
              Сборка
            </strong>

          </span>

          <span class="help-dropdown-icon">
            +
          </span>

        </button>


        <div class="help-dropdown-body">

          <p class="help-lead">
            Сборка — рабочее место сотрудника,
            который физически комплектует
            отобранные коробки.
          </p>


          <div class="help-list">

            <div>
              <strong>
                Очередь
              </strong>

              <span>
                Просмотр коробок,
                ожидающих обработки.
              </span>
            </div>


            <div>
              <strong>
                Выбор
              </strong>

              <span>
                Выбор отдельных коробок
                или групп.
              </span>
            </div>


            <div>
              <strong>
                Сканирование
              </strong>

              <span>
                Проверка коробки
                по штрихкоду.
              </span>
            </div>


            <div>
              <strong>
                Текущая паллета
              </strong>

              <span>
                Работа только с коробками
                выбранной паллеты.
              </span>
            </div>


            <div>
              <strong>
                Возврат
              </strong>

              <span>
                Возврат выбранных коробок
                обратно на склад.
              </span>
            </div>


            <div>
              <strong>
                Завершение
              </strong>

              <span>
                Перевод выбранных коробок
                на следующий этап процесса.
              </span>
            </div>

          </div>


          <div class="help-note">

            <strong>
              Текущая рабочая логика
            </strong>

            <p>
              Раздел «Сборка» является рабочей частью
              системы. Изменение его логики требует
              проверки всего процесса подбора.
            </p>

          </div>

        </div>

      </section>


      <!-- =================================================
           08
           СКОМПЛЕКТОВАНО
           ================================================= -->

      <section
        class="help-dropdown-section"
        id="help-collected"
      >

        <button
          type="button"
          class="help-dropdown-header"
          aria-expanded="false"
        >

          <span class="help-section-number">
            08
          </span>

          <span class="help-dropdown-title">

            <small>
              READY
            </small>

            <strong>
              Скомплектовано
            </strong>

          </span>

          <span class="help-dropdown-icon">
            +
          </span>

        </button>


        <div class="help-dropdown-body">

          <p class="help-lead">
            Здесь находятся коробки,
            которые прошли этап физической сборки
            и готовы к следующему этапу.
          </p>


          <ul class="help-bullets">

            <li>
              Контролировать готовые коробки.
            </li>

            <li>
              Проверять заявку или направление.
            </li>

            <li>
              Отбирать необходимые позиции.
            </li>

            <li>
              Передавать готовые коробки
              на отгрузку.
            </li>

          </ul>

        </div>

      </section>


      <!-- =================================================
           09
           УБЫЛО
           ================================================= -->

      <section
        class="help-dropdown-section"
        id="help-shipped"
      >

        <button
          type="button"
          class="help-dropdown-header"
          aria-expanded="false"
        >

          <span class="help-section-number">
            09
          </span>

          <span class="help-dropdown-title">

            <small>
              SHIPPED
            </small>

            <strong>
              Убыло
            </strong>

          </span>

          <span class="help-dropdown-icon">
            +
          </span>

        </button>


        <div class="help-dropdown-body">

          <p class="help-lead">
            Раздел «Убыло» содержит коробки,
            которые были отгружены со склада.
          </p>

          <p>
            Это история движения физических коробок,
            покинувших склад.
          </p>


          <div class="help-warning">

            <strong>
              Важно
            </strong>

            <p>
              После отгрузки коробка не должна
              продолжать считаться доступным
              складским остатком.
            </p>

          </div>

        </div>

      </section>


      <!-- =================================================
           10
           ИНВЕНТАРИЗАЦИЯ
           ================================================= -->

      <section
        class="help-dropdown-section"
        id="help-inventory"
      >

        <button
          type="button"
          class="help-dropdown-header"
          aria-expanded="false"
        >

          <span class="help-section-number">
            10
          </span>

          <span class="help-dropdown-title">

            <small>
              INVENTORY CHECK
            </small>

            <strong>
              Инвентаризация
            </strong>

          </span>

          <span class="help-dropdown-icon">
            +
          </span>

        </button>


        <div class="help-dropdown-body">

          <p class="help-lead">
            Инвентаризация позволяет сравнить
            фактическое наличие коробок
            с данными системы.
          </p>


          <div class="help-steps">

            <div>
              <span>01</span>
              <strong>Выберите склад</strong>
            </div>

            <div>
              <span>02</span>
              <strong>Выберите зону / ряд</strong>
            </div>

            <div>
              <span>03</span>
              <strong>
                Выберите паллету,
                если это необходимо
              </strong>
            </div>

            <div>
              <span>04</span>
              <strong>
                Сканируйте фактические коробки
              </strong>
            </div>

            <div>
              <span>05</span>
              <strong>
                Проверьте результаты сравнения
              </strong>
            </div>

          </div>


          <div class="help-simple-grid">

            <div>
              <strong>
                Найдено
              </strong>

              <span>
                Коробка присутствует там,
                где её ожидает система.
              </span>
            </div>


            <div>
              <strong>
                Не хватает
              </strong>

              <span>
                Система ожидает коробку,
                но она не была найдена.
              </span>
            </div>


            <div>
              <strong>
                Неизвестная
              </strong>

              <span>
                Коробка отсканирована,
                но не входит в ожидаемый список.
              </span>
            </div>

          </div>

        </div>

      </section>


      <!-- =================================================
           11
           СРАВНЕНИЕ
           ================================================= -->

      <section
        class="help-dropdown-section"
        id="help-comparison"
      >

        <button
          type="button"
          class="help-dropdown-header"
          aria-expanded="false"
        >

          <span class="help-section-number">
            11
          </span>

          <span class="help-dropdown-title">

            <small>
              ANALYSIS
            </small>

            <strong>
              Сравнение
            </strong>

          </span>

          <span class="help-dropdown-icon">
            +
          </span>

        </button>


        <div class="help-dropdown-body">

          <p class="help-lead">
            Инструмент сравнения предназначен
            для проверки плановых и фактических данных.
          </p>


          <div class="help-simple-grid">

            <div>
              <strong>
                Точно в план
              </strong>

              <span>
                Фактическое количество
                соответствует плану.
              </span>
            </div>


            <div>
              <strong>
                Не хватает
              </strong>

              <span>
                Фактического количества меньше,
                чем требуется.
              </span>
            </div>


            <div>
              <strong>
                Лишние
              </strong>

              <span>
                Фактического количества больше,
                чем указано в плане.
              </span>
            </div>

          </div>

        </div>

      </section>


      <!-- =================================================
           12
           EXCEL
           ================================================= -->

      <section
        class="help-dropdown-section"
        id="help-excel"
      >

        <button
          type="button"
          class="help-dropdown-header"
          aria-expanded="false"
        >

          <span class="help-section-number">
            12
          </span>

          <span class="help-dropdown-title">

            <small>
              IMPORT
            </small>

            <strong>
              Excel
            </strong>

          </span>

          <span class="help-dropdown-icon">
            +
          </span>

        </button>


        <div class="help-dropdown-body">

          <p class="help-lead">
            SKLADAPLAN поддерживает импорт
            складских данных из Excel.
          </p>


          <div class="help-core-rule">

            <div class="help-core-rule-label">
              ФОРМАТ
            </div>

            <strong>
              .xlsx и .xls
            </strong>

            <span>
              Текущий импорт читает первый лист книги.
            </span>

          </div>


          <h3>
            Главное
          </h3>

          <ul class="help-bullets">

            <li>
              Столбец «Штрихкод» обязателен.
            </li>

            <li>
              Все остальные распознаваемые поля
              являются необязательными.
            </li>

            <li>
              Одна строка складских данных —
              одна физическая коробка.
            </li>

            <li>
              Повторяющиеся штрихкоды разрешены.
            </li>

            <li>
              Пустые строки без штрихкода
              не являются физическими коробками.
            </li>

          </ul>


          <h3>
            Столбцы
          </h3>


          <div class="help-table-wrap">

            <table class="help-table excel-table">

              <thead>

                <tr>
                  <th>Поле</th>
                  <th>Обязательно</th>
                  <th>Рекомендуемый формат</th>
                </tr>

              </thead>

              <tbody>

                <tr>
                  <td>Штрихкод</td>
                  <td>Да</td>
                  <td>Текст</td>
                </tr>

                <tr>
                  <td>Артикул</td>
                  <td>Нет</td>
                  <td>Текст</td>
                </tr>

                <tr>
                  <td>Кол-во в коробке</td>
                  <td>Нет</td>
                  <td>Число</td>
                </tr>

                <tr>
                  <td>Зона/ряд</td>
                  <td>Нет</td>
                  <td>Текст</td>
                </tr>

                <tr>
                  <td>Поддон</td>
                  <td>Нет</td>
                  <td>Текст</td>
                </tr>

                <tr>
                  <td>Статус</td>
                  <td>Нет</td>
                  <td>Текст</td>
                </tr>

                <tr>
                  <td>Дата размещения</td>
                  <td>Нет</td>
                  <td>Дата</td>
                </tr>

                <tr>
                  <td>Склад</td>
                  <td>Нет</td>
                  <td>Текст</td>
                </tr>

                <tr>
                  <td>Изменил</td>
                  <td>Нет</td>
                  <td>Текст</td>
                </tr>

              </tbody>

            </table>

          </div>


          <h3>
            Распознаваемые названия
          </h3>


          <div class="help-alias-list">

            <div>
              <strong>Штрихкод</strong>
              <span>
                Штрихкод · barcode · баркод · код · штрих код
              </span>
            </div>

            <div>
              <strong>Артикул</strong>
              <span>
                Артикул · article · sku
              </span>
            </div>

            <div>
              <strong>Количество</strong>
              <span>
                колвокоробке · количествовкоробке ·
                количество · quantityinbox
              </span>
            </div>

            <div>
              <strong>Зона / ряд</strong>
              <span>
                зонаряд · зона · ряд · zonerow ·
                location · место
              </span>
            </div>

            <div>
              <strong>Паллета</strong>
              <span>
                поддон · паллета · pallet
              </span>
            </div>

            <div>
              <strong>Статус</strong>
              <span>
                статус · status
              </span>
            </div>

            <div>
              <strong>Дата</strong>
              <span>
                датаразмещения · дата · date
              </span>
            </div>

            <div>
              <strong>Склад</strong>
              <span>
                склад · warehouse
              </span>
            </div>

            <div>
              <strong>Работник</strong>
              <span>
                изменил · ктоработал · worker
              </span>
            </div>

          </div>


          <h3>
            Как лучше подготовить штрихкод
          </h3>

          <div class="help-note">

            <strong>
              Формат «Текст»
            </strong>

            <p>
              Для длинных штрихкодов рекомендуется
              установить текстовый формат столбца.
              Это помогает избежать научной записи,
              потери ведущих нулей и изменения цифр.
            </p>

          </div>


          <div class="help-warning">

            <strong>
              Важное ограничение Excel
            </strong>

            <p>
              Если Excel уже изменил длинный штрихкод
              или потерял цифры, импорт не сможет
              восстановить исходное значение.
            </p>

          </div>


          <h3>
            Пример
          </h3>


          <div class="help-code-table">

            <div class="help-code-header">

              <span>Штрихкод</span>
              <span>Артикул</span>
              <span>Количество</span>
              <span>Зона/ряд</span>
              <span>Паллет</span>
              <span>Склад</span>

            </div>


            <div class="help-code-row">

              <span>4810122638540</span>
              <span>ABC-01</span>
              <span>12</span>
              <span>A-01-01</span>
              <span>P-001</span>
              <span>СОХ</span>

            </div>


            <div class="help-code-row">

              <span>4810122638540</span>
              <span>ABC-01</span>
              <span>12</span>
              <span>A-01-02</span>
              <span>P-002</span>
              <span>СОХ</span>

            </div>


            <div class="help-code-row">

              <span>4810122638557</span>
              <span>ABC-02</span>
              <span>8</span>
              <span>A-02-01</span>
              <span>P-003</span>
              <span>№7</span>

            </div>

          </div>


          <div class="help-note">

            <strong>
              Повторение штрихкода — нормально
            </strong>

            <p>
              В примере первые две строки имеют
              одинаковый штрихкод, потому что это
              две разные физические коробки.
            </p>

          </div>

        </div>

      </section>


      <!-- =================================================
           13
           СТАТУСЫ
           ================================================= -->

      <section
        class="help-dropdown-section"
        id="help-statuses"
      >

        <button
          type="button"
          class="help-dropdown-header"
          aria-expanded="false"
        >

          <span class="help-section-number">
            13
          </span>

          <span class="help-dropdown-title">

            <small>
              STATES
            </small>

            <strong>
              Статусы коробок
            </strong>

          </span>

          <span class="help-dropdown-icon">
            +
          </span>

        </button>


        <div class="help-dropdown-body">

          <p class="help-lead">
            Статус показывает,
            на каком этапе находится физическая коробка.
          </p>


          <div class="help-status-list">

            <div>
              <strong>
                На складе
              </strong>

              <span>
                Коробка находится
                в доступном складском остатке.
              </span>
            </div>


            <div>
              <strong>
                Зарезервирована
              </strong>

              <span>
                Коробка закреплена
                за необходимым процессом.
              </span>
            </div>


            <div>
              <strong>
                КПодбору
              </strong>

              <span>
                Коробка выбрана
                для физического подбора.
              </span>
            </div>


            <div>
              <strong>
                Скомплектовано
              </strong>

              <span>
                Коробка прошла этап сборки
                и готова к следующему этапу.
              </span>
            </div>


            <div>
              <strong>
                Отгружено
              </strong>

              <span>
                Коробка покинула склад.
              </span>
            </div>


            <div>
              <strong>
                Пустая
              </strong>

              <span>
                Специальное состояние,
                используемое системой.
              </span>
            </div>

          </div>

        </div>

      </section>


      <!-- =================================================
           14
           СКЛАДЫ
           ================================================= -->

      <section
        class="help-dropdown-section"
        id="help-warehouses"
      >

        <button
          type="button"
          class="help-dropdown-header"
          aria-expanded="false"
        >

          <span class="help-section-number">
            14
          </span>

          <span class="help-dropdown-title">

            <small>
              LOCATION
            </small>

            <strong>
              Склады, зоны, ряды и паллеты
            </strong>

          </span>

          <span class="help-dropdown-icon">
            +
          </span>

        </button>


        <div class="help-dropdown-body">

          <p class="help-lead">
            Система учитывает не только склад,
            но и местоположение коробки внутри него.
          </p>


          <div class="help-location">

            <div>
              <span>СКЛАД</span>
              <strong>СОХ</strong>
            </div>

            <i>→</i>

            <div>
              <span>ЗОНА / РЯД</span>
              <strong>A-01-05</strong>
            </div>

            <i>→</i>

            <div>
              <span>ПАЛЛЕТА</span>
              <strong>P-001</strong>
            </div>

          </div>


          <p>
            Благодаря этому можно определить,
            где физически находится конкретная коробка.
          </p>


          <div class="help-note">

            <strong>
              Пример
            </strong>

            <p>
              Одинаковый штрихкод может находиться
              одновременно на разных паллетах
              и в разных рядах.
            </p>

          </div>

        </div>

      </section>


      <!-- =================================================
           15
           ИНСТРУМЕНТЫ
           ================================================= -->

      <section
        class="help-dropdown-section"
        id="help-tools"
      >

        <button
          type="button"
          class="help-dropdown-header"
          aria-expanded="false"
        >

          <span class="help-section-number">
            15
          </span>

          <span class="help-dropdown-title">

            <small>
              TOOLS
            </small>

            <strong>
              Инструменты
            </strong>

          </span>

          <span class="help-dropdown-icon">
            +
          </span>

        </button>


        <div class="help-dropdown-body">

          <div class="help-list">

            <div>
              <strong>
                Excel
              </strong>

              <span>
                Импорт складских данных.
              </span>
            </div>


            <div>
              <strong>
                JSON
              </strong>

              <span>
                Экспорт данных в JSON.
              </span>
            </div>


            <div>
              <strong>
                Резервная копия
              </strong>

              <span>
                Создание резервной копии
                доступным механизмом приложения.
              </span>
            </div>


            <div>
              <strong>
                Инвентаризация
              </strong>

              <span>
                Проверка фактического наличия коробок.
              </span>
            </div>


            <div>
              <strong>
                Сравнение
              </strong>

              <span>
                Проверка плановых
                и фактических данных.
              </span>
            </div>


            <div>
              <strong>
                Справка
              </strong>

              <span>
                Руководство пользователя.
              </span>
            </div>

          </div>

        </div>

      </section>


      <!-- =================================================
           16
           ПОЛЬЗОВАТЕЛИ
           ================================================= -->

      <section
        class="help-dropdown-section"
        id="help-users"
      >

        <button
          type="button"
          class="help-dropdown-header"
          aria-expanded="false"
        >

          <span class="help-section-number">
            16
          </span>

          <span class="help-dropdown-title">

            <small>
              ACCESS
            </small>

            <strong>
              Пользователи и права
            </strong>

          </span>

          <span class="help-dropdown-icon">
            +
          </span>

        </button>


        <div class="help-dropdown-body">

          <p class="help-lead">
            SKLADAPLAN рассчитан на работу
            нескольких пользователей
            с различными задачами.
          </p>


          <div class="help-simple-grid">

            <div>
              <strong>
                Администратор
              </strong>

              <span>
                Управление данными,
                настройками и пользователями.
              </span>
            </div>


            <div>
              <strong>
                Сотрудник склада
              </strong>

              <span>
                Приёмка, подбор, сборка
                и складские операции.
              </span>
            </div>


            <div>
              <strong>
                Просмотр
              </strong>

              <span>
                Контроль информации
                без критических изменений.
              </span>
            </div>

          </div>


          <div class="help-warning">

            <strong>
              Важно
            </strong>

            <p>
              Ограничение кнопок интерфейса
              не является полноценной защитой данных.
              Для окончательного разграничения доступа
              необходимы серверные правила
              и политики базы данных.
            </p>

          </div>

        </div>

      </section>


      <!-- =================================================
           17
           ОШИБКИ
           ================================================= -->

      <section
        class="help-dropdown-section"
        id="help-errors"
      >

        <button
          type="button"
          class="help-dropdown-header"
          aria-expanded="false"
        >

          <span class="help-section-number">
            17
          </span>

          <span class="help-dropdown-title">

            <small>
              TROUBLESHOOTING
            </small>

            <strong>
              Ошибки и решения
            </strong>

          </span>

          <span class="help-dropdown-icon">
            +
          </span>

        </button>


        <div class="help-dropdown-body">

          <details class="help-inner-faq">

            <summary>
              Excel не импортируется
            </summary>

            <div>

              <p>
                Проверьте:
              </p>

              <ul class="help-bullets">

                <li>
                  формат файла .xlsx или .xls;
                </li>

                <li>
                  заголовки находятся в первой строке;
                </li>

                <li>
                  существует столбец «Штрихкод»;
                </li>

                <li>
                  штрихкоды заполнены;
                </li>

                <li>
                  файл не повреждён.
                </li>

              </ul>

            </div>

          </details>


          <details class="help-inner-faq">

            <summary>
              Штрихкод выглядит как 4.81012E+12
            </summary>

            <div>

              <p>
                Excel преобразовал длинный код
                в научную запись.
              </p>

              <p>
                Используйте текстовый формат
                для столбца штрихкодов.
              </p>

            </div>

          </details>


          <details class="help-inner-faq">

            <summary>
              Один штрихкод встречается много раз
            </summary>

            <div>

              <p>
                Это нормально.
                Повторение означает,
                что несколько физических коробок
                имеют один штрихкод.
              </p>

            </div>

          </details>


          <details class="help-inner-faq">

            <summary>
              В заявке нужно 12 коробок,
              а система находит меньше
            </summary>

            <div>

              <p>
                Проверьте фактическое количество
                физических коробок с этим штрихкодом
                и их текущий статус.
              </p>

            </div>

          </details>


          <details class="help-inner-faq">

            <summary>
              Коробка есть физически,
              но система её не находит
            </summary>

            <div>

              <p>
                Проверьте штрихкод,
                склад, статус, зону/ряд
                и паллету.
              </p>

            </div>

          </details>

        </div>

      </section>


      <!-- =================================================
           18
           ПРАВИЛА
           ================================================= -->

      <section
        class="help-dropdown-section"
        id="help-rules"
      >

        <button
          type="button"
          class="help-dropdown-header"
          aria-expanded="false"
        >

          <span class="help-section-number">
            18
          </span>

          <span class="help-dropdown-title">

            <small>
              PRINCIPLES
            </small>

            <strong>
              Главные правила
            </strong>

          </span>

          <span class="help-dropdown-icon">
            +
          </span>

        </button>


        <div class="help-dropdown-body">

          <div class="help-rules">

            <div>
              <span>01</span>
              <strong>
                1 запись = 1 физическая коробка.
              </strong>
            </div>

            <div>
              <span>02</span>
              <strong>
                Один штрихкод может встречаться
                у нескольких коробок.
              </strong>
            </div>

            <div>
              <span>03</span>
              <strong>
                Количество товара внутри коробки
                не равно количеству физических коробок.
              </strong>
            </div>

            <div>
              <span>04</span>
              <strong>
                Подбор работает с реальными
                физическими записями коробок.
              </strong>
            </div>

            <div>
              <span>05</span>
              <strong>
                Местоположение коробки имеет значение.
              </strong>
            </div>

            <div>
              <span>06</span>
              <strong>
                Статус отражает движение коробки
                по складскому процессу.
              </strong>
            </div>

            <div>
              <span>07</span>
              <strong>
                Штатные операции предпочтительнее
                ручного изменения данных.
              </strong>
            </div>

            <div>
              <span>08</span>
              <strong>
                Перед массовым импортом
                проверяйте исходный Excel.
              </strong>
            </div>

          </div>

        </div>

      </section>


      <!-- =================================================
           19
           FAQ
           ================================================= -->

      <section
        class="help-dropdown-section"
        id="help-faq"
      >

        <button
          type="button"
          class="help-dropdown-header"
          aria-expanded="false"
        >

          <span class="help-section-number">
            19
          </span>

          <span class="help-dropdown-title">

            <small>
              FAQ
            </small>

            <strong>
              Частые вопросы
            </strong>

          </span>

          <span class="help-dropdown-icon">
            +
          </span>

        </button>


        <div class="help-dropdown-body">

          <details class="help-inner-faq">

            <summary>
              Что является основной единицей учёта?
            </summary>

            <div>
              <p>
                Физическая коробка.
                Каждая физическая коробка хранится
                отдельной записью.
              </p>
            </div>

          </details>


          <details class="help-inner-faq">

            <summary>
              Может ли один штрихкод встречаться несколько раз?
            </summary>

            <div>
              <p>
                Да. Это нормальная ситуация,
                если существует несколько физических
                коробок одного товара.
              </p>
            </div>

          </details>


          <details class="help-inner-faq">

            <summary>
              Используется ли «Кол-во в коробке»
              при физическом подборе?
            </summary>

            <div>
              <p>
                Нет.
                В текущей модели физического подбора
                количество определяется отдельными
                физическими записями коробок.
              </p>
            </div>

          </details>


          <details class="help-inner-faq">

            <summary>
              Какой столбец Excel обязателен?
            </summary>

            <div>
              <p>
                Столбец со штрихкодом.
                Остальные распознаваемые поля
                являются дополнительными.
              </p>
            </div>

          </details>


          <details class="help-inner-faq">

            <summary>
              Как лучше хранить штрихкод в Excel?
            </summary>

            <div>
              <p>
                В формате <strong>Текст</strong>.
              </p>
            </div>

          </details>


          <details class="help-inner-faq">

            <summary>
              Можно ли работать с несколькими складами?
            </summary>

            <div>
              <p>
                Да.
                Запись коробки содержит информацию
                о складе, на котором она находится.
              </p>
            </div>

          </details>

        </div>

      </section>


      <!-- =================================================
           20
           ТЕКУЩАЯ ВЕРСИЯ
           ================================================= -->

      <section
        class="help-dropdown-section"
        id="help-current"
      >

        <button
          type="button"
          class="help-dropdown-header"
          aria-expanded="false"
        >

          <span class="help-section-number">
            20
          </span>

          <span class="help-dropdown-title">

            <small>
              SYSTEM STATUS
            </small>

            <strong>
              Текущая версия
            </strong>

          </span>

          <span class="help-dropdown-icon">
            +
          </span>

        </button>


        <div class="help-dropdown-body">

          <p class="help-lead">
            Основные функции, которые доступны
            в текущей Web-версии SKLADAPLAN.
          </p>


          <div class="help-feature-list">

            <div>
              <span>✓</span>
              <strong>База</strong>
              <small>Рабочий раздел</small>
            </div>

            <div>
              <span>✓</span>
              <strong>Приёмка</strong>
              <small>Рабочий раздел</small>
            </div>

            <div>
              <span>✓</span>
              <strong>Подбор</strong>
              <small>Рабочая логика</small>
            </div>

            <div>
              <span>✓</span>
              <strong>Сборка</strong>
              <small>Рабочий раздел</small>
            </div>

            <div>
              <span>✓</span>
              <strong>Скомплектовано</strong>
              <small>Рабочий раздел</small>
            </div>

            <div>
              <span>✓</span>
              <strong>Убыло</strong>
              <small>Рабочий раздел</small>
            </div>

            <div>
              <span>✓</span>
              <strong>Инвентаризация</strong>
              <small>Рабочий инструмент</small>
            </div>

            <div>
              <span>✓</span>
              <strong>Сравнение</strong>
              <small>Рабочий инструмент</small>
            </div>

            <div>
              <span>✓</span>
              <strong>Excel</strong>
              <small>Импорт</small>
            </div>

            <div>
              <span>✓</span>
              <strong>JSON</strong>
              <small>Экспорт</small>
            </div>

            <div>
              <span>✓</span>
              <strong>Резервная копия</strong>
              <small>Инструмент</small>
            </div>

            <div>
              <span>✓</span>
              <strong>Справка</strong>
              <small>Этот раздел</small>
            </div>

          </div>


          <div class="help-note">

            <strong>
              Дальнейшее развитие
            </strong>

            <p>
              Android, Windows, офлайн-режим,
              локальная база с синхронизацией
              и Telegram Mini App относятся
              к будущим этапам развития системы.
            </p>

          </div>

        </div>

      </section>


      <!-- =================================================
           FOOTER
           ================================================= -->

      <footer class="help-footer">

        <div>
          SKLADAPLAN
        </div>

        <p>
          Справка является частью интерфейса системы.
          При изменении функциональности соответствующий
          раздел документации необходимо обновлять.
        </p>

        <a
          href="#help-system"
          class="help-top-link"
        >
          ↑ В начало
        </a>

      </footer>

    </div>

  `;
}


/* =========================================================
   HELP INTERACTION
   ========================================================= */

function setupHelp() {

  const page =
    document.querySelector('.help-page');

  if (!page) {
    return;
  }


  /* -------------------------------------------------------
     ОСНОВНЫЕ ВЫПАДАЮЩИЕ РАЗДЕЛЫ
     ------------------------------------------------------- */

  const sections =
    page.querySelectorAll(
      '.help-dropdown-section'
    );


  sections.forEach(section => {

    const button =
      section.querySelector(
        '.help-dropdown-header'
      );

    if (!button) {
      return;
    }


    button.addEventListener(
      'click',
      () => {

        const isOpen =
          section.classList.contains(
            'is-open'
          );


        section.classList.toggle(
          'is-open',
          !isOpen
        );


        button.setAttribute(
          'aria-expanded',
          String(!isOpen)
        );


        const icon =
          button.querySelector(
            '.help-dropdown-icon'
          );


        if (icon) {

          icon.textContent =
            isOpen
              ? '+'
              : '−';

        }

      }
    );

  });


  /* -------------------------------------------------------
     ВНУТРЕННИЕ FAQ
     ------------------------------------------------------- */

  const innerFaq =
    page.querySelectorAll(
      '.help-inner-faq'
    );


  innerFaq.forEach(item => {

    item.addEventListener(
      'toggle',
      () => {

        if (!item.open) {
          return;
        }

        /*
         * Внутри одного раздела FAQ
         * можно оставить несколько пунктов
         * открытыми.
         */

      }
    );

  });


  /* -------------------------------------------------------
     ЯКОРНАЯ НАВИГАЦИЯ
     ------------------------------------------------------- */

  const links =
    page.querySelectorAll(
      '.help-quick-nav a, .help-top-link'
    );


  links.forEach(link => {

    link.addEventListener(
      'click',
      event => {

        const href =
          link.getAttribute('href');


        if (
          !href ||
          !href.startsWith('#')
        ) {
          return;
        }


        const target =
          document.querySelector(href);


        if (!target) {
          return;
        }


        event.preventDefault();


        /*
         * Если пользователь перешёл
         * к закрытому разделу —
         * автоматически раскрываем его.
         */

        if (
          target.classList.contains(
            'help-dropdown-section'
          )
        ) {

          target.classList.add(
            'is-open'
          );


          const targetButton =
            target.querySelector(
              '.help-dropdown-header'
            );


          if (targetButton) {

            targetButton.setAttribute(
              'aria-expanded',
              'true'
            );


            const targetIcon =
              targetButton.querySelector(
                '.help-dropdown-icon'
              );


            if (targetIcon) {
              targetIcon.textContent = '−';
            }

          }

        }


        /*
         * Небольшая задержка нужна,
         * чтобы браузер успел применить
         * состояние раскрытого блока.
         */

        setTimeout(
          () => {

            target.scrollIntoView({
              behavior: 'smooth',
              block: 'start'
            });

          },
          20
        );


        /*
         * Обновляем hash без резкого
         * прыжка страницы.
         */

        if (
          window.history &&
          window.history.replaceState
        ) {

          window.history.replaceState(
            null,
            '',
            href
          );

        }

      }
    );

  });

}
