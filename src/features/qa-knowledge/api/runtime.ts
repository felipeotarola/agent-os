import 'server-only';

import { getPersistedQaReports } from '@/features/qa-report/api/persistence';
import { qaStrategies } from '@/features/qa-report/api/strategies';
import type {
  QaReport,
  QaReportTestStrategy,
  QaReportVertical
} from '@/features/qa-report/api/types';
import { getQaKnowledgeConfig } from './config';
import { qaTechniques } from './defaults';
import type { QaKnowledgeConfig, QaVerticalKnowledgeSetting } from './types';

export interface QaRuntimeRequest {
  targetUrl?: string;
  customerSlug?: string;
  requestedVertical?: QaReportVertical;
  requestText?: string;
}

export interface QaRuntimeScenario {
  vertical: QaReportVertical;
  name: string;
  shortName: string;
  status: string;
  priority: QaVerticalKnowledgeSetting['priority'];
  decisionPolicy: QaVerticalKnowledgeSetting['decisionPolicy'];
  staleAfterDays: number;
  requireScreenshots: boolean;
  techniques: string[];
}

export interface QaRuntimeRecommendation {
  vertical: QaReportVertical;
  action: 'run' | 'ask' | 'approval-required';
  reason: string;
  existingReport?: {
    title: string;
    reportUrl: string;
    generatedAt: string;
    ageDays: number | null;
    stale: boolean;
  };
}

export interface QaRuntimeSnapshot {
  updatedAt: string;
  reportRequirements: {
    requireStrategyInReports: boolean;
    requireCoverageGaps: boolean;
    requireRecommendedNextTest: boolean;
  };
  scenarios: QaRuntimeScenario[];
  matchingReports: Array<{
    vertical: QaReportVertical;
    title: string;
    reportUrl: string;
    targetUrl: string;
    generatedAt: string;
    ageDays: number | null;
  }>;
  recommendation: QaRuntimeRecommendation;
}

export interface QaKnowledgeValidationIssue {
  path: string;
  code: string;
  message: string;
}

function getDomain(value: string | undefined) {
  if (!value) return null;
  try {
    return new URL(value).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

function ageDays(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24)));
}

function getSetting(config: QaKnowledgeConfig, vertical: QaReportVertical) {
  return (
    config.verticalSettings.find((setting) => setting.vertical === vertical) ??
    config.verticalSettings[0]
  );
}

function techniqueNamesFor(setting: QaVerticalKnowledgeSetting, config: QaKnowledgeConfig) {
  const activeTechniqueIds = new Set(config.activeTechniqueIds);
  return setting.techniqueIds
    .filter((id) => activeTechniqueIds.has(id))
    .map((id) => qaTechniques.find((technique) => technique.id === id)?.name)
    .filter((name): name is string => Boolean(name));
}

function priorityScore(priority: QaVerticalKnowledgeSetting['priority']) {
  if (priority === 'high') return 3;
  if (priority === 'medium') return 2;
  return 1;
}

function inferVerticalFromText(requestText: string | undefined): QaReportVertical | undefined {
  const normalized = requestText?.toLowerCase() ?? '';
  if (!normalized) return undefined;

  return qaStrategies.find((strategy) =>
    strategy.triggerPhrases.some((phrase) => normalized.includes(phrase.toLowerCase()))
  )?.vertical;
}

function reportUrl(report: QaReport) {
  return `/qa-rapport/${report.vertical}/${report.customerSlug}/${report.slug}`;
}

function chooseRecommendation(
  request: QaRuntimeRequest,
  config: QaKnowledgeConfig,
  matchingReports: QaReport[]
): QaRuntimeRecommendation {
  const requestedVertical = request.requestedVertical ?? inferVerticalFromText(request.requestText);
  const scenarios = qaStrategies
    .map((strategy) => {
      const setting = getSetting(config, strategy.vertical);
      return { strategy, setting };
    })
    .toSorted((a, b) => priorityScore(b.setting.priority) - priorityScore(a.setting.priority));

  const selected = requestedVertical
    ? (scenarios.find((scenario) => scenario.strategy.vertical === requestedVertical) ??
      scenarios[0])
    : scenarios[0];
  const vertical = selected.strategy.vertical;
  const sameVerticalReport = matchingReports
    .filter((report) => report.vertical === vertical)
    .toSorted((a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime())[0];
  const existingAge = sameVerticalReport ? ageDays(sameVerticalReport.generatedAt) : null;
  const stale =
    sameVerticalReport && existingAge !== null
      ? existingAge >= selected.setting.staleAfterDays
      : false;

  let action: QaRuntimeRecommendation['action'] = 'run';
  if (selected.setting.decisionPolicy === 'ask-before-running') action = 'approval-required';
  if (!requestedVertical && selected.setting.decisionPolicy === 'ask-when-ambiguous')
    action = 'ask';

  const existingReport = sameVerticalReport
    ? {
        title: sameVerticalReport.title,
        reportUrl: reportUrl(sameVerticalReport),
        generatedAt: sameVerticalReport.generatedAt,
        ageDays: existingAge,
        stale
      }
    : undefined;

  const reason = [
    requestedVertical
      ? `Requested scenario maps to ${selected.strategy.shortName}.`
      : `${selected.strategy.shortName} has the highest configured priority for ambiguous requests.`,
    `Decision policy is ${selected.setting.decisionPolicy}.`,
    sameVerticalReport
      ? stale
        ? `A same-vertical report exists but is stale after ${selected.setting.staleAfterDays} days.`
        : 'A same-vertical report already exists; prefer a complementary scenario unless Felipe asked for a retest.'
      : 'No same-vertical report was found for the matched customer/domain.'
  ].join(' ');

  return { vertical, action, reason, existingReport };
}

export async function buildQaRuntimeSnapshot(
  request: QaRuntimeRequest = {}
): Promise<QaRuntimeSnapshot> {
  const [config, reports] = await Promise.all([getQaKnowledgeConfig(), getPersistedQaReports()]);
  const requestedDomain = getDomain(request.targetUrl);
  const matchingReports = reports.filter((report) => {
    if (request.customerSlug && report.customerSlug === request.customerSlug) return true;
    return requestedDomain !== null && getDomain(report.targetUrl) === requestedDomain;
  });

  return {
    updatedAt: config.updatedAt,
    reportRequirements: {
      requireStrategyInReports: config.requireStrategyInReports,
      requireCoverageGaps: config.requireCoverageGaps,
      requireRecommendedNextTest: config.requireRecommendedNextTest
    },
    scenarios: qaStrategies.map((strategy) => {
      const setting = getSetting(config, strategy.vertical);
      return {
        vertical: strategy.vertical,
        name: strategy.name,
        shortName: strategy.shortName,
        status: strategy.status,
        priority: setting.priority,
        decisionPolicy: setting.decisionPolicy,
        staleAfterDays: setting.staleAfterDays,
        requireScreenshots: setting.requireScreenshots,
        techniques: techniqueNamesFor(setting, config)
      };
    }),
    matchingReports: matchingReports.map((report) => ({
      vertical: report.vertical,
      title: report.title,
      reportUrl: reportUrl(report),
      targetUrl: report.targetUrl,
      generatedAt: report.generatedAt,
      ageDays: ageDays(report.generatedAt)
    })),
    recommendation: chooseRecommendation(request, config, matchingReports)
  };
}

export async function validateQaReportAgainstKnowledgeConfig(report: QaReport) {
  const config = await getQaKnowledgeConfig();
  const setting = getSetting(config, report.vertical);
  const issues: QaKnowledgeValidationIssue[] = [];
  const strategy = report.testStrategy;

  if (config.requireStrategyInReports && !strategy) {
    issues.push({
      path: 'testStrategy',
      code: 'required',
      message: 'testStrategy is required by the active QA Strategy config.'
    });
  }

  if (strategy) {
    validateReportStrategy(strategy, setting, config, issues);
  }

  if (setting.requireScreenshots) {
    const evidenceWithoutDurableScreenshot = report.evidence.filter(
      (evidence) => !evidence.imageUrl && !evidence.blobUrl
    );
    if (!report.evidence.length) {
      issues.push({
        path: 'evidence',
        code: 'required',
        message: `${report.vertical} requires screenshot evidence with imageUrl or blobUrl.`
      });
    }
    for (const evidence of evidenceWithoutDurableScreenshot) {
      issues.push({
        path: `evidence.${evidence.id}`,
        code: 'required',
        message: `${report.vertical} evidence "${evidence.label}" must include imageUrl or blobUrl.`
      });
    }
  }

  return issues;
}

function validateReportStrategy(
  strategy: QaReportTestStrategy,
  setting: QaVerticalKnowledgeSetting,
  config: QaKnowledgeConfig,
  issues: QaKnowledgeValidationIssue[]
) {
  if (strategy.decisionPolicy !== setting.decisionPolicy) {
    issues.push({
      path: 'testStrategy.decisionPolicy',
      code: 'invalid_value',
      message: `Expected decisionPolicy to match QA Strategy config: ${setting.decisionPolicy}.`
    });
  }

  if (config.requireCoverageGaps && !strategy.coverageGaps.length) {
    issues.push({
      path: 'testStrategy.coverageGaps',
      code: 'required',
      message: 'coverageGaps must include at least one explicit gap.'
    });
  }

  if (config.requireRecommendedNextTest && !strategy.recommendedNextTest.trim()) {
    issues.push({
      path: 'testStrategy.recommendedNextTest',
      code: 'required',
      message: 'recommendedNextTest is required by the active QA Strategy config.'
    });
  }

  const activeTechniqueNames = new Set(
    qaTechniques
      .filter((technique) => config.activeTechniqueIds.includes(technique.id))
      .map((technique) => technique.name)
  );
  for (const [index, technique] of strategy.techniquesUsed.entries()) {
    if (!activeTechniqueNames.has(technique)) {
      issues.push({
        path: `testStrategy.techniquesUsed.${index}`,
        code: 'invalid_value',
        message: `${technique} is not active in the QA Strategy config.`
      });
    }
  }
}
