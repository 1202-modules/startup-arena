import type { LegacyMarketScenario } from "./types.js";

export const scenario03 = {
  id: "scenario-03",
  title: { ru: "Удар по GreenBox", en: "GreenBox under pressure" },
  rounds: [
    {
      companies: {
        NovaMind: {
          metrics: { revenueThousandsUsd: 510, customers: 2460, expensesThousandsUsd: 452, cashReserveThousandsUsd: 4750 },
          signal: { ru: "Продукт быстро набирает пользователей, затраты на расширение остаются высокими.", en: "The product is gaining users quickly, while expansion costs remain high." },
          outcome: { returnBps: 1300, event: { ru: "Новая группа клиентов подключается к продукту.", en: "A new group of customers adopts the product." } },
        },
        MedFlow: {
          metrics: { revenueThousandsUsd: 335, customers: 1540, expensesThousandsUsd: 252, cashReserveThousandsUsd: 6550 },
          signal: { ru: "Медицинские организации сохраняют интерес к сервису.", en: "Healthcare organizations remain interested in the service." },
          outcome: { returnBps: 500, event: { ru: "Клиники продолжают пользоваться платформой.", en: "Clinics continue using the platform." } },
        },
        VoltX: {
          metrics: { revenueThousandsUsd: 170, customers: 300, expensesThousandsUsd: 235, cashReserveThousandsUsd: 3000 },
          signal: { ru: "Испытания прототипа требуют дополнительного времени.", en: "Prototype testing needs more time." },
          outcome: { returnBps: -700, event: { ru: "Испытания опытного образца задерживаются.", en: "Prototype testing is delayed." } },
        },
        GreenBox: {
          metrics: { revenueThousandsUsd: 255, customers: 1150, expensesThousandsUsd: 195, cashReserveThousandsUsd: 4400 },
          signal: { ru: "GreenBox постепенно расширяет клиентскую базу.", en: "GreenBox is gradually expanding its customer base." },
          outcome: { returnBps: 600, event: { ru: "Новый логистический клиент подключает команду.", en: "A new logistics customer brings a team onto the system." } },
        },
      },
    },
    {
      companies: {
        NovaMind: {
          metrics: { revenueThousandsUsd: 580, customers: 2950, expensesThousandsUsd: 530, cashReserveThousandsUsd: 4560 },
          signal: { ru: "Выручка и число клиентов растут, компания расширяет инфраструктуру.", en: "Revenue and customer numbers are rising as the company expands infrastructure." },
          outcome: { returnBps: 1800, event: { ru: "Компания запускает продукт для новых команд.", en: "The company launches its product for new teams." } },
        },
        MedFlow: {
          metrics: { revenueThousandsUsd: 362, customers: 1680, expensesThousandsUsd: 270, cashReserveThousandsUsd: 6470 },
          signal: { ru: "Показатели остаются устойчивыми.", en: "Performance remains steady." },
          outcome: { returnBps: 700, event: { ru: "Клиники продлевают договоры на сервис.", en: "Clinics renew their service agreements." } },
        },
        VoltX: {
          metrics: { revenueThousandsUsd: 204, customers: 385, expensesThousandsUsd: 267, cashReserveThousandsUsd: 2810 },
          signal: { ru: "Сильные результаты испытаний делают проект заметнее.", en: "Strong test results are drawing attention to the project." },
          outcome: { returnBps: 2000, event: { ru: "Технология показывает сильные результаты в испытаниях.", en: "The technology performs strongly in testing." } },
        },
        GreenBox: {
          metrics: { revenueThousandsUsd: 281, customers: 1300, expensesThousandsUsd: 209, cashReserveThousandsUsd: 4450 },
          signal: { ru: "Компания заключает B2B-договор и начинает работать с крупными заказчиками.", en: "The company wins a B2B deal and starts serving larger customers." },
          outcome: { returnBps: 900, event: { ru: "Крупный заказчик запускает тестирование системы.", en: "A large customer starts testing the system." } },
        },
      },
    },
    {
      companies: {
        NovaMind: {
          metrics: { revenueThousandsUsd: 620, customers: 3210, expensesThousandsUsd: 610, cashReserveThousandsUsd: 4300 },
          signal: { ru: "Темп роста выручки становится спокойнее, расходы на команду продолжают расти.", en: "Revenue growth is moderating while team costs continue to rise." },
          outcome: { returnBps: 700, event: { ru: "NovaMind продолжает расширяться без резкого скачка.", en: "NovaMind continues to expand at a measured pace." } },
        },
        MedFlow: {
          metrics: { revenueThousandsUsd: 410, customers: 1940, expensesThousandsUsd: 293, cashReserveThousandsUsd: 6250 },
          signal: { ru: "MedFlow тестирует продукт для крупной сети клиник.", en: "MedFlow is testing its product with a major clinic network." },
          outcome: { returnBps: 2100, event: { ru: "Компания подписывает договор с крупной сетью клиник.", en: "The company signs an agreement with a major clinic network." } },
        },
        VoltX: {
          metrics: { revenueThousandsUsd: 228, customers: 420, expensesThousandsUsd: 322, cashReserveThousandsUsd: 2430 },
          signal: { ru: "Подготовка опытного производства повышает затраты.", en: "Preparing pilot production is increasing costs." },
          outcome: { returnBps: -1200, event: { ru: "Опытная партия обходится дороже расчётов.", en: "The pilot batch costs more than expected." } },
        },
        GreenBox: {
          metrics: { revenueThousandsUsd: 305, customers: 1410, expensesThousandsUsd: 245, cashReserveThousandsUsd: 4230 },
          signal: { ru: "Заметная часть выручки связана с двумя заказчиками; один пересматривает логистику.", en: "A meaningful share of revenue comes from two customers; one is reviewing its logistics plans." },
          outcome: { returnBps: -3300, event: { ru: "GreenBox теряет крупного клиента.", en: "GreenBox loses a major customer." } },
        },
      },
    },
  ],
} satisfies LegacyMarketScenario;
