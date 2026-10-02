import { STARTUP_IDS, type BusinessHistoryPoint, type LocalizedText, type ScenarioId, type StartupId } from "@startup-game/shared";
import { deltaBps, equityValue, nextBusinessState, operatingStatement, returnFromEquity, roundDiv, safeInteger, ZERO_SHOCK, type BusinessParameters, type BusinessShock, type BusinessState } from "./model.js";
import type { MarketScenario, ScenarioCompanyRound, ScenarioRound } from "./types.js";

const text = (ru: string, en: string): LocalizedText => ({ ru, en });
export const COMPANY_PARAMETERS: Record<StartupId, BusinessParameters> = {
  NovaMind: { discountBps: 550, maintenanceCapexBps: 300 },
  MedFlow: { discountBps: 350, maintenanceCapexBps: 200 },
  VoltX: { discountBps: 750, maintenanceCapexBps: 1100 },
  GreenBox: { discountBps: 450, maintenanceCapexBps: 500 },
  AgroPulse: { discountBps: 600, maintenanceCapexBps: 800 },
  OrbitLink: { discountBps: 800, maintenanceCapexBps: 1500 },
};
export const COMPANY_SEEDS: Record<StartupId, BusinessState> = {
  NovaMind: { customers: 1800, arpuCents: 21000, unitCostCents: 9500, fixedCostsCents: 22000000, cashCents: 460000000, debtCents: 0, growthBps: 1300, multipleBps: 28000 },
  MedFlow: { customers: 1100, arpuCents: 23000, unitCostCents: 8500, fixedCostsCents: 11000000, cashCents: 600000000, debtCents: 0, growthBps: 600, multipleBps: 19000 },
  VoltX: { customers: 180, arpuCents: 85000, unitCostCents: 65000, fixedCostsCents: 14500000, cashCents: 350000000, debtCents: 0, growthBps: 700, multipleBps: 23000 },
  GreenBox: { customers: 750, arpuCents: 26000, unitCostCents: 15000, fixedCostsCents: 6500000, cashCents: 370000000, debtCents: 0, growthBps: 800, multipleBps: 14000 },
  AgroPulse: { customers: 430, arpuCents: 39000, unitCostCents: 18000, fixedCostsCents: 7200000, cashCents: 330000000, debtCents: 0, growthBps: 900, multipleBps: 16000 },
  OrbitLink: { customers: 90, arpuCents: 160000, unitCostCents: 70000, fixedCostsCents: 19000000, cashCents: 850000000, debtCents: 0, growthBps: 1100, multipleBps: 27000 },
};
const BASE_GROWTH: Record<StartupId, number> = { NovaMind: 1300, MedFlow: 600, VoltX: 700, GreenBox: 800, AgroPulse: 900, OrbitLink: 1100 };

const INDUSTRY_HINTS: Record<StartupId, LocalizedText[]> = {
  NovaMind: [text("Подписки растут; вычисления и внедрение требуют дополнительных расходов.", "Subscriptions are growing; computing and deployment require more spending."), text("Команда обсуждает новые корпоративные внедрения и стоимость поддержки.", "The team is discussing corporate deployments and support costs."), text("Продления подписок определят загрузку команды на следующий квартал.", "Subscription renewals will determine team utilization next quarter.")],
  MedFlow: [text("Клиники оценивают интеграцию системы. Решения зависят от закупочных бюджетов.", "Clinics are assessing system integration. Decisions depend on procurement budgets."), text("Новые подразделения проходят обучение; обслуживание добавляет переменные расходы.", "New departments are receiving training; service adds variable costs."), text("Сеть обсуждает расширение внедрения, окончательные объёмы не подтверждены.", "The network is discussing broader deployment; final volumes are not confirmed.")],
  VoltX: [text("Установки требуют компонентов и обслуживания; выручка пока ниже издержек.", "Installations need components and service; revenue is still below costs."), text("Производитель пересматривает график поставок и загрузку линии.", "The manufacturer is reviewing deliveries and production-line utilization."), text("Новые поставки могут увеличить загрузку; цена компонентов остаётся значимой.", "New deliveries may improve utilization; component prices remain material.")],
  GreenBox: [text("Торговые площадки подключают упаковку; экономика зависит от загрузки линии.", "Retail sites are adopting packaging; economics depend on line utilization."), text("Партнёры обсуждают дополнительные площадки и условия логистики.", "Partners are discussing more sites and logistics terms."), text("Сети пересматривают объёмы заказов. Постоянные расходы сохраняются.", "Chains are reviewing order volumes. Fixed costs remain in place.")],
  AgroPulse: [text("Хозяйства оценивают датчики и орошение; внедрения требуют оборудования.", "Farms are evaluating sensors and irrigation; deployment requires equipment."), text("Сезонный спрос и цена обслуживания влияют на экономику внедрений.", "Seasonal demand and service costs affect deployment economics."), text("Новые участки могут подключиться после оценки урожайности и водоснабжения.", "New plots may connect after crop-yield and water-supply assessments.")],
  OrbitLink: [text("Корпоративные подключения растут; инфраструктура расходует денежный запас.", "Corporate connections are growing; infrastructure is consuming cash reserves."), text("Оператор обсуждает расширение покрытия и вложения в наземные станции.", "The operator is discussing broader coverage and ground-station spending."), text("График запусков и загрузка сети определят стоимость дальнейшего расширения.", "Launch schedules and network utilization will determine expansion costs.")],
};
const percent = (bps: number, locale: "ru" | "en") => new Intl.NumberFormat(locale === "ru" ? "ru-RU" : "en-US", { maximumFractionDigits: 2 }).format(bps / 100);

interface Story { title: LocalizedText; target: StartupId; hints: LocalizedText[]; events: LocalizedText[]; changes: Partial<Record<StartupId, Partial<BusinessShock>[]>> }
const STORIES: Story[] = [
  { title: text("Цена быстрого роста", "The cost of rapid growth"), target: "NovaMind",
    hints: [text("Компания готовит масштабный запуск; инфраструктуру расширяют заранее.", "A large product launch is planned; infrastructure is being expanded ahead of it."), text("Команда продолжает расширяться. Продление крупного договора ещё обсуждается.", "The team is still expanding. A major renewal is still under discussion."), text("Крупный заказчик пересматривает бюджет, постоянные расходы уже выросли.", "A major customer is revising its budget; fixed costs have already risen.")],
    events: [text("Запуск привлёк клиентов, но расширение команды увеличило расходы.", "The launch attracted customers, but the larger team increased costs."), text("Новые клиенты пришли, инфраструктура стала значительно дороже.", "New customers joined, while infrastructure became much more expensive."), text("Крупный договор не продлён; число клиентов и оценка бизнеса снизились.", "A major contract was not renewed; customer count and business valuation fell.")],
    changes: { NovaMind: [{ customerGrowthBps: 1900, fixedCostChangeBps: 1700 }, { customerGrowthBps: 2400, fixedCostChangeBps: 4500, capexCents: 50000000 }, { customerGrowthBps: -2400, unitCostChangeBps: 1000, multipleChangeBps: -1200 }], AgroPulse: [{}, { customerGrowthBps: 1300 }, { customerGrowthBps: 1800 }] } },
  { title: text("Промышленный барьер", "The industrial bottleneck"), target: "VoltX",
    hints: [text("Новый накопитель проходит испытания; сроки пока предварительные.", "A new storage unit is being tested; delivery dates are provisional."), text("Испытания завершены, подготовка производства требует вложений.", "Testing is complete; preparing production requires investment."), text("Поставщик ключевого компонента объявил повторную проверку качества.", "The supplier of a key component has announced another quality check.")],
    events: [text("Поставки задержались: клиентская база сократилась.", "Deliveries were delayed and the customer base contracted."), text("Успешные испытания принесли заказы, запуск линии потребовал капитальных затрат.", "Successful tests brought orders; opening the line required capital expenditure."), text("Компоненты не прошли проверку, выросли затраты и отменены заказы.", "Components failed the check, costs rose and orders were cancelled.")],
    changes: { VoltX: [{ customerGrowthBps: -400 }, { customerGrowthBps: 2300, capexCents: 70000000 }, { customerGrowthBps: -2500, unitCostChangeBps: 2400, capexCents: 90000000, multipleChangeBps: -1500 }], GreenBox: [{ customerGrowthBps: 600 }, { customerGrowthBps: 1000 }, { customerGrowthBps: 2000 }] } },
  { title: text("Зависимость от заказчиков", "Customer concentration"), target: "GreenBox",
    hints: [text("Крупная сеть рассматривает тестирование упаковки.", "A large chain is considering a packaging trial."), text("Заказы растут, но большая их часть приходится на двух партнёров.", "Orders are growing, but most come from two partners."), text("Один из двух ключевых заказчиков пересматривает логистику.", "One of the two key customers is reviewing its logistics.")],
    events: [text("Пилот добавил клиентов и увеличил выручку.", "The pilot added customers and increased revenue."), text("Партнёры расширили заказы; компания подготовила новую линию.", "Partners expanded orders; the company prepared a new line."), text("Крупная сеть прекратила договор: её торговые точки отключены, загрузка сократилась при прежних постоянных расходах.", "A major chain ended its contract: its sites disconnected and utilization fell while fixed costs remained.")],
    changes: { GreenBox: [{ customerGrowthBps: 1400 }, { customerGrowthBps: 1800, fixedCostChangeBps: 1200 }, { customerGrowthBps: -3400, multipleChangeBps: -700 }], MedFlow: [{ customerGrowthBps: 700 }, { customerGrowthBps: 1000 }, { customerGrowthBps: 2600, arpuChangeBps: 500 }] } },
  { title: text("Погодный фактор", "The weather factor"), target: "AgroPulse",
    hints: [text("Хозяйства расширяют пилоты систем точного орошения.", "Farms are expanding precision-irrigation pilots."), text("Прогноз указывает на сухой сезон, стоимость оборудования растёт.", "The forecast suggests a dry season and equipment costs are rising."), text("Ограничения воды могут сократить площади внедрения.", "Water restrictions may reduce the acreage available for deployment.")],
    events: [text("Хозяйства подключили новые площади; внедрение потребовало расходов.", "Farms added acreage; deployment required spending."), text("Цена оборудования выросла, часть внедрений перенесена.", "Equipment became more expensive and some deployments were postponed."), text("Ограничения воды сократили заказы, затраты на обслуживание выросли.", "Water restrictions reduced orders and increased service costs.")],
    changes: { AgroPulse: [{ customerGrowthBps: 1800, capexCents: 15000000 }, { customerGrowthBps: 400, unitCostChangeBps: 1300 }, { customerGrowthBps: -3000, unitCostChangeBps: 1800, arpuChangeBps: -400 }], OrbitLink: [{ customerGrowthBps: 1300 }, { customerGrowthBps: 1800 }, { customerGrowthBps: 2600, fixedCostChangeBps: -500 }] } },
  { title: text("Стоимость выхода на орбиту", "The cost of reaching orbit"), target: "OrbitLink",
    hints: [text("Партнёр предварительно согласовал расширение спутниковой сети.", "A partner has provisionally agreed to expand the satellite network."), text("Запуск спутника готовится, график подрядчика ещё уточняется.", "A satellite launch is being prepared; the contractor's schedule is not final."), text("Подрядчик сообщил о переносе запуска и пересмотре стоимости.", "The contractor has reported a launch delay and a cost revision.")],
    events: [text("Появились новые абоненты, оператор вложился в наземную инфраструктуру.", "New subscribers joined and the operator invested in ground infrastructure."), text("Сеть расширила продажи, расходы на подготовку запуска выросли.", "Network sales expanded and launch preparation costs rose."), text("Запуск перенесён: часть заказов отложена, капитальные затраты увеличились.", "The launch was delayed: some orders were postponed and capital expenditure rose.")],
    changes: { OrbitLink: [{ customerGrowthBps: 2100, capexCents: 50000000 }, { customerGrowthBps: 1700, fixedCostChangeBps: 1500, capexCents: 90000000 }, { customerGrowthBps: -1700, fixedCostChangeBps: 1200, capexCents: 160000000, multipleChangeBps: -1700 }], AgroPulse: [{ customerGrowthBps: 600 }, { customerGrowthBps: 1400 }, { customerGrowthBps: 2800, arpuChangeBps: 300 }] } },
  { title: text("Смена отраслевого цикла", "A turn in the industry cycle"), target: "MedFlow",
    hints: [text("Клиники обсуждают обновление систем, закупки зависят от бюджетов.", "Clinics are discussing system upgrades; purchases depend on budgets."), text("Закупочные бюджеты сокращаются, интеграции становятся дороже.", "Procurement budgets are shrinking and integrations are getting more expensive."), text("Сеть клиник переносит внедрение; часть договоров пересматривается.", "A clinic network is postponing deployment and reviewing some contracts.")],
    events: [text("Несколько внедрений завершены, но их стоимость выросла.", "Several deployments finished, but their cost increased."), text("Часть клиник перенесла закупки, расходы на поддержку выросли.", "Some clinics postponed purchases and support costs increased."), text("Сеть сократила договоры, постоянные расходы снизились медленнее выручки.", "The network reduced contracts; fixed costs fell more slowly than revenue." )],
    changes: { MedFlow: [{ customerGrowthBps: 800, unitCostChangeBps: 1200 }, { customerGrowthBps: -500, fixedCostChangeBps: 1800 }, { customerGrowthBps: -1800, fixedCostChangeBps: -200 }], NovaMind: [{ customerGrowthBps: 900 }, { customerGrowthBps: 400 }, { customerGrowthBps: -600 }], VoltX: [{ customerGrowthBps: 300 }, { customerGrowthBps: 1700, unitCostChangeBps: -500 }, { customerGrowthBps: 2900, unitCostChangeBps: -800 }] } },
];

function snapshot(state: BusinessState, period: number, baselineEquity: number, parameters: BusinessParameters): BusinessHistoryPoint {
  const s = operatingStatement(state);
  return { period, revenueCents: s.revenueCents, expensesCents: s.expensesCents, cashCents: state.cashCents, customers: state.customers, relativeValueBps: safeInteger(roundDiv(BigInt(equityValue(state, parameters)) * 10000n, BigInt(baselineEquity))) };
}
function observations(s: BusinessState, previous?: BusinessState): LocalizedText[] {
  const statement = operatingStatement(s);
  const insights = [statement.operatingCashFlowCents >= 0 ? text("Текущая выручка покрывает операционные расходы.", "Current revenue covers operating expenses.") : text("Расходы выше выручки: бизнес расходует денежный запас.", "Expenses exceed revenue: the business is using its cash reserve.")];
  if (previous) {
    const p = operatingStatement(previous);
    if (deltaBps(statement.expensesCents, p.expensesCents) > deltaBps(statement.revenueCents, p.revenueCents)) insights.push(text("Расходы растут быстрее выручки.", "Expenses are growing faster than revenue."));
    else insights.push(text("Выручка меняется благоприятнее расходов.", "Revenue is changing more favorably than expenses."));
    if (s.cashCents < previous.cashCents) insights.push(text("Денежный запас сократился после расходов и вложений.", "Cash reserves fell after expenses and capital investment."));
  }
  return insights;
}

export function generateScenarios(): MarketScenario[] {
  return STORIES.map((story, storyIndex) => {
    const states = {} as Record<StartupId, BusinessState>;
    const histories = {} as Record<StartupId, BusinessHistoryPoint[]>;
    const baselines = {} as Record<StartupId, number>;
    const previousStates = {} as Record<StartupId, BusinessState>;
    for (const id of STARTUP_IDS) {
      let state = { ...COMPANY_SEEDS[id] };
      baselines[id] = equityValue(state, COMPANY_PARAMETERS[id]);
      histories[id] = [snapshot(state, -4, baselines[id], COMPANY_PARAMETERS[id])];
      for (let period = -3; period <= 0; period++) {
        previousStates[id] = state;
        state = nextBusinessState(state, { ...ZERO_SHOCK, customerGrowthBps: BASE_GROWTH[id] + (period === -2 ? -200 : period === -1 ? 100 : 0), fixedCostChangeBps: 300, capexCents: id === "OrbitLink" ? 30000000 : id === "VoltX" ? 10000000 : 3000000 }, COMPANY_PARAMETERS[id]);
        histories[id].push(snapshot(state, period, baselines[id], COMPANY_PARAMETERS[id]));
      }
      states[id] = state;
    }
    const initialStates = structuredClone(states);
    const shocks: Record<StartupId, BusinessShock>[] = [];
    const rounds: ScenarioRound[] = [];
    for (let index = 0; index < 3; index++) {
      const companies = {} as Record<StartupId, ScenarioCompanyRound>;
      const quarterShocks = {} as Record<StartupId, BusinessShock>;
      for (const id of STARTUP_IDS) {
        const state = states[id];
        const shock: BusinessShock = { ...ZERO_SHOCK, customerGrowthBps: BASE_GROWTH[id], fixedCostChangeBps: 200, capexCents: id === "OrbitLink" ? 35000000 : id === "VoltX" ? 8000000 : 3000000, ...story.changes[id]?.[index] };
        quarterShocks[id] = shock;
        const next = nextBusinessState(state, shock, COMPANY_PARAMETERS[id]);
        const statement = operatingStatement(state);
        const after = operatingStatement(next);
        const hint = id === story.target ? story.hints[index]! : INDUSTRY_HINTS[id][index]!;
        const event = id === story.target ? story.events[index]! : text(`${id}, квартал ${index + 1}: заказы, издержки и вложения учтены в новой оценке бизнеса.`, `${id}, quarter ${index + 1}: orders, costs and investment are reflected in the updated business valuation.`);
        companies[id] = {
          state: { ...state },
          metrics: { revenueThousandsUsd: Math.round(statement.revenueCents / 100000), expensesThousandsUsd: Math.round(statement.expensesCents / 100000), customers: state.customers, cashReserveThousandsUsd: Math.round(state.cashCents / 100000) },
          signal: hint,
          analysis: observations(state, previousStates[id]),
          news: [{ source: "company", certainty: "fact", text: statement.marginBps >= 0 ? text("Выручка покрывает текущие расходы; опубликован отчёт за прошедший квартал.", "Revenue covers current expenses; the last quarter's report is published.") : text("Расходы превышают выручку; опубликован отчёт за прошедший квартал.", "Expenses exceed revenue; the last quarter's report is published.") }, { source: id === story.target ? "partner" : "industry", certainty: "plan", text: hint }],
          financialHistory: structuredClone(histories[id]),
          marginBps: statement.marginBps,
          operatingCashFlowCents: statement.operatingCashFlowCents,
          outcome: { returnBps: returnFromEquity(equityValue(state, COMPANY_PARAMETERS[id]), equityValue(next, COMPANY_PARAMETERS[id])), event, explanation: text(`Клиенты: ${percent(deltaBps(next.customers, state.customers), "ru")}%; выручка: ${percent(deltaBps(after.revenueCents, statement.revenueCents), "ru")}%; расходы: ${percent(deltaBps(after.expensesCents, statement.expensesCents), "ru")}%. Изменились денежный поток и оценка бизнеса.`, `Customers: ${percent(deltaBps(next.customers, state.customers), "en")}%; revenue: ${percent(deltaBps(after.revenueCents, statement.revenueCents), "en")}%; expenses: ${percent(deltaBps(after.expensesCents, statement.expensesCents), "en")}%. Cash flow and business valuation changed.`) },
        };
        previousStates[id] = state;
        states[id] = next;
        histories[id].push(snapshot(next, index + 1, baselines[id], COMPANY_PARAMETERS[id]));
      }
      shocks.push(quarterShocks);
      rounds.push({ companies });
    }
    return { id: `scenario-0${storyIndex + 1}` as ScenarioId, title: story.title, modelVersion: 2, definition: { states: initialStates, parameters: structuredClone(COMPANY_PARAMETERS), shocks }, rounds: rounds as MarketScenario["rounds"] };
  });
}
