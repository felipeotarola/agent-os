import { TestReportPage } from '@/features/reports/components/test-report-page';
import { mapQaReportToTestReport } from '../api/report-system-adapter';
import type { QaReport, QaStrategyDefinition } from '../api/types';

interface QaReportPageProps {
  report: QaReport;
  strategy?: QaStrategyDefinition;
}

export function QaReportPage({ report, strategy }: QaReportPageProps) {
  return <TestReportPage report={mapQaReportToTestReport(report, strategy)} />;
}

export const QaReportTemplate = QaReportPage;
