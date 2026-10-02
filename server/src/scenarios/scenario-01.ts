import type { LegacyMarketScenario } from "./types.js";

export const scenario01 = {
  id: "scenario-01",
  title: { ru: "Перегрев NovaMind", en: "NovaMind overheats" },
  rounds: [
    {
      companies: {
        NovaMind: {
          metrics: { revenueThousandsUsd: 520, customers: 2500, expensesThousandsUsd: 470, cashReserveThousandsUsd: 4800 },
          signal: { ru: "Продукт проходит пилот у крупной торговой сети.", en: "The product is being piloted by a major retail chain." },
          outcome: { returnBps: 1400, event: { ru: "Пилотный проект превращается в крупный контракт.", en: "The pilot becomes a major contract." } },
        },
        MedFlow: {
          metrics: { revenueThousandsUsd: 340, customers: 1600, expensesThousandsUsd: 255, cashReserveThousandsUsd: 6400 },
          signal: { ru: "Большинство клиник продлевает подписку.", en: "Most clinics are renewing their subscriptions." },
          outcome: { returnBps: 700, event: { ru: "Несколько клиник переходят на годовые договоры.", en: "Several clinics switch to annual agreements." } },
        },
        VoltX: {
          metrics: { revenueThousandsUsd: 180, customers: 350, expensesThousandsUsd: 240, cashReserveThousandsUsd: 2900 },
          signal: { ru: "Испытания нового прототипа задерживаются.", en: "Testing of the new prototype is delayed." },
          outcome: { returnBps: -800, event: { ru: "Испытания прототипа снова переносятся.", en: "Prototype testing is delayed again." } },
        },
        GreenBox: {
          metrics: { revenueThousandsUsd: 260, customers: 1200, expensesThousandsUsd: 198, cashReserveThousandsUsd: 4200 },
          signal: { ru: "Небольшой логистический клиент расширяет использование продукта.", en: "A small logistics customer is expanding its use of the product." },
          outcome: { returnBps: 500, event: { ru: "Подписан новый контракт.", en: "A new contract is signed." } },
        },
      },
    },
    {
      companies: {
        NovaMind: {
          metrics: { revenueThousandsUsd: 610, customers: 3230, expensesThousandsUsd: 586, cashReserveThousandsUsd: 4300 },
          signal: { ru: "Компания резко расширяет команду и инфраструктуру.", en: "The company is rapidly expanding its team and infrastructure." },
          outcome: { returnBps: 2100, event: { ru: "Новый продукт быстро набирает клиентов.", en: "The new product is gaining customers quickly." } },
        },
        MedFlow: {
          metrics: { revenueThousandsUsd: 377, customers: 1770, expensesThousandsUsd: 270, cashReserveThousandsUsd: 6300 },
          signal: { ru: "Готовится подключение новых клиник.", en: "New clinics are preparing to join the service." },
          outcome: { returnBps: 600, event: { ru: "К сервису подключаются новые клиники.", en: "New clinics join the service." } },
        },
        VoltX: {
          metrics: { revenueThousandsUsd: 205, customers: 410, expensesThousandsUsd: 270, cashReserveThousandsUsd: 2710 },
          signal: { ru: "Лабораторные испытания наконец завершены.", en: "Laboratory testing has finally finished." },
          outcome: { returnBps: 2400, event: { ru: "Испытания показывают результаты выше ожиданий.", en: "Testing produces better-than-expected results." } },
        },
        GreenBox: {
          metrics: { revenueThousandsUsd: 288, customers: 1340, expensesThousandsUsd: 214, cashReserveThousandsUsd: 4300 },
          signal: { ru: "Крупная торговая сеть начала тестировать продукт.", en: "A major retail chain has started testing the product." },
          outcome: { returnBps: 700, event: { ru: "Тестирование проходит успешно.", en: "The test is going well." } },
        },
      },
    },
    {
      companies: {
        NovaMind: {
          metrics: { revenueThousandsUsd: 690, customers: 3490, expensesThousandsUsd: 825, cashReserveThousandsUsd: 2870 },
          signal: { ru: "Расходы на инфраструктуру растут быстрее выручки, а рост клиентов замедляется.", en: "Infrastructure costs are rising faster than revenue, and customer growth is slowing." },
          outcome: { returnBps: -3900, event: { ru: "Крупный клиент не продлевает договор; прогнозы пересмотрены.", en: "A major customer does not renew; forecasts are revised." } },
        },
        MedFlow: {
          metrics: { revenueThousandsUsd: 414, customers: 1900, expensesThousandsUsd: 286, cashReserveThousandsUsd: 6200 },
          signal: { ru: "Компания готовит интеграцию с крупным партнёром.", en: "The company is preparing an integration with a major partner." },
          outcome: { returnBps: 800, event: { ru: "Новая интеграция успешно запущена.", en: "The new integration launches successfully." } },
        },
        VoltX: {
          metrics: { revenueThousandsUsd: 232, customers: 439, expensesThousandsUsd: 332, cashReserveThousandsUsd: 2310 },
          signal: { ru: "Опытная партия обходится дороже первоначальных расчётов.", en: "The pilot production run is costing more than first estimated." },
          outcome: { returnBps: -1500, event: { ru: "Себестоимость производства оказалась выше прогноза.", en: "Production costs are higher than forecast." } },
        },
        GreenBox: {
          metrics: { revenueThousandsUsd: 330, customers: 1590, expensesThousandsUsd: 239, cashReserveThousandsUsd: 4460 },
          signal: { ru: "Крупный клиент рассматривает полный переход на систему.", en: "A major customer is considering a full rollout of the system." },
          outcome: { returnBps: 1100, event: { ru: "Клиент расширяет использование системы.", en: "The customer expands its use of the system." } },
        },
      },
    },
  ],
} satisfies LegacyMarketScenario;
