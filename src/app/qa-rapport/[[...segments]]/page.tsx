import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  getQaReport,
  getQaReportByCustomer,
  getQaReportByVertical,
  getQaReports
} from '@/features/qa-report/api/service';
import {
  getPersistedQaReportByCustomer,
  getPersistedQaReports
} from '@/features/qa-report/api/persistence';
import { getQaStrategy, qaStrategies } from '@/features/qa-report/api/strategies';
import { QaCustomerPage } from '@/features/qa-report/components/qa-customer-page';
import { QaReportIndexPage } from '@/features/qa-report/components/qa-report-index-page';
import { QaReportPage } from '@/features/qa-report/components/qa-report-page';
import { QaVerticalPage } from '@/features/qa-report/components/qa-vertical-page';
import type { QaReport, QaStrategyDefinition } from '@/features/qa-report/api/types';

interface QaReportRouteProps {
  params: Promise<{
    segments?: string[];
  }>;
}

async function getAllQaReports() {
  try {
    const persistedReports = await getPersistedQaReports();
    const persistedKeys = new Set(
      persistedReports.map((report) => `${report.vertical}/${report.customerSlug}/${report.slug}`)
    );
    return [
      ...persistedReports,
      ...getQaReports().filter(
        (report) => !persistedKeys.has(`${report.vertical}/${report.customerSlug}/${report.slug}`)
      )
    ];
  } catch (error) {
    console.error('Could not load persisted QA reports', error);
    return getQaReports();
  }
}

async function resolveQaReport(segments: string[] = []): Promise<
  | {
      report: QaReport;
      strategy?: QaStrategyDefinition;
    }
  | undefined
> {
  if (segments.length === 1) {
    const strategy = getQaStrategy(segments[0]!);
    if (strategy) {
      return undefined;
    }

    const report = getQaReport(segments[0]!);
    return report ? { report, strategy: getQaStrategy(report.vertical) } : undefined;
  }

  if (segments.length === 2) {
    const [vertical, slug] = segments;
    const report = getQaReportByVertical(vertical!, slug!);
    return report ? { report, strategy: getQaStrategy(report.vertical) } : undefined;
  }

  if (segments.length === 3) {
    const [vertical, customerSlug, slug] = segments;
    let persistedReport: QaReport | undefined;
    try {
      persistedReport = await getPersistedQaReportByCustomer(vertical!, customerSlug!, slug!);
    } catch (error) {
      console.error('Could not load persisted QA report', error);
    }
    const report = persistedReport ?? getQaReportByCustomer(vertical!, customerSlug!, slug!);
    return report ? { report, strategy: getQaStrategy(report.vertical) } : undefined;
  }

  return undefined;
}

export async function generateStaticParams() {
  return [
    {
      segments: []
    },
    ...qaStrategies.map((strategy) => ({
      segments: [strategy.vertical]
    })),
    ...getQaReports().flatMap((report) => [
      {
        segments: [report.vertical, report.customerSlug, report.slug]
      },
      {
        segments: [report.vertical, report.customerSlug]
      },
      {
        segments: [report.vertical, report.slug]
      },
      {
        segments: [report.slug]
      }
    ])
  ];
}

export async function generateMetadata({ params }: QaReportRouteProps): Promise<Metadata> {
  const { segments } = await params;
  if (!segments?.length) {
    return {
      title: 'Sladdis QA report verticals',
      description: 'Public Sladdis QA report strategies and generated reports.'
    };
  }

  if (segments.length === 1) {
    const strategy = getQaStrategy(segments[0]!);
    if (strategy) {
      return {
        title: `${strategy.name} | Sladdis QA`,
        description: strategy.description,
        alternates: {
          canonical: `/qa-rapport/${strategy.vertical}`
        }
      };
    }
  }

  if (segments.length === 2) {
    const [vertical, customerSlug] = segments;
    const strategy = getQaStrategy(vertical!);
    const allReports = await getAllQaReports();
    const customerReports = strategy
      ? allReports.filter(
          (report) => report.vertical === vertical && report.customerSlug === customerSlug
        )
      : [];
    if (strategy && customerReports.length > 0) {
      const firstReport = customerReports[0]!;
      return {
        title: `${firstReport.customerName} ${strategy.shortName} QA reports`,
        description: `Public ${strategy.name} reports for ${firstReport.customerName}.`,
        alternates: {
          canonical: `/qa-rapport/${strategy.vertical}/${firstReport.customerSlug}`
        }
      };
    }
  }

  const resolved = await resolveQaReport(segments);

  if (!resolved) {
    return {
      title: 'QA report not found'
    };
  }

  const { report, strategy } = resolved;

  return {
    title: `${report.title} | ${strategy?.shortName ?? 'Sladdis'} QA`,
    description: report.executiveSummary,
    alternates: {
      canonical: `/qa-rapport/${report.vertical}/${report.customerSlug}/${report.slug}`
    },
    openGraph: {
      title: `${report.title} | ${strategy?.shortName ?? 'Sladdis'} QA`,
      description: report.executiveSummary,
      url: `/qa-rapport/${report.vertical}/${report.customerSlug}/${report.slug}`,
      type: 'article'
    }
  };
}

export default async function QaReportRoute({ params }: QaReportRouteProps) {
  const { segments } = await params;

  if (!segments?.length) {
    return <QaReportIndexPage strategies={qaStrategies} reports={await getAllQaReports()} />;
  }

  if (segments.length === 1) {
    const strategy = getQaStrategy(segments[0]!);
    if (strategy) {
      const allReports = await getAllQaReports();
      return (
        <QaVerticalPage
          strategy={strategy}
          reports={allReports.filter((report) => report.vertical === strategy.vertical)}
        />
      );
    }
  }

  if (segments.length === 2) {
    const [vertical, customerSlug] = segments;
    const strategy = getQaStrategy(vertical!);
    const allReports = await getAllQaReports();
    const customerReports = strategy
      ? allReports.filter(
          (report) => report.vertical === vertical && report.customerSlug === customerSlug
        )
      : [];
    if (strategy && customerReports.length > 0) {
      const firstReport = customerReports[0]!;
      return (
        <QaCustomerPage
          customerName={firstReport.customerName}
          customerSlug={firstReport.customerSlug}
          strategy={strategy}
          reports={customerReports}
        />
      );
    }
  }

  const resolved = await resolveQaReport(segments);

  if (!resolved) {
    notFound();
  }

  return <QaReportPage report={resolved.report} strategy={resolved.strategy} />;
}
