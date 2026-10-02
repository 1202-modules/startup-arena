import type { LegacyMarketScenario } from "./types.js";

export const scenario02 = {
  id: "scenario-02",
  title: { ru: "Проблема VoltX", en: "The VoltX setback" },
  rounds: [
    {
      companies: {
        NovaMind: {
          metrics: { revenueThousandsUsd: 500, customers: 2400, expensesThousandsUsd: 445, cashReserveThousandsUsd: 4800 },
          signal: { ru: "Новые клиенты приходят быстро, но расширение требует расходов.", en: "New customers are arriving quickly, but expansion is costly." },
          outcome: { returnBps: 1100, event: { ru: "Несколько компаний подключают продукт.", en: "Several companies adopt the product." } },
        },
        MedFlow: {
          metrics: { revenueThousandsUsd: 330, customers: 1520, expensesThousandsUsd: 248, cashReserveThousandsUsd: 6500 },
          signal: { ru: "Клиники продолжают пользоваться сервисом.", en: "Clinics continue using the service." },
          outcome: { returnBps: 600, event: { ru: "Клиники продлевают договоры.", en: "Clinics renew their contracts." } },
        },
        VoltX: {
          metrics: { revenueThousandsUsd: 155, customers: 270, expensesThousandsUsd: 230, cashReserveThousandsUsd: 3100 },
          signal: { ru: "Испытания нового прототипа задерживаются.", en: "Testing of the new prototype is delayed." },
          outcome: { returnBps: -500, event: { ru: "Команда переносит испытания прототипа.", en: "The team postpones prototype testing." } },
        },
        GreenBox: {
          metrics: { revenueThousandsUsd: 245, customers: 1080, expensesThousandsUsd: 190, cashReserveThousandsUsd: 4300 },
          signal: { ru: "Компания постепенно наращивает число клиентов.", en: "The company is gradually adding customers." },
          outcome: { returnBps: 400, event: { ru: "GreenBox получает небольшого нового клиента.", en: "GreenBox adds a small new customer." } },
        },
      },
    },
    {
      companies: {
        NovaMind: {
          metrics: { revenueThousandsUsd: 565, customers: 2860, expensesThousandsUsd: 500, cashReserveThousandsUsd: 4700 },
          signal: { ru: "Расходы растут, пока компания улучшает экономику продукта.", en: "Costs are rising as the company works to improve unit economics." },
          outcome: { returnBps: 1700, event: { ru: "Новые клиенты быстрее осваивают продукт.", en: "New customers adopt the product faster." } },
        },
        MedFlow: {
          metrics: { revenueThousandsUsd: 362, customers: 1660, expensesThousandsUsd: 267, cashReserveThousandsUsd: 6370 },
          signal: { ru: "Сервис сохраняет стабильный рост.", en: "The service continues to grow steadily." },
          outcome: { returnBps: 700, event: { ru: "К сервису подключаются новые клиники.", en: "New clinics join the service." } },
        },
        VoltX: {
          metrics: { revenueThousandsUsd: 190, customers: 360, expensesThousandsUsd: 251, cashReserveThousandsUsd: 2950 },
          signal: { ru: "Первые лабораторные испытания показывают сильные результаты.", en: "Early laboratory tests show strong results." },
          outcome: { returnBps: 1900, event: { ru: "Испытания проходят лучше ожиданий.", en: "Testing goes better than expected." } },
        },
        GreenBox: {
          metrics: { revenueThousandsUsd: 265, customers: 1190, expensesThousandsUsd: 202, cashReserveThousandsUsd: 4350 },
          signal: { ru: "Компания получает новый B2B-контракт.", en: "The company wins a new B2B contract." },
          outcome: { returnBps: 600, event: { ru: "Новый корпоративный клиент запускает тестирование.", en: "A new business customer begins a pilot." } },
        },
      },
    },
    {
      companies: {
        NovaMind: {
          metrics: { revenueThousandsUsd: 660, customers: 3410, expensesThousandsUsd: 590, cashReserveThousandsUsd: 4500 },
          signal: { ru: "Рост выручки продолжается, вместе с ним растут расходы на инфраструктуру.", en: "Revenue keeps growing, along with infrastructure costs." },
          outcome: { returnBps: 1400, event: { ru: "Новый контракт расширяет аудиторию продукта.", en: "A new contract expands the product's reach." } },
        },
        MedFlow: {
          metrics: { revenueThousandsUsd: 398, customers: 1810, expensesThousandsUsd: 282, cashReserveThousandsUsd: 6250 },
          signal: { ru: "Компания готовит подключение новых медицинских партнёров.", en: "The company is preparing to onboard new healthcare partners." },
          outcome: { returnBps: 800, event: { ru: "Медицинские партнёры подключаются к платформе.", en: "Healthcare partners join the platform." } },
        },
        VoltX: {
          metrics: { revenueThousandsUsd: 225, customers: 445, expensesThousandsUsd: 330, cashReserveThousandsUsd: 2050 },
          signal: { ru: "Подготовка производства обходится дороже, запас денег сокращается; испытания технологии остаются сильными.", en: "Production preparation is costing more and reserves are shrinking, while technology tests remain strong." },
          outcome: { returnBps: -4700, event: { ru: "Ключевой компонент не проходит повторную проверку качества.", en: "A key component fails a repeat quality check." } },
        },
        GreenBox: {
          metrics: { revenueThousandsUsd: 310, customers: 1440, expensesThousandsUsd: 222, cashReserveThousandsUsd: 4450 },
          signal: { ru: "Корпоративные клиенты расширяют использование системы.", en: "Business customers are expanding their use of the system." },
          outcome: { returnBps: 1700, event: { ru: "Крупный клиент переводит новые команды на платформу.", en: "A major customer moves more teams onto the platform." } },
        },
      },
    },
  ],
} satisfies LegacyMarketScenario;
