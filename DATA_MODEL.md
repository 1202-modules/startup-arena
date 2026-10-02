# Данные v2

SQLite STRICT, user_version=3, foreign_keys=ON, WAL, busy timeout. Деньги — INTEGER cents. Миграции выполняются транзакционно, неоднозначные старые дубликаты имён останавливают миграцию с откатом.

## Таблицы

| Таблица | Данные/инварианты |
| --- | --- |
| events | id, OPEN/FINALIZED, scenario_id 01..06, model_version 1/2, title, даты; один OPEN event |
| participants | event_id, имя/name_key, ru/en, IN_PROGRESS/COMPLETED, текущий раунд 1..3, капитал/cash, итог и даты; один IN_PROGRESS на event; уникальное нормализованное имя на event |
| portfolios | participant_id/round_no UNIQUE, шесть неотрицательных cents-позиций, cash, confirmed, даты; точную сумму проверяет сервер перед записью |
| round_results | participant_id/round_no UNIQUE, капитал до/после, разница, шесть return_bps≥−10000, дата |

Колонки позиций: novamind_cents, medflow_cents, voltx_cents, greenbox_cents, agropulse_cents, orbitlink_cents. В результатах соответствующие *_return_bps. Рейтинг вычисляется по completed capital DESC и стабильным датам/id; одинаковый точный капитал имеет одинаковое competition place.

## Совместимость

v1→v2 схемы: добавление name_key и индексов. v2→v3: прежний scenario_id переименован в legacy_scenario_id (сохраняет старый CHECK 01..03); новый scenario_id допускает 01..06 и копирует старое значение. Существующий model_version=1, новые event создаются с 2. Новые позиции/доходности в старых записях равны 0. legacy_scenario_id у новых event — техническая совместимая заглушка, в выборе рынка не участвует. Рабочая БД и история не удаляются.

## DTO и вычисляемые данные

PublicEventResponse: eventKey, title, startupIds (4 или 6 согласно версии), статус, completedCount, публичный рейтинг. Scenario id, будущие события, шоки, параметры и чужие портфели отсутствуют.

SessionResponse: id, eventKey, startupIds, собственный статус/капитал/портфель, доступный рынок, раскрытые результаты, capitalHistory, собственная roundHistory, report только после завершения. Report — вычисляемые суммы вкладов, лучший раунд, средняя доля cash, максимальная концентрация и локализованные наблюдения. Он не хранится отдельно и воспроизводим из сохранений.

Кабинет: счётчик activePlayers и modelVersion, без имени/портфеля активного участника. CSV содержит место, имя, точные доллары/центы. Резервная копия содержит всю БД мероприятия и выдаётся только организатору; тестовые копии не являются артефактами документации.
