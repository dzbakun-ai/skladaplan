/* =========================================================
   SKLADAPLAN — СПРАВКА
   Отдельный модуль документации.
   Логика WMS здесь НЕ находится.
   ========================================================= */

function helpView() {
  return `
    <div class="help-page">

      <!-- HERO -->
      <section class="help-hero">
        <div class="help-eyebrow">SKLADAPLAN · СПРАВКА</div>

        <h1>Руководство пользователя</h1>

        <p>
          Полное описание текущей версии SKLADAPLAN:
          работа со складом, коробками, заявками,
          подбором, сборкой, Excel и инструментами.
        </p>

        <div class="help-rule">
          <strong>Главное правило системы</strong>
          <span>
            1 запись в базе = 1 физическая коробка.
          </span>
        </div>
      </section>


      <!-- QUICK NAV -->
      <nav class="help-quick-nav">
        <a href="#help-system">О системе</a>
        <a href="#help-workflow">Процесс</a>
        <a href="#help-dashboard">Главный экран</a>
        <a href="#help-base">База</a>
        <a href="#help-receiving">Приёмка</a>
        <a href="#help-picking">Подбор</a>
        <a href="#help-assembly">Сборка</a>
        <a href="#help-collected">Скомплектовано</a>
        <a href="#help-shipped">Убыло</a>
        <a href="#help-inventory">Инвентаризация</a>
        <a href="#help-comparison">Сравнение</a>
        <a href="#help-excel">Excel</a>
        <a href="#help-statuses">Статусы</a>
        <a href="#help-errors">Ошибки</a>
        <a href="#help-faq">FAQ</a>
      </nav>


      <!-- =================================================
           01. О СИСТЕМЕ
           ================================================= -->

      <section class="help-section" id="help-system">

        <div class="help-section-number">01</div>

        <div class="help-section-content">

          <h2>О системе</h2>

          <p>
            <strong>SKLADAPLAN</strong> — система управления складом,
            предназначенная для учёта физических коробок,
            их размещения, подбора, сборки, перемещения
            и отгрузки.
          </p>

          <p>
            Основная задача системы — заменить ручную работу
            с таблицами и дать сотруднику понятный маршрут:
            от поступления коробки на склад до её отгрузки.
          </p>

          <div class="help-info-grid">

            <div class="help-info-card">
              <span class="help-card-icon">01</span>
              <strong>Физическая коробка</strong>
              <p>
                Каждая физическая коробка представлена
                отдельной записью.
              </p>
            </div>

            <div class="help-info-card">
              <span class="help-card-icon">02</span>
              <strong>Штрихкод</strong>
              <p>
                Один и тот же штрихкод может встречаться
                у нескольких физических коробок.
              </p>
            </div>

            <div class="help-info-card">
              <span class="help-card-icon">03</span>
              <strong>Местоположение</strong>
              <p>
                Коробка может иметь склад, зону/ряд
                и паллету.
              </p>
            </div>

            <div class="help-info-card">
              <span class="help-card-icon">04</span>
              <strong>Статус</strong>
              <p>
                Статус показывает текущее состояние
                физической коробки.
              </p>
            </div>

          </div>

        </div>
      </section>


      <!-- =================================================
           02. ОСНОВНОЙ ПРОЦЕСС
           ================================================= -->

      <section class="help-section" id="help-workflow">

        <div class="help-section-number">02</div>

        <div class="help-section-content">

          <h2>Полный рабочий процесс</h2>

          <p>
            Базовая логика движения коробки выглядит так:
          </p>

          <div class="help-flow">

            <div class="help-flow-item">
              <span>01</span>
              <strong>Приёмка</strong>
              <small>
                Коробка попадает на склад
              </small>
            </div>

            <div class="help-flow-arrow">→</div>

            <div class="help-flow-item">
              <span>02</span>
              <strong>База</strong>
              <small>
                Коробка хранится на складе
              </small>
            </div>

            <div class="help-flow-arrow">→</div>

            <div class="help-flow-item">
              <span>03</span>
              <strong>Подбор</strong>
              <small>
                Коробка резервируется под заявку
              </small>
            </div>

            <div class="help-flow-arrow">→</div>

            <div class="help-flow-item">
              <span>04</span>
              <strong>Сборка</strong>
              <small>
                Заказ физически комплектуется
              </small>
            </div>

            <div class="help-flow-arrow">→</div>

            <div class="help-flow-item">
              <span>05</span>
              <strong>Скомплектовано</strong>
              <small>
                Заказ готов к отгрузке
              </small>
            </div>

            <div class="help-flow-arrow">→</div>

            <div class="help-flow-item">
              <span>06</span>
              <strong>Убыло</strong>
              <small>
                Коробка отгружена
              </small>
            </div>

          </div>

          <div class="help-note">
            <strong>Важно</strong>
            <p>
              Конкретные действия доступны в зависимости
              от текущего статуса коробки и прав пользователя.
            </p>
          </div>

        </div>
      </section>


      <!-- =================================================
           03. ГЛАВНЫЙ ЭКРАН
           ================================================= -->

      <section class="help-section" id="help-dashboard">

        <div class="help-section-number">03</div>

        <div class="help-section-content">

          <h2>Главный экран</h2>

          <p>
            Главный экран предназначен для быстрого контроля
            состояния склада.
          </p>

          <div class="help-list">

            <div>
              <strong>Количество коробок</strong>
              <span>
                Общее количество физических коробок
                в текущей базе.
              </span>
            </div>

            <div>
              <strong>Статусы</strong>
              <span>
                Распределение коробок по текущему состоянию.
              </span>
            </div>

            <div>
              <strong>Склады</strong>
              <span>
                Данные могут быть разделены между складами.
              </span>
            </div>

            <div>
              <strong>Операции</strong>
              <span>
                Через интерфейс можно переходить
                к основным складским процессам.
              </span>
            </div>

          </div>

        </div>
      </section>


      <!-- =================================================
           04. БАЗА
           ================================================= -->

      <section class="help-section" id="help-base">

        <div class="help-section-number">04</div>

        <div class="help-section-content">

          <h2>База</h2>

          <p>
            <strong>База</strong> — основной справочник физических
            коробок, которые известны системе.
          </p>

          <p>
            Именно здесь можно контролировать,
            где находится коробка, какой у неё штрихкод,
            статус, склад и другие данные.
          </p>

          <h3>Основные данные коробки</h3>

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
                    Идентификатор товара/коробки.
                  </td>
                </tr>

                <tr>
                  <td>Артикул</td>
                  <td>
                    Артикул товара, если используется.
                  </td>
                </tr>

                <tr>
                  <td>Кол-во в коробке</td>
                  <td>
                    Количество единиц товара внутри коробки.
                    Не используется как количество физических
                    коробок при текущем подборе.
                  </td>
                </tr>

                <tr>
                  <td>Зона/ряд</td>
                  <td>
                    Местоположение коробки внутри склада.
                  </td>
                </tr>

                <tr>
                  <td>Поддон</td>
                  <td>
                    Идентификатор или обозначение паллеты.
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
                    Пользователь или сотрудник,
                    связанный с изменением записи.
                  </td>
                </tr>

              </tbody>

            </table>
          </div>

          <div class="help-warning">
            <strong>Ключевое правило физического учёта</strong>
            <p>
              Если на складе находятся 10 физических коробок
              с одинаковым штрихкодом, в базе должно быть
              10 отдельных записей.
            </p>
          </div>

        </div>
      </section>


      <!-- =================================================
           05. ПРИЁМКА
           ================================================= -->

      <section class="help-section" id="help-receiving">

        <div class="help-section-number">05</div>

        <div class="help-section-content">

          <h2>Приёмка</h2>

          <p>
            Приёмка используется для занесения физических коробок
            на склад и фиксации их местоположения.
          </p>

          <h3>Перед началом работы</h3>

          <ol class="help-steps">

            <li>
              Выберите склад.
            </li>

            <li>
              Укажите необходимую зону/ряд.
            </li>

            <li>
              При необходимости выберите или создайте паллету.
            </li>

            <li>
              Сканируйте коробки.
            </li>

            <li>
              Проверьте результат в базе.
            </li>

          </ol>

          <div class="help-note">
            <strong>Совет</strong>
            <p>
              После приёмки рекомендуется проверить,
              что коробки получили правильный склад,
              зону/ряд и паллету.
            </p>
          </div>

        </div>
      </section>


      <!-- =================================================
           06. ЗАЯВКИ И ПОДБОР
           ================================================= -->

      <section class="help-section" id="help-picking">

        <div class="help-section-number">06</div>

        <div class="help-section-content">

          <h2>Заявки и подбор</h2>

          <p>
            Подбор используется для превращения потребности
            в конкретные физические коробки на складе.
          </p>

          <h3>Главный принцип</h3>

          <div class="help-rule large">
            <strong>
              Заявка указывает, сколько физических коробок
              необходимо подобрать.
            </strong>

            <span>
              Система ищет реальные записи коробок в базе.
            </span>
          </div>

          <h3>Пример</h3>

          <div class="help-example">

            <div class="help-example-row">
              <span>Заявка</span>
              <code>4810122638540</code>
              <strong>× 3</strong>
            </div>

            <div class="help-example-arrow">↓</div>

            <div class="help-example-row">
              <span>База</span>
              <code>4810122638540</code>
              <strong>3 физические коробки</strong>
            </div>

            <div class="help-example-arrow">↓</div>

            <div class="help-example-row">
              <span>Результат</span>
              <strong>
                3 конкретные физические коробки
                переводятся в очередь подбора
              </strong>
            </div>

          </div>

          <h3>Повторяющийся штрихкод</h3>

          <p>
            Повторение одного штрихкода в заявке означает,
            что необходимо подобрать несколько физических коробок
            с этим штрихкодом.
          </p>

          <div class="help-warning">
            <strong>Важно</strong>
            <p>
              В текущей модели количество товара внутри коробки
              не заменяет количество физических коробок.
            </p>
          </div>

          <p>
            Например, если в заявке штрихкод встречается
            12 раз, система должна искать 12 отдельных
            физических коробок с этим штрихкодом.
          </p>

        </div>
      </section>


      <!-- =================================================
           07. СБОРКА
           ================================================= -->

      <section class="help-section" id="help-assembly">

        <div class="help-section-number">07</div>

        <div class="help-section-content">

          <h2>Сборка</h2>

          <p>
            <strong>Сборка</strong> — рабочее место сотрудника,
            который физически комплектует отобранные коробки.
          </p>

          <p>
            В этой части системы отображаются коробки,
            подготовленные к физическому подбору и сборке.
          </p>

          <h3>Основные действия</h3>

          <div class="help-list">

            <div>
              <strong>Просмотр очереди</strong>
              <span>
                Просмотр коробок, ожидающих обработки.
              </span>
            </div>

            <div>
              <strong>Выбор коробок</strong>
              <span>
                Можно работать с отдельными коробками
                или группами.
              </span>
            </div>

            <div>
              <strong>Выбор всех</strong>
              <span>
                Быстрый выбор доступных позиций.
              </span>
            </div>

            <div>
              <strong>Сканирование</strong>
              <span>
                Проверка коробок по штрихкоду.
              </span>
            </div>

            <div>
              <strong>Текущая паллета</strong>
              <span>
                Возможность ограничить работу текущей паллетой.
              </span>
            </div>

            <div>
              <strong>Возврат на склад</strong>
              <span>
                Возврат выбранных коробок обратно
                в складской остаток.
              </span>
            </div>

            <div>
              <strong>Завершение сборки</strong>
              <span>
                Перевод выбранных коробок
                в следующий этап процесса.
              </span>
            </div>

          </div>

          <div class="help-warning">
            <strong>Важно для текущей версии</strong>
            <p>
              Логика подбора и текущая логика Сборки являются
              рабочей частью системы. Не следует изменять их
              без отдельной проверки всего складского процесса.
            </p>
          </div>

        </div>
      </section>


      <!-- =================================================
           08. СКОМПЛЕКТОВАНО
           ================================================= -->

      <section class="help-section" id="help-collected">

        <div class="help-section-number">08</div>

        <div class="help-section-content">

          <h2>Скомплектовано</h2>

          <p>
            Здесь находятся коробки, которые уже прошли этап
            физической сборки и готовы к следующему этапу.
          </p>

          <h3>Основная задача раздела</h3>

          <ul class="help-bullets">
            <li>контролировать готовые коробки;</li>
            <li>проверять направление или заявку;</li>
            <li>отбирать необходимые позиции;</li>
            <li>передавать готовые коробки на отгрузку.</li>
          </ul>

        </div>
      </section>


      <!-- =================================================
           09. УБЫЛО
           ================================================= -->

      <section class="help-section" id="help-shipped">

        <div class="help-section-number">09</div>

        <div class="help-section-content">

          <h2>Убыло</h2>

          <p>
            Раздел <strong>Убыло</strong> содержит коробки,
            которые были отгружены со склада.
          </p>

          <p>
            Это фактически история движения отгруженных
            физических коробок.
          </p>

          <div class="help-note">
            <strong>Важно</strong>
            <p>
              После отгрузки коробка не должна продолжать
              считаться доступным складским остатком.
            </p>
          </div>

        </div>
      </section>


      <!-- =================================================
           10. ИНВЕНТАРИЗАЦИЯ
           ================================================= -->

      <section class="help-section" id="help-inventory">

        <div class="help-section-number">10</div>

        <div class="help-section-content">

          <h2>Инвентаризация</h2>

          <p>
            Инвентаризация позволяет проверить фактическое
            наличие коробок на выбранном участке склада
            и сравнить его с данными системы.
          </p>

          <h3>Принцип работы</h3>

          <ol class="help-steps">

            <li>
              Выберите склад.
            </li>

            <li>
              Выберите необходимую зону/ряд.
            </li>

            <li>
              Выберите паллету, если это необходимо.
            </li>

            <li>
              Начните сканирование фактических коробок.
            </li>

            <li>
              Система сравнит фактические данные
              с ожидаемыми.
            </li>

          </ol>

          <h3>Результаты проверки</h3>

          <div class="help-status-grid">

            <div class="help-status-card">
              <span>✓</span>
              <strong>Найдено</strong>
              <p>
                Коробка присутствует там,
                где ожидает система.
              </p>
            </div>

            <div class="help-status-card">
              <span>!</span>
              <strong>Не хватает</strong>
              <p>
                Коробка ожидается системой,
                но фактически не была найдена.
              </p>
            </div>

            <div class="help-status-card">
              <span>?</span>
              <strong>Неизвестная</strong>
              <p>
                Коробка отсканирована,
                но отсутствует среди ожидаемых.
              </p>
            </div>

          </div>

        </div>
      </section>


      <!-- =================================================
           11. СРАВНЕНИЕ
           ================================================= -->

      <section class="help-section" id="help-comparison">

        <div class="help-section-number">11</div>

        <div class="help-section-content">

          <h2>Сравнение</h2>

          <p>
            Инструмент сравнения предназначен для проверки
            плановых и фактических данных.
          </p>

          <p>
            Он помогает увидеть расхождения:
          </p>

          <div class="help-status-grid">

            <div class="help-status-card">
              <span>✓</span>
              <strong>Точно в план</strong>
              <p>
                Фактическое количество соответствует плану.
              </p>
            </div>

            <div class="help-status-card">
              <span>!</span>
              <strong>Не хватает</strong>
              <p>
                Фактического количества меньше,
                чем требуется.
              </p>
            </div>

            <div class="help-status-card">
              <span>×</span>
              <strong>Лишние</strong>
              <p>
                Фактического количества больше,
                чем указано в плане.
              </p>
            </div>

          </div>

        </div>
      </section>


      <!-- =================================================
           12. EXCEL
           ================================================= -->

      <section class="help-section" id="help-excel">

        <div class="help-section-number">12</div>

        <div class="help-section-content">

          <h2>Excel</h2>

          <p>
            SKLADAPLAN поддерживает импорт Excel-файлов
            для загрузки складских данных.
          </p>

          <div class="help-rule">
            <strong>Поддерживаемые файлы</strong>
            <span>
              .xlsx и .xls
            </span>
          </div>

          <h3>Как должен быть подготовлен файл</h3>

          <ol class="help-steps">

            <li>
              Откройте Excel.
            </li>

            <li>
              В первой строке разместите названия столбцов.
            </li>

            <li>
              На каждом следующем ряду укажите данные
              одной физической коробки.
            </li>

            <li>
              Убедитесь, что присутствует столбец
              со штрихкодом.
            </li>

            <li>
              Сохраните файл в формате
              <strong>.xlsx</strong> или <strong>.xls</strong>.
            </li>

            <li>
              Импортируйте файл через инструменты SKLADAPLAN.
            </li>

          </ol>


          <h3>Столбцы Excel</h3>

          <div class="help-table-wrap">

            <table class="help-table excel-table">

              <thead>
                <tr>
                  <th>Поле</th>
                  <th>Обязательно</th>
                  <th>Рекомендуемый формат</th>
                  <th>Пример</th>
                </tr>
              </thead>

              <tbody>

                <tr>
                  <td>
                    <strong>Штрихкод</strong>
                  </td>

                  <td>
                    <span class="help-required">ДА</span>
                  </td>

                  <td>
                    Текст
                  </td>

                  <td>
                    <code>4810122638540</code>
                  </td>
                </tr>

                <tr>
                  <td>
                    Артикул
                  </td>

                  <td>
                    Нет
                  </td>

                  <td>
                    Текст
                  </td>

                  <td>
                    <code>ABC-123</code>
                  </td>
                </tr>

                <tr>
                  <td>
                    Кол-во в коробке
                  </td>

                  <td>
                    Нет
                  </td>

                  <td>
                    Число
                  </td>

                  <td>
                    <code>12</code>
                  </td>
                </tr>

                <tr>
                  <td>
                    Зона/ряд
                  </td>

                  <td>
                    Нет
                  </td>

                  <td>
                    Текст
                  </td>

                  <td>
                    <code>A-01-05</code>
                  </td>
                </tr>

                <tr>
                  <td>
                    Поддон
                  </td>

                  <td>
                    Нет
                  </td>

                  <td>
                    Текст
                  </td>

                  <td>
                    <code>P-001</code>
                  </td>
                </tr>

                <tr>
                  <td>
                    Статус
                  </td>

                  <td>
                    Нет
                  </td>

                  <td>
                    Текст
                  </td>

                  <td>
                    <code>На складе</code>
                  </td>
                </tr>

                <tr>
                  <td>
                    Дата размещения
                  </td>

                  <td>
                    Нет
                  </td>

                  <td>
                    Дата
                  </td>

                  <td>
                    <code>10.09.2026</code>
                  </td>
                </tr>

                <tr>
                  <td>
                    Склад
                  </td>

                  <td>
                    Нет
                  </td>

                  <td>
                    Текст
                  </td>

                  <td>
                    <code>СОХ</code>
                  </td>
                </tr>

                <tr>
                  <td>
                    Изменил
                  </td>

                  <td>
                    Нет
                  </td>

                  <td>
                    Текст
                  </td>

                  <td>
                    <code>Иван</code>
                  </td>
                </tr>

              </tbody>

            </table>

          </div>


          <h3>Распознаваемые названия столбцов</h3>

          <p>
            Система умеет распознавать несколько вариантов
            названий одного и того же поля.
          </p>

          <div class="help-alias-grid">

            <div>
              <strong>Штрихкод</strong>
              <code>
                Штрихкод · barcode · баркод · код · штрих код
              </code>
            </div>

            <div>
              <strong>Артикул</strong>
              <code>
                Артикул · article · sku
              </code>
            </div>

            <div>
              <strong>Количество</strong>
              <code>
                Кол-во в коробке · Количество в коробке ·
                Количество · quantityinbox
              </code>
            </div>

            <div>
              <strong>Зона / ряд</strong>
              <code>
                Зона/ряд · Зона · Ряд · zonerow ·
                location · место
              </code>
            </div>

            <div>
              <strong>Паллет</strong>
              <code>
                Поддон · Паллета · pallet
              </code>
            </div>

            <div>
              <strong>Статус</strong>
              <code>
                Статус · status
              </code>
            </div>

            <div>
              <strong>Дата</strong>
              <code>
                Дата размещения · Дата · date
              </code>
            </div>

            <div>
              <strong>Склад</strong>
              <code>
                Склад · warehouse
              </code>
            </div>

            <div>
              <strong>Работник</strong>
              <code>
                Изменил · Кто работал · worker
              </code>
            </div>

          </div>


          <h3>Какой формат ячеек использовать</h3>

          <div class="help-format-list">

            <div>
              <strong>Штрихкод → Текст</strong>
              <p>
                Это самый безопасный вариант.
                Он предотвращает потерю ведущих нулей
                и нежелательное преобразование длинных кодов
                в научную запись.
              </p>
            </div>

            <div>
              <strong>Артикул → Текст</strong>
              <p>
                Особенно важно, если артикул содержит буквы,
                дефисы или ведущие нули.
              </p>
            </div>

            <div>
              <strong>Кол-во в коробке → Число</strong>
              <p>
                Если поле используется, лучше хранить
                его как числовое значение.
              </p>
            </div>

            <div>
              <strong>Зона/ряд → Текст</strong>
              <p>
                Например: A-01-01, A-01-20, НИЗСПРАВА.
              </p>
            </div>

            <div>
              <strong>Поддон → Текст</strong>
              <p>
                Например: P-001 или любой другой
                идентификатор паллеты.
              </p>
            </div>

            <div>
              <strong>Статус → Текст</strong>
              <p>
                Значение статуса должно быть записано
                без лишних символов.
              </p>
            </div>

            <div>
              <strong>Дата → Дата</strong>
              <p>
                Используйте обычный формат даты Excel.
              </p>
            </div>

            <div>
              <strong>Склад → Текст</strong>
              <p>
                Например: СОХ или №7.
              </p>
            </div>

            <div>
              <strong>Изменил → Текст</strong>
              <p>
                Имя пользователя или сотрудника.
              </p>
            </div>

          </div>


          <div class="help-warning">

            <strong>
              Важно: штрихкод лучше всегда хранить как текст
            </strong>

            <p>
              Excel может автоматически преобразовать длинный
              штрихкод в число или научную запись.
              В результате исходный код может быть повреждён
              ещё до импорта в SKLADAPLAN.
            </p>

          </div>


          <h3>Пример правильного Excel</h3>

          <div class="help-code-table">

            <div class="help-code-header">
              <span>Штрихкод</span>
              <span>Артикул</span>
              <span>Кол-во в коробке</span>
              <span>Зона/ряд</span>
              <span>Поддон</span>
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
              Повторение штрихкода — это нормально
            </strong>

            <p>
              В примере первые две строки имеют одинаковый
              штрихкод, потому что это две отдельные физические
              коробки одного товара.
            </p>

          </div>


          <h3>Что сейчас важно помнить</h3>

          <ul class="help-bullets">

            <li>
              Для импорта обязательно наличие столбца
              со штрихкодом.
            </li>

            <li>
              Остальные распознаваемые столбцы являются
              дополнительными.
            </li>

            <li>
              Пустые или некорректные штрихкоды не следует
              использовать как идентификатор коробки.
            </li>

            <li>
              Первая рабочая страница Excel используется
              для импорта текущим механизмом.
            </li>

            <li>
              Один ряд складских данных должен описывать
              одну физическую коробку.
            </li>

          </ul>

        </div>
      </section>


      <!-- =================================================
           13. СТАТУСЫ
           ================================================= -->

      <section class="help-section" id="help-statuses">

        <div class="help-section-number">13</div>

        <div class="help-section-content">

          <h2>Статусы коробок</h2>

          <p>
            Статус показывает, на каком этапе находится
            физическая коробка.
          </p>

          <div class="help-status-table">

            <div class="help-status-row">

              <div class="help-status-name">
                На складе
              </div>

              <div>
                Коробка находится в доступном складском остатке.
              </div>

            </div>

            <div class="help-status-row">

              <div class="help-status-name">
                Зарезервирована
              </div>

              <div>
                Коробка закреплена за необходимым процессом
                или заявкой.
              </div>

            </div>

            <div class="help-status-row">

              <div class="help-status-name">
                КПодбору
              </div>

              <div>
                Коробка выбрана для физического подбора.
              </div>

            </div>

            <div class="help-status-row">

              <div class="help-status-name">
                Скомплектовано
              </div>

              <div>
                Коробка прошла этап сборки
                и готова к следующему этапу.
              </div>

            </div>

            <div class="help-status-row">

              <div class="help-status-name">
                Отгружено
              </div>

              <div>
                Коробка покинула склад.
              </div>

            </div>

            <div class="help-status-row">

              <div class="help-status-name">
                Пустая
              </div>

              <div>
                Специальный статус, используемый системой
                для обозначения соответствующего состояния
                коробки.
              </div>

            </div>

          </div>

        </div>
      </section>


      <!-- =================================================
           14. СКЛАДЫ
           ================================================= -->

      <section class="help-section" id="help-warehouses">

        <div class="help-section-number">14</div>

        <div class="help-section-content">

          <h2>Склады, зоны, ряды и паллеты</h2>

          <p>
            SKLADAPLAN позволяет учитывать не только сам склад,
            но и более точное местоположение коробки.
          </p>

          <div class="help-location">

            <div>
              <span>СКЛАД</span>
              <strong>СОХ</strong>
            </div>

            <div>→</div>

            <div>
              <span>ЗОНА / РЯД</span>
              <strong>A-01-05</strong>
            </div>

            <div>→</div>

            <div>
              <span>ПАЛЛЕТА</span>
              <strong>P-001</strong>
            </div>

          </div>

          <p>
            Благодаря этому система может понимать,
            где физически находится конкретная коробка.
          </p>

          <div class="help-note">

            <strong>
              Пример
            </strong>

            <p>
              Одинаковый штрихкод может находиться
              одновременно на разных паллетах и в разных рядах.
              Поэтому для идентификации физической коробки
              важна не только сама строка штрихкода.
            </p>

          </div>

        </div>
      </section>


      <!-- =================================================
           15. ИНСТРУМЕНТЫ
           ================================================= -->

      <section class="help-section" id="help-tools">

        <div class="help-section-number">15</div>

        <div class="help-section-content">

          <h2>Инструменты</h2>

          <p>
            Раздел инструментов объединяет вспомогательные
            функции системы.
          </p>

          <div class="help-tools-grid">

            <div>
              <strong>Excel</strong>
              <span>
                Импорт складских данных из Excel.
              </span>
            </div>

            <div>
              <strong>JSON</strong>
              <span>
                Экспорт данных в JSON.
              </span>
            </div>

            <div>
              <strong>Резервная копия</strong>
              <span>
                Создание резервной копии данных
                доступным механизмом приложения.
              </span>
            </div>

            <div>
              <strong>Инвентаризация</strong>
              <span>
                Проверка фактического наличия коробок.
              </span>
            </div>

            <div>
              <strong>Справка</strong>
              <span>
                Текущее руководство пользователя.
              </span>
            </div>

          </div>

          <div class="help-note">

            <strong>
              Дополнительные пункты меню
            </strong>

            <p>
              В интерфейсе могут присутствовать пункты
              инструментов, которые являются частью
              дальнейшего развития системы. Не следует считать
              функцию полностью готовой только по наличию
              соответствующего пункта меню.
            </p>

          </div>

        </div>
      </section>


      <!-- =================================================
           16. ПОЛЬЗОВАТЕЛИ
           ================================================= -->

      <section class="help-section" id="help-users">

        <div class="help-section-number">16</div>

        <div class="help-section-content">

          <h2>Пользователи и права</h2>

          <p>
            SKLADAPLAN рассчитан на работу нескольких
            пользователей с различными задачами.
          </p>

          <h3>Рекомендуемая модель</h3>

          <div class="help-role-grid">

            <div>
              <strong>Администратор</strong>
              <p>
                Управление данными, настройками и пользователями.
              </p>
            </div>

            <div>
              <strong>Сотрудник склада</strong>
              <p>
                Работа с приёмкой, подбором, сборкой
                и складскими операциями.
              </p>
            </div>

            <div>
              <strong>Просмотр</strong>
              <p>
                Контроль информации без выполнения
                критических изменений.
              </p>
            </div>

          </div>

          <div class="help-warning">

            <strong>
              Безопасность
            </strong>

            <p>
              Ограничение кнопок в интерфейсе само по себе
              не является полноценной защитой данных.
              Для окончательного разграничения доступа
              должны использоваться серверные правила
              и политики базы данных.
            </p>

          </div>

        </div>
      </section>


      <!-- =================================================
           17. ОШИБКИ
           ================================================= -->

      <section class="help-section" id="help-errors">

        <div class="help-section-number">17</div>

        <div class="help-section-content">

          <h2>Типичные ошибки</h2>


          <details class="help-faq" open>

            <summary>
              Excel не импортируется
            </summary>

            <div>
              <p>
                Проверьте:
              </p>

              <ul class="help-bullets">
                <li>файл имеет формат .xlsx или .xls;</li>
                <li>в первой строке находятся заголовки;</li>
                <li>существует столбец Штрихкод;</li>
                <li>штрихкоды заполнены;</li>
                <li>файл не повреждён.</li>
              </ul>
            </div>

          </details>


          <details class="help-faq">

            <summary>
              Штрихкод выглядит как 4.81012E+12
            </summary>

            <div>

              <p>
                Excel преобразовал длинный код в научную запись.
              </p>

              <p>
                Перед сохранением файла установите для столбца
                штрихкодов формат <strong>Текст</strong>.
              </p>

            </div>

          </details>


          <details class="help-faq">

            <summary>
              Один штрихкод встречается много раз
            </summary>

            <div>

              <p>
                Это нормально, если на складе находится
                несколько физических коробок одного товара.
              </p>

              <p>
                Повторение штрихкода не означает,
                что нужно объединять физические коробки
                в одну запись.
              </p>

            </div>

          </details>


          <details class="help-faq">

            <summary>
              В заявке нужно 12 коробок, а система находит меньше
            </summary>

            <div>

              <p>
                Проверьте фактический остаток коробок
                с этим штрихкодом и их статус.
              </p>

              <p>
                Для подбора нужны реальные физические записи
                коробок со статусом, позволяющим использовать
                их в подборе.
              </p>

            </div>

          </details>


          <details class="help-faq">

            <summary>
              Коробка есть физически, но система её не находит
            </summary>

            <div>

              <p>
                Проверьте:
              </p>

              <ul class="help-bullets">
                <li>точность штрихкода;</li>
                <li>склад;</li>
                <li>статус;</li>
                <li>зону/ряд;</li>
                <li>паллета.</li>
              </ul>

            </div>

          </details>

        </div>
      </section>


      <!-- =================================================
           18. ГЛАВНЫЕ ПРАВИЛА
           ================================================= -->

      <section class="help-section" id="help-rules">

        <div class="help-section-number">18</div>

        <div class="help-section-content">

          <h2>Главные правила SKLADAPLAN</h2>

          <div class="help-rules-list">

            <div>
              <span>01</span>
              <strong>
                1 запись = 1 физическая коробка.
              </strong>
            </div>

            <div>
              <span>02</span>
              <strong>
                Повторяющийся штрихкод может означать
                несколько физических коробок.
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
                Подбор работает с реальными физическими
                записями коробок.
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
                Изменение статуса отражает движение
                коробки по складскому процессу.
              </strong>
            </div>

            <div>
              <span>07</span>
              <strong>
                Не следует вручную изменять данные,
                если для этого существует штатная операция.
              </strong>
            </div>

            <div>
              <span>08</span>
              <strong>
                Перед массовым импортом всегда проверяйте
                исходный Excel.
              </strong>
            </div>

          </div>

        </div>
      </section>


      <!-- =================================================
           19. FAQ
           ================================================= -->

      <section class="help-section" id="help-faq">

        <div class="help-section-number">19</div>

        <div class="help-section-content">

          <h2>FAQ</h2>


          <details class="help-faq" open>

            <summary>
              Что является основной единицей учёта?
            </summary>

            <div>
              <p>
                Физическая коробка.
                Каждая физическая коробка должна иметь
                отдельную запись в базе.
              </p>
            </div>

          </details>


          <details class="help-faq">

            <summary>
              Может ли один штрихкод встречаться несколько раз?
            </summary>

            <div>
              <p>
                Да. Это нормальная ситуация,
                если существует несколько физических коробок
                одного товара.
              </p>
            </div>

          </details>


          <details class="help-faq">

            <summary>
              Используется ли «Кол-во в коробке»
              при физическом подборе?
            </summary>

            <div>
              <p>
                Нет. В текущей модели физического подбора
                количество коробок определяется количеством
                отдельных физических записей.
              </p>
            </div>

          </details>


          <details class="help-faq">

            <summary>
              Какой столбец Excel обязателен?
            </summary>

            <div>
              <p>
                Столбец со штрихкодом.
                Остальные распознаваемые поля являются
                дополнительными.
              </p>
            </div>

          </details>


          <details class="help-faq">

            <summary>
              Как лучше хранить штрихкод в Excel?
            </summary>

            <div>
              <p>
                В формате <strong>Текст</strong>.
              </p>
            </div>

          </details>


          <details class="help-faq">

            <summary>
              Что делать, если в Excel нет какого-то необязательного столбца?
            </summary>

            <div>
              <p>
                Если отсутствует необязательное поле,
                его можно не добавлять.
                Главное — чтобы система могла определить
                столбец штрихкода.
              </p>
            </div>

          </details>


          <details class="help-faq">

            <summary>
              Нужно ли вручную менять статус коробки?
            </summary>

            <div>
              <p>
                По возможности используйте штатные операции
                системы, которые автоматически меняют статус
                в соответствии с процессом.
              </p>
            </div>

          </details>


          <details class="help-faq">

            <summary>
              Можно ли работать с несколькими складами?
            </summary>

            <div>
              <p>
                Да. Данные коробки содержат поле склада,
                а текущая система предусматривает работу
                с несколькими складскими площадками.
              </p>
            </div>

          </details>

        </div>
      </section>


      <!-- =================================================
           20. СТАТУС ТЕКУЩЕЙ СИСТЕМЫ
           ================================================= -->

      <section class="help-section" id="help-current">

        <div class="help-section-number">20</div>

        <div class="help-section-content">

          <h2>Что есть в текущей версии</h2>

          <div class="help-feature-status">

            <div class="is-active">
              <span>✓</span>
              <strong>База</strong>
              <small>Рабочий раздел</small>
            </div>

            <div class="is-active">
              <span>✓</span>
              <strong>Приёмка</strong>
              <small>Рабочий раздел</small>
            </div>

            <div class="is-active">
              <span>✓</span>
              <strong>Подбор</strong>
              <small>Рабочая логика</small>
            </div>

            <div class="is-active">
              <span>✓</span>
              <strong>Сборка</strong>
              <small>Рабочий раздел</small>
            </div>

            <div class="is-active">
              <span>✓</span>
              <strong>Скомплектовано</strong>
              <small>Рабочий раздел</small>
            </div>

            <div class="is-active">
              <span>✓</span>
              <strong>Убыло</strong>
              <small>Рабочий раздел</small>
            </div>

            <div class="is-active">
              <span>✓</span>
              <strong>Инвентаризация</strong>
              <small>Рабочий инструмент</small>
            </div>

            <div class="is-active">
              <span>✓</span>
              <strong>Сравнение</strong>
              <small>Рабочий инструмент</small>
            </div>

            <div class="is-active">
              <span>✓</span>
              <strong>Excel</strong>
              <small>Импорт / экспорт</small>
            </div>

            <div class="is-active">
              <span>✓</span>
              <strong>JSON</strong>
              <small>Экспорт данных</small>
            </div>

            <div class="is-active">
              <span>✓</span>
              <strong>Резервная копия</strong>
              <small>Инструмент</small>
            </div>

            <div class="is-active">
              <span>✓</span>
              <strong>Справка</strong>
              <small>Этот раздел</small>
            </div>

          </div>

          <div class="help-note">

            <strong>
              Будущие платформы
            </strong>

            <p>
              Android, Windows, офлайн-режим,
              локальная база и синхронизация,
              а также Telegram Mini App
              являются направлениями дальнейшего развития
              и не относятся к текущей Web-версии.
            </p>

          </div>

        </div>
      </section>


      <!-- =================================================
           FOOTER
           ================================================= -->

      <section class="help-footer">

        <div class="help-footer-mark">
          SKLADAPLAN
        </div>

        <p>
          Эта справка является частью интерфейса системы.
          При изменении функциональности соответствующий раздел
          документации должен обновляться одновременно с системой.
        </p>

        <a href="#help-system" class="help-top-link">
          ↑ В начало справки
        </a>

      </section>

    </div>
  `;
}


/* =========================================================
   Безопасный переход к разделу справки.
   Используется только если браузер поддерживает scrollIntoView.
   ========================================================= */

function setupHelp() {

  const links = document.querySelectorAll(
    '.help-quick-nav a, .help-top-link'
  );

  links.forEach(link => {

    link.addEventListener('click', event => {

      const href =
        link.getAttribute('href');

      if (!href || !href.startsWith('#')) {
        return;
      }

      const target =
        document.querySelector(href);

      if (!target) {
        return;
      }

      event.preventDefault();

      target.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });

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

    });

  });

}
