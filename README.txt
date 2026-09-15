SKLADAPLAN — версия с отдельной базой

Файлы:
- index.html — интерфейс
- app.js — логика
- style.css — оформление
- database.json — отдельная база данных

Для Vercel/GitHub все 4 файла должны лежать в одном каталоге.
При изменении database.json и push в GitHub Vercel автоматически обновит сайт.

Важно: сейчас это статическая версия. Изменения в database.json через GitHub являются изменениями исходной базы. Изменения внутри браузера пока не записываются обратно в database.json.

CORE
├── авторизация
├── роли
├── state
├── утилиты
├── форматирование
├── barcode normalization
└── render()

ПРИЁМКА
├── loadReceivingData()
├── createReceivingLocation()
├── getOrCreateReceivingPallet()
├── startReceiving()
├── processReceivingScan()
├── closeReceiving()
└── receiving UI

БАЗА
├── getFilteredBoxes()
├── baseView()
├── baseRow()
├── setupBase()
├── openBoxModal()
├── saveBox()
├── deleteBox()
├── markSelectedForPicking()
└── ...

СБОРКА
├── getPickingBoxes()
├── getGroupedPickingBoxes()
├── assemblyView()
├── setupAssembly()
├── processScan()
├── showBoxFoundModal()
└── completeSelectedAssembly()

СОБРАНО
├── collectedView()
├── collectedRow()
├── setupCollected()
├── setDirectionForCollected()
└── shipSelectedCollected()

ОТГРУЖЕНО
├── shippedView()
└── setupShipped()

ЗАДАЧИ
├── loadTasksFromStorage()
├── saveTasksToStorage()
├── addTask()
├── updateTask()
└── ...

ИНСТРУМЕНТЫ
├── Сравнение
├── Деление
├── Сумма
├── Конвертация
└── Excel

ИНВЕНТАРИЗАЦИЯ
├── getInventoryWarehouses()
├── getInventoryZones()
├── getInventoryPallets()
├── startInventory()
├── inventoryScan()
├── finishInventory()
├── applyInventoryResult()
└── inventory UI

КАРТЫ
├── mapSohHtml()
├── mapNsHtml()
└── mapView()

ДАННЫЕ
├── activity
├── avatars
└── online presence

EXCEL
├── import
├── preview
├── progress
├── export
└── ...

NAVIGATION / RENDER
├── goToPage()
├── render()
├── setupNavigation()
└── startApp()
