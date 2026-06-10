import type { QaReportVertical } from '@/features/qa-report/api/types';

export type QaTechniqueCategory =
  | 'strategy'
  | 'ux'
  | 'accessibility'
  | 'functional'
  | 'performance'
  | 'security'
  | 'content';

export type QaTechniquePriority = 'low' | 'medium' | 'high';

export type QaDecisionPolicy = 'auto-suggest' | 'ask-when-ambiguous' | 'ask-before-running';

export interface QaKnowledgeSource {
  title: string;
  url: string;
  note: string;
}

export interface QaTechnique {
  id: string;
  name: string;
  category: QaTechniqueCategory;
  summary: string;
  useWhen: string[];
  evidence: string[];
  sources: QaKnowledgeSource[];
}

export interface QaVerticalKnowledgeSetting {
  vertical: QaReportVertical;
  priority: QaTechniquePriority;
  decisionPolicy: QaDecisionPolicy;
  techniqueIds: string[];
  staleAfterDays: number;
  requireScreenshots: boolean;
}

export interface QaKnowledgeConfig {
  activeTechniqueIds: string[];
  verticalSettings: QaVerticalKnowledgeSetting[];
  requireStrategyInReports: boolean;
  requireCoverageGaps: boolean;
  requireRecommendedNextTest: boolean;
  updatedAt: string;
}
