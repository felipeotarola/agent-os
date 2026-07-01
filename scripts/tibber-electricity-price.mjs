#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const openclawHome = process.env.OPENCLAW_HOME || '/root/.openclaw';
const secretsDir = process.env.AGENT_OS_SECRETS_DIR || join(openclawHome, 'secrets', 'agent-os');
const endpoint = process.env.TIBBER_API_URL || 'https://api.tibber.com/v1-beta/gql';
const spotEndpoint = process.env.ELPRISETJUSTNU_API_URL || 'https://www.elprisetjustnu.se/api/v1/prices';
const homeId = process.env.TIBBER_HOME_ID?.trim();
const args = new Set(process.argv.slice(2));

function readTokenFile(name) {
  const path = join(secretsDir, name);
  if (!existsSync(path)) return '';
  return readFileSync(path, 'utf8').trim();
}

function token() {
  return process.env.TIBBER_API_KEY?.trim() || readTokenFile('TIBBER_API_KEY');
}

function formatNumber(value) {
  return new Intl.NumberFormat('sv-SE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

function formatPrice(price) {
  if (!price || typeof price.total !== 'number') return 'okänt';
  const currency = price.currency || 'SEK';
  return `${formatNumber(price.total)} ${currency}/kWh`;
}

function formatSpotPrice(price) {
  if (!price || typeof price.SEK_per_kWh !== 'number') return 'okänt';
  return `${formatNumber(price.SEK_per_kWh)} SEK/kWh`;
}

function formatKwh(value) {
  if (typeof value !== 'number') return null;
  return `${formatNumber(value)} kWh`;
}

function formatMoney(value, currency = 'SEK') {
  if (typeof value !== 'number') return null;
  return `${formatNumber(value)} ${currency}`;
}

function formatHour(value) {
  if (!value) return 'okänd tid';
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Stockholm',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

function formatDateTime(value) {
  if (!value) return 'okänd tid';
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Stockholm',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

function sameDateStockholm(a, b) {
  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Stockholm',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(new Date(a)) === formatter.format(new Date(b));
}

function upcoming(prices) {
  const now = Date.now();
  return prices.filter((price) => Date.parse(price.startsAt) >= now);
}

function cheapest(prices) {
  return prices.reduce((best, price) => {
    if (typeof price.total !== 'number') return best;
    if (!best || price.total < best.total) return price;
    return best;
  }, null);
}

function mostExpensive(prices) {
  return prices.reduce((best, price) => {
    if (typeof price.total !== 'number') return best;
    if (!best || price.total > best.total) return price;
    return best;
  }, null);
}

function nextCheaperThanCurrent(prices, current) {
  if (!current || typeof current.total !== 'number') return null;
  return upcoming(prices).find((price) => typeof price.total === 'number' && price.total < current.total) || null;
}

function latestClosedNode(nodes) {
  const now = Date.now();
  return [...(nodes || [])]
    .reverse()
    .find((node) => node?.to && Date.parse(node.to) <= now && !Number.isNaN(Date.parse(node.to)));
}

function formatEnergyFlow(home) {
  const consumption = latestClosedNode(home.consumption?.nodes);
  const production = latestClosedNode(home.production?.nodes);
  const parts = [];
  const consumptionAmount = consumption?.consumption;
  const consumptionCost = consumption?.cost;
  const productionAmount = production?.production;
  const productionProfit = production?.profit;
  const currency = consumption?.currency || production?.currency || 'SEK';

  if (consumption) {
    const amount = formatKwh(consumptionAmount);
    const cost = formatMoney(consumptionCost, consumption.currency);
    if (amount && cost) {
      parts.push(`Köpt igår/senast färdiga dygn: ${amount}, ${cost}.`);
    }
  }

  if (production) {
    const amount = formatKwh(productionAmount);
    const profit = formatMoney(productionProfit, production.currency);
    if (amount && profit) {
      parts.push(`Sålt/producerat samma dygn: ${amount}, ${profit}.`);
    }
  }

  if (typeof consumptionCost === 'number' && typeof productionProfit === 'number') {
    parts.push(`Netto elhandel: ${formatMoney(consumptionCost - productionProfit, currency)}.`);
  }

  return {
    latestConsumption: consumption || null,
    latestProduction: production || null,
    text: parts.join(' ')
  };
}

function levelSv(level) {
  return (
    {
      VERY_CHEAP: 'mycket billigt',
      CHEAP: 'billigt',
      NORMAL: 'normalt',
      EXPENSIVE: 'dyrt',
      VERY_EXPENSIVE: 'mycket dyrt'
    }[level] || 'okänd nivå'
  );
}

function allPrices(priceInfo) {
  return [...(priceInfo.today || []), ...(priceInfo.tomorrow || [])].filter((price) => price?.startsAt);
}

function priceValue(price) {
  if (typeof price?.total === 'number') return price.total;
  if (typeof price?.SEK_per_kWh === 'number') return price.SEK_per_kWh;
  return null;
}

function selectHome(homes) {
  const subscribed = homes.filter((home) => home?.currentSubscription?.priceInfo);
  if (homeId) {
    const match = subscribed.find((home) => home.id === homeId);
    if (match) return match;
  }
  return subscribed[0] || null;
}

function selectFallbackHome(homes) {
  if (homeId) {
    const match = homes.find((home) => home.id === homeId);
    if (match) return match;
  }
  return homes.find((home) => home?.meteringPointData?.priceAreaCode) || homes[0] || null;
}

function homeLabel(home) {
  const nickname = home.appNickname?.trim();
  const address = home.address?.address1?.trim();
  const city = home.address?.city?.trim();
  if (nickname && address) return `${nickname}, ${address}`;
  if (address && city) return `${address}, ${city}`;
  if (address) return address;
  if (nickname && city) return `${nickname}, ${city}`;
  if (nickname) return nickname;
  return city || 'Tibber-hem';
}

function unavailableHomesMessage(homes) {
  if (!homes.length) return 'Tibber-kontot har inga hem kopplade.';

  const labels = homes.map((home) => {
    const label = homeLabel(home);
    if (home.currentSubscription) return `${label}: prenumeration finns men saknar priceInfo`;
    const priceArea = home.meteringPointData?.priceAreaCode;
    return `${label}: saknar currentSubscription${priceArea ? `, prisområde ${priceArea}` : ''}`;
  });

  return `Tibber-kontot har inget hem med aktiv prenumeration/prisinfo. Synliga hem: ${labels.join('; ')}.`;
}

function stockholmParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Stockholm',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  return Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
}

function spotApiPath(date, priceArea) {
  const { year, month, day } = stockholmParts(date);
  return `${spotEndpoint}/${year}/${month}-${day}_${priceArea}.json`;
}

function currentSpot(prices) {
  const now = Date.now();
  return prices.find((price) => Date.parse(price.time_start) <= now && Date.parse(price.time_end) > now) || null;
}

function cheapestBySpot(prices) {
  return prices.reduce((best, price) => {
    const value = priceValue(price);
    if (value === null) return best;
    if (!best || value < priceValue(best)) return price;
    return best;
  }, null);
}

function mostExpensiveBySpot(prices) {
  return prices.reduce((best, price) => {
    const value = priceValue(price);
    if (value === null) return best;
    if (!best || value > priceValue(best)) return price;
    return best;
  }, null);
}

async function fetchSpotPrices(priceArea, date = new Date()) {
  const response = await fetch(spotApiPath(date, priceArea));
  if (!response.ok) {
    throw new Error(`spotpris-API svarade ${response.status}`);
  }
  return response.json();
}

async function spotSummary(home, reason) {
  const priceArea = home?.meteringPointData?.priceAreaCode;
  if (!priceArea) throw new Error(reason);

  const prices = await fetchSpotPrices(priceArea);
  const remainingToday = prices.filter((price) => Date.parse(price.time_start) >= Date.now());
  const current = currentSpot(prices);
  const cheapestRest = cheapestBySpot(remainingToday);
  const peakRest = mostExpensiveBySpot(remainingToday);

  const lines = [
    `Elpris: Tibber saknar abonnemangspris i API:t, visar spotpris för ${priceArea}. Nu ${formatSpotPrice(
      current
    )}, gäller ${formatHour(current?.time_start)}-${formatHour(current?.time_end)}.`
  ];

  if (cheapestRest) {
    lines.push(`Billigast kvar idag: ${formatHour(cheapestRest.time_start)} ${formatSpotPrice(cheapestRest)}.`);
  }
  if (peakRest) {
    lines.push(`Dyrast kvar idag: ${formatHour(peakRest.time_start)} ${formatSpotPrice(peakRest)}.`);
  }

  if (args.has('--json')) {
    return JSON.stringify(
      {
        home: homeLabel(home),
        source: 'elprisetjustnu.se',
        note: reason,
        priceArea,
        current,
        cheapestRestToday: cheapestRest,
        peakRestToday: peakRest
      },
      null,
      2
    );
  }

  const source = `Källa: elprisetjustnu.se (${homeLabel(home)}, via Tibber prisområde ${priceArea}).`;
  if (args.has('--brief')) return `- ${lines.join(' ')} ${source}`;
  return [`Elpris (${homeLabel(home)})`, '', ...lines, source].join('\n');
}

function summary(home) {
  const priceInfo = home.currentSubscription.priceInfo;
  const prices = allPrices(priceInfo);
  const today = prices.filter((price) => sameDateStockholm(price.startsAt, new Date()));
  const remainingToday = upcoming(today);
  const current = priceInfo.current;
  const cheapestRest = cheapest(remainingToday);
  const peakRest = mostExpensive(remainingToday);
  const nextCheaper = nextCheaperThanCurrent(prices, current);
  const tomorrow = priceInfo.tomorrow || [];
  const cheapestTomorrow = cheapest(tomorrow);
  const energyFlow = formatEnergyFlow(home);

  const lines = [
    `Elpris: nu ${formatPrice(current)} (${levelSv(current?.level)}), gäller från ${formatHour(
      current?.startsAt
    )}.`
  ];

  if (cheapestRest) {
    lines.push(`Billigast kvar idag: ${formatHour(cheapestRest.startsAt)} ${formatPrice(cheapestRest)}.`);
  }
  if (peakRest && peakRest.startsAt !== cheapestRest?.startsAt) {
    lines.push(`Dyrast kvar idag: ${formatHour(peakRest.startsAt)} ${formatPrice(peakRest)}.`);
  }
  if (nextCheaper) {
    lines.push(`Nästa billigare timme: ${formatDateTime(nextCheaper.startsAt)} ${formatPrice(nextCheaper)}.`);
  }
  if (cheapestTomorrow) {
    lines.push(`Billigast imorgon: ${formatHour(cheapestTomorrow.startsAt)} ${formatPrice(cheapestTomorrow)}.`);
  } else {
    lines.push('Morgondagens priser finns inte hos Tibber ännu.');
  }
  if (energyFlow.text) {
    lines.push(energyFlow.text);
  }

  if (args.has('--json')) {
    return JSON.stringify(
      {
        home: homeLabel(home),
        current,
        cheapestRestToday: cheapestRest,
        peakRestToday: peakRest,
        nextCheaper,
        cheapestTomorrow,
        energyFlow: {
          latestConsumption: energyFlow.latestConsumption,
          latestProduction: energyFlow.latestProduction
        }
      },
      null,
      2
    );
  }

  if (args.has('--brief')) {
    return `- ${lines.join(' ')} Källa: Tibber (${homeLabel(home)}).`;
  }

  return [`Tibber elpris (${homeLabel(home)})`, '', ...lines].join('\n');
}

async function fetchPrices() {
  const apiKey = token();
  if (!apiKey) {
    throw new Error(`TIBBER_API_KEY saknas i miljön och i ${join(secretsDir, 'TIBBER_API_KEY')}`);
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query: `query AgentOsElectricityPrices {
        viewer {
          homes {
            id
            appNickname
            address {
              address1
              city
            }
            meteringPointData {
              priceAreaCode
              gridCompany
            }
            subscriptions {
              id
              status
            }
            consumption(resolution: DAILY, last: 7) {
              nodes {
                from
                to
                consumption
                consumptionUnit
                cost
                currency
                unitPrice
              }
            }
            production(resolution: DAILY, last: 7) {
              nodes {
                from
                to
                production
                productionUnit
                profit
                currency
                unitPrice
              }
            }
            currentSubscription {
              priceInfo {
                current {
                  total
                  energy
                  tax
                  startsAt
                  level
                  currency
                }
                today {
                  total
                  energy
                  tax
                  startsAt
                  level
                  currency
                }
                tomorrow {
                  total
                  energy
                  tax
                  startsAt
                  level
                  currency
                }
              }
            }
          }
        }
      }`
    })
  });

  if (!response.ok) {
    throw new Error(`Tibber API svarade ${response.status}`);
  }

  const payload = await response.json();
  if (payload.errors?.length) {
    throw new Error(`Tibber API fel: ${payload.errors.map((error) => error.message).join('; ')}`);
  }

  const homes = payload.data?.viewer?.homes || [];
  const home = selectHome(homes);
  if (!home) {
    return spotSummary(selectFallbackHome(homes), unavailableHomesMessage(homes));
  }
  return summary(home);
}

fetchPrices()
  .then((text) => {
    console.log(text);
  })
  .catch((error) => {
    if (args.has('--brief')) {
      console.log(`- Elpris: kunde inte hämta Tibber just nu (${error.message}).`);
      process.exit(0);
    }
    console.error(error.message);
    process.exit(1);
  });
