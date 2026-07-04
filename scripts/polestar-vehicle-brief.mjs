#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const openclawHome = process.env.OPENCLAW_HOME || '/root/.openclaw';
const secretsDir = process.env.AGENT_OS_SECRETS_DIR || join(openclawHome, 'secrets', 'agent-os');
const defaultRuntimeDir = join(openclawHome, 'state', 'agent-os', 'polestar');
const defaultApiDir = join(defaultRuntimeDir, 'unofficial-polestar-api');
const defaultVenvPython = join(defaultRuntimeDir, 'polestar-api-venv/bin/python');
const defaultTokenPath = join(defaultRuntimeDir, 'polestar-token.json');

loadDotenv(resolve(repoRoot, '.env.local'));
loadDotenv(resolve(repoRoot, '.env'));

const args = new Set(process.argv.slice(2));
const briefMode = args.has('--brief') || args.size === 0;

function loadDotenv(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!match || process.env[match[1]] !== undefined) continue;
    const value = match[2].trim().replace(/^(['"])(.*)\1$/, '$2');
    process.env[match[1]] = value;
  }
}

function firstNonEmpty(...values) {
  return values.find((value) => typeof value === 'string' && value.trim())?.trim() || '';
}

function readManagedSecret(name) {
  const path = join(secretsDir, name);
  if (!existsSync(path)) return '';
  return readFileSync(path, 'utf8').trim();
}

function enumLabel(value) {
  if (!value) return null;
  return String(value)
    .replace(/^(AvailabilityStatus|UnavailableReason|UsageMode|ChargingStatus|ChargerConnectionStatus|ClimatizationRunningStatus)\./, '')
    .replace(/_/g, ' ')
    .toLowerCase();
}

function chargingLabel(value) {
  return (
    {
      charging: 'laddar',
      idle: 'laddar inte',
      scheduled: 'schemalagd laddning',
      discharging: 'urladdar',
      error: 'laddfel',
      'smart charging': 'smartladdar',
      done: 'fulladdad',
      'smart charging paused': 'smartladdning pausad',
      unspecified: null
    }[value] ?? value
  );
}

function plugLabel(value) {
  return (
    {
      connected: 'inkopplad',
      disconnected: 'ej inkopplad',
      fault: 'kontaktfel',
      unspecified: null
    }[value] ?? value
  );
}

function availabilityLabel(value) {
  return (
    {
      available: 'tillgänglig',
      unavailable: 'otillgänglig',
      unspecified: null
    }[value] ?? value
  );
}

function usageModeLabel(value) {
  return (
    {
      abandoned: 'parkerad/vilar',
      inactive: 'inaktiv',
      convenience: 'komfortläge',
      active: 'aktiv',
      driving: 'körs',
      'engine on': 'igång',
      'engine off': 'avstängd',
      unspecified: null
    }[value] ?? value
  );
}

function formatNumber(value, digits = 0) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value.toLocaleString('sv-SE', { maximumFractionDigits: digits });
}

function minutesLabel(minutes) {
  if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes <= 0) return null;
  const rounded = Math.round(minutes);
  if (rounded < 60) return `${rounded} min`;
  const hours = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  return remainder ? `${hours} h ${remainder} min` : `${hours} h`;
}

function pythonCandidates() {
  return [
    process.env.POLESTAR_PYTHON,
    existsSync(defaultVenvPython) ? defaultVenvPython : '',
    'python3'
  ].filter(Boolean);
}

function runPython() {
  const email = firstNonEmpty(
    process.env.POLESTAR_EMAIL,
    process.env.POLESTAR_USERNAME,
    readManagedSecret('POLESTAR_EMAIL'),
    readManagedSecret('POLESTAR_USERNAME')
  );
  const password = firstNonEmpty(process.env.POLESTAR_PASSWORD, readManagedSecret('POLESTAR_PASSWORD'));
  if (!email || !password) {
    return {
      ok: false,
      message:
        'saknar POLESTAR_EMAIL/POLESTAR_PASSWORD i miljön och Agent OS secrets. Kör npm run car:polestar:setup om klienten inte redan är installerad.'
    };
  }

  const apiDir = resolve(firstNonEmpty(process.env.POLESTAR_API_DIR, defaultApiDir));
  const pythonPath = [resolve(apiDir, 'src'), process.env.PYTHONPATH].filter(Boolean).join(':');
  const env = {
    ...process.env,
    POLESTAR_EMAIL: email,
    POLESTAR_PASSWORD: password,
    POLESTAR_VIN: firstNonEmpty(process.env.POLESTAR_VIN, readManagedSecret('POLESTAR_VIN')),
    PYTHONPATH: pythonPath,
    POLESTAR_TOKEN_STORE: firstNonEmpty(process.env.POLESTAR_TOKEN_STORE, defaultTokenPath)
  };

  const code = String.raw`
import asyncio
import json
import os
import sys

def enum_name(value):
    return getattr(value, "name", str(value)) if value is not None else None

def timestamp_seconds(value):
    return getattr(value, "seconds", None) if value is not None else None

async def maybe(label, coro):
    try:
        return await asyncio.wait_for(coro, timeout=int(os.environ.get("POLESTAR_REQUEST_TIMEOUT_SECONDS", "25")))
    except Exception as error:
        return {"__error__": label, "message": str(error)}

async def main():
    try:
        from polestar_api import PolestarApi
        from polestar_api.auth import FileTokenStore
    except Exception as error:
        print(json.dumps({"ok": False, "setupNeeded": True, "message": f"polestar_api kan inte importeras: {error}"}))
        return

    email = os.environ["POLESTAR_EMAIL"]
    password = os.environ["POLESTAR_PASSWORD"]
    vin_filter = os.environ.get("POLESTAR_VIN", "").strip().upper()
    token_store = FileTokenStore(os.environ["POLESTAR_TOKEN_STORE"])

    try:
        async with PolestarApi(email=email, password=password, token_store=token_store) as api:
            vehicles = await api.get_vehicles()
            if not vehicles:
                print(json.dumps({"ok": False, "message": "inga bilar hittades på Polestar-kontot"}))
                return

            vehicle = None
            if vin_filter:
                vehicle = next((candidate for candidate in vehicles if candidate.vin.upper() == vin_filter), None)
                if vehicle is None:
                    print(json.dumps({"ok": False, "message": "POLESTAR_VIN matchar ingen bil på kontot"}))
                    return
            else:
                vehicle = vehicles[0]

            battery, odometer, availability, climate, health = await asyncio.gather(
                maybe("battery", vehicle.get_battery()),
                maybe("odometer", vehicle.get_odometer()),
                maybe("availability", vehicle.get_availability()),
                maybe("climate", vehicle.get_climate()),
                maybe("health", vehicle.get_health()),
            )

            def error_or_none(value):
                return value if isinstance(value, dict) and value.get("__error__") else None

            payload = {
                "ok": True,
                "vehicle": {
                    "vinTail": vehicle.vin[-6:],
                    "registrationNo": vehicle.registration_no,
                    "modelName": vehicle.model_name,
                    "modelYear": vehicle.model_year,
                },
                "battery": None if error_or_none(battery) or battery is None else {
                    "chargeLevel": battery.charge_level,
                    "rangeKm": battery.range_km,
                    "chargingStatus": enum_name(battery.charging_status),
                    "chargerConnectionStatus": enum_name(battery.charger_connection_status),
                    "powerWatts": battery.power_watts,
                    "timeToFullMinutes": battery.time_to_full,
                    "timeToTargetMinutes": battery.time_to_target,
                    "timestampSeconds": timestamp_seconds(battery.timestamp),
                },
                "odometer": None if error_or_none(odometer) or odometer is None else {
                    "odometerKm": odometer.odometer_km,
                    "timestampSeconds": timestamp_seconds(odometer.timestamp),
                },
                "availability": None if error_or_none(availability) or availability is None else {
                    "status": enum_name(availability.availability_status),
                    "reason": enum_name(availability.unavailable_reason),
                    "usageMode": enum_name(availability.usage_mode),
                    "timestampSeconds": timestamp_seconds(availability.timestamp),
                },
                "climate": None if error_or_none(climate) or climate is None else {
                    "runningStatus": enum_name(climate.running_status),
                    "isActive": climate.is_active,
                    "timeRemainingMinutes": climate.time_remaining,
                    "heatOrCoolAction": enum_name(climate.heat_or_cool_action),
                },
                "health": None if error_or_none(health) or health is None else {
                    "daysToService": health.days_to_service,
                    "distanceToServiceKm": health.distance_to_service_km,
                    "serviceWarning": enum_name(health.service_warning),
                    "lowVoltageBatteryWarning": enum_name(health.low_voltage_battery_warning),
                },
                "partialErrors": [value for value in [battery, odometer, availability, climate, health] if error_or_none(value)],
            }
            print(json.dumps(payload))
    except Exception as error:
        print(json.dumps({"ok": False, "message": str(error)}))

asyncio.run(main())
`;

  let lastError = '';
  for (const python of pythonCandidates()) {
    try {
      return JSON.parse(
        execFileSync(python, ['-c', code], {
          cwd: repoRoot,
          env,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: Number(process.env.POLESTAR_BRIEF_TIMEOUT_MS || 60_000)
        })
      );
    } catch (error) {
      lastError = error.stderr?.toString().trim() || error.message;
    }
  }
  return { ok: false, setupNeeded: true, message: lastError || 'kunde inte köra Python-klienten' };
}

function formatBrief(payload) {
  if (!payload.ok) {
    return `- Bil: kunde inte hämta Polestar just nu (${payload.message}).`;
  }

  const vehicle = payload.vehicle || {};
  const label =
    [vehicle.modelName, vehicle.registrationNo ? `reg ${vehicle.registrationNo}` : null]
      .filter(Boolean)
      .join(', ') || `VIN ...${vehicle.vinTail}`;
  const parts = [];

  if (payload.battery) {
    const charge = formatNumber(payload.battery.chargeLevel, 0);
    const range = formatNumber(payload.battery.rangeKm, 0);
    const status = enumLabel(payload.battery.chargingStatus);
    const plugged = enumLabel(payload.battery.chargerConnectionStatus);
    const shouldShowChargeTime =
      ['charging', 'scheduled', 'smart charging', 'smart charging paused'].includes(status) ||
      plugged === 'connected';
    const time = shouldShowChargeTime
      ? minutesLabel(payload.battery.timeToTargetMinutes) || minutesLabel(payload.battery.timeToFullMinutes)
      : null;
    parts.push(
      `batteri ${charge ?? '?'}%${range ? ` / ${range} km` : ''}${
        status ? `, ${chargingLabel(status)}` : ''
      }${plugged ? ` (${plugLabel(plugged)})` : ''}${time ? `, ${time} kvar` : ''}`
    );
  }

  if (payload.odometer?.odometerKm) {
    parts.push(`mätare ${formatNumber(payload.odometer.odometerKm, 0)} km`);
  }

  if (payload.availability) {
    const status = availabilityLabel(enumLabel(payload.availability.status));
    const mode = usageModeLabel(enumLabel(payload.availability.usageMode));
    const reason = enumLabel(payload.availability.reason);
    parts.push(
      `status ${status || 'ok'}${mode && mode !== 'unspecified' ? `, ${mode}` : ''}${
        reason && reason !== 'unspecified' ? `, ${reason}` : ''
      }`
    );
  }

  if (payload.climate?.isActive) {
    parts.push(`klimat aktiv${minutesLabel(payload.climate.timeRemainingMinutes) ? ` (${minutesLabel(payload.climate.timeRemainingMinutes)} kvar)` : ''}`);
  }

  if (payload.health) {
    const warning = enumLabel(payload.health.serviceWarning);
    if (warning && warning !== 'unspecified' && warning !== 'no warning') {
      parts.push(`servicevarning: ${warning}`);
    } else if (payload.health.distanceToServiceKm > 0 || payload.health.daysToService > 0) {
      const km = payload.health.distanceToServiceKm > 0 ? `${formatNumber(payload.health.distanceToServiceKm, 0)} km` : null;
      const days = payload.health.daysToService > 0 ? `${formatNumber(payload.health.daysToService, 0)} dagar` : null;
      parts.push(`service om ${[km, days].filter(Boolean).join(' / ')}`);
    }
  }

  const suffix = payload.partialErrors?.length
    ? ` (${payload.partialErrors.length} del${payload.partialErrors.length === 1 ? '' : 'ar'} saknade data)`
    : '';
  return `- Bil: ${label}: ${parts.length ? parts.join('; ') : 'ingen användbar status från API:t'}${suffix}.`;
}

const payload = runPython();
if (briefMode) {
  console.log(formatBrief(payload));
} else {
  console.log(JSON.stringify(payload, null, 2));
}
