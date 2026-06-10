import 'server-only';

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { qaStrategies } from '@/features/qa-report/api/strategies';
import { buildDefaultQaKnowledgeConfig, qaTechniques } from './defaults';
import type {
  QaDecisionPolicy,
  QaKnowledgeConfig,
  QaTechniquePriority,
  QaVerticalKnowledgeSetting
} from './types';

const configPath = path.join(process.cwd(), 'data', 'qa-knowledge-config.json');

const priorityValues = new Set<QaTechniquePriority>(['low', 'medium', 'high']);
const policyValues = new Set<QaDecisionPolicy>([
  'auto-suggest',
  'ask-when-ambiguous',
  'ask-before-running'
]);

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function sanitizeConfig(value: unknown): QaKnowledgeConfig {
  const fallback = buildDefaultQaKnowledgeConfig();
  if (!value || typeof value !== 'object') return fallback;

  const record = value as Record<string, unknown>;
  const knownTechniqueIds = new Set(qaTechniques.map((technique) => technique.id));
  const activeTechniqueIds = stringArray(record.activeTechniqueIds).filter((id) =>
    knownTechniqueIds.has(id)
  );

  const rawVerticalSettings = Array.isArray(record.verticalSettings)
    ? (record.verticalSettings as Record<string, unknown>[])
    : [];

  const verticalSettings = qaStrategies.map((strategy) => {
    const defaultSetting = fallback.verticalSettings.find(
      (setting) => setting.vertical === strategy.vertical
    ) as QaVerticalKnowledgeSetting;
    const raw = rawVerticalSettings.find((setting) => setting.vertical === strategy.vertical) ?? {};
    const priority = priorityValues.has(raw.priority as QaTechniquePriority)
      ? (raw.priority as QaTechniquePriority)
      : defaultSetting.priority;
    const decisionPolicy = policyValues.has(raw.decisionPolicy as QaDecisionPolicy)
      ? (raw.decisionPolicy as QaDecisionPolicy)
      : defaultSetting.decisionPolicy;
    const staleAfterDays =
      typeof raw.staleAfterDays === 'number' && raw.staleAfterDays > 0
        ? Math.min(Math.round(raw.staleAfterDays), 365)
        : defaultSetting.staleAfterDays;
    const techniqueIds = stringArray(raw.techniqueIds).filter((id) => knownTechniqueIds.has(id));

    return {
      vertical: strategy.vertical,
      priority,
      decisionPolicy,
      techniqueIds: techniqueIds.length ? techniqueIds : defaultSetting.techniqueIds,
      staleAfterDays,
      requireScreenshots:
        typeof raw.requireScreenshots === 'boolean'
          ? raw.requireScreenshots
          : defaultSetting.requireScreenshots
    };
  });

  return {
    activeTechniqueIds: activeTechniqueIds.length
      ? activeTechniqueIds
      : fallback.activeTechniqueIds,
    verticalSettings,
    requireStrategyInReports:
      typeof record.requireStrategyInReports === 'boolean'
        ? record.requireStrategyInReports
        : fallback.requireStrategyInReports,
    requireCoverageGaps:
      typeof record.requireCoverageGaps === 'boolean'
        ? record.requireCoverageGaps
        : fallback.requireCoverageGaps,
    requireRecommendedNextTest:
      typeof record.requireRecommendedNextTest === 'boolean'
        ? record.requireRecommendedNextTest
        : fallback.requireRecommendedNextTest,
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : fallback.updatedAt
  };
}

export async function getQaKnowledgeConfig(): Promise<QaKnowledgeConfig> {
  try {
    const raw = await readFile(configPath, 'utf8');
    return sanitizeConfig(JSON.parse(raw));
  } catch {
    return buildDefaultQaKnowledgeConfig();
  }
}

export async function saveQaKnowledgeConfig(config: QaKnowledgeConfig) {
  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(configPath, `${JSON.stringify(sanitizeConfig(config), null, 2)}\n`, 'utf8');
}

export function buildSladdisQaInstructionPreview(config: QaKnowledgeConfig) {
  const activeTechniques = new Set(config.activeTechniqueIds);
  const lines = [
    'When Felipe asks Sladdis to test a URL, choose the QA scenario from Agent OS QA Strategy config before publishing.',
    'Check /qa-rapport for available scenarios and existing reports for the same domain/customer.',
    'If the request is ambiguous, follow each scenario decision policy instead of guessing.',
    ''
  ];

  for (const setting of config.verticalSettings) {
    const strategy = qaStrategies.find((item) => item.vertical === setting.vertical);
    if (!strategy) continue;
    const techniqueNames = setting.techniqueIds
      .filter((id) => activeTechniques.has(id))
      .map((id) => qaTechniques.find((technique) => technique.id === id)?.name)
      .filter(Boolean);

    lines.push(
      `- ${strategy.vertical}: priority=${setting.priority}; policy=${setting.decisionPolicy}; staleAfterDays=${setting.staleAfterDays}; techniques=${techniqueNames.join(', ') || 'none'}`
    );
  }

  lines.push('');
  lines.push(
    `Report requirements: strategy=${config.requireStrategyInReports ? 'required' : 'optional'}, coverage gaps=${config.requireCoverageGaps ? 'required' : 'optional'}, recommended next test=${config.requireRecommendedNextTest ? 'required' : 'optional'}.`
  );

  return lines.join('\n');
}
