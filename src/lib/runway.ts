export type RunwaySnapshot = {
  generatedAt: string;
  source: string;
  posture: 'urgent' | 'watch' | 'stable';
  guardrails: string[];
  situation: Array<{ label: string; value: string; detail: string }>;
  paths: Array<{
    id: string;
    title: string;
    fit: string;
    speed: string;
    downside: string;
    nextAction: string;
  }>;
  nextSevenDays: string[];
  questions: string[];
};

export function getRunwaySnapshot(): RunwaySnapshot {
  return {
    generatedAt: new Date().toISOString(),
    source: 'life-os:safe-summary',
    posture: 'urgent',
    guardrails: [
      'Do not store bank logins, card numbers, account numbers, OTPs, API keys or raw statements.',
      'Use ranges and decisions, not sensitive transaction detail.',
      'Treat this as planning support, not financial advice.'
    ],
    situation: [
      {
        label: 'Runway pressure',
        value: 'tight',
        detail: 'Current cash runway is short unless additional liquidity arrives.'
      },
      {
        label: 'Best-fit income angle',
        value: 'AI QA / test automation',
        detail: 'Fastest credible paid offer based on fintech/banking QA lead background.'
      },
      {
        label: 'Autonomy constraint',
        value: 'important',
        detail: 'Prefer fixed-scope/advisory work over long onsite consulting if possible.'
      },
      {
        label: 'Product upside',
        value: 'Lysande + side products',
        detail: 'Keep building, but do not count on near-term product revenue as the only plan.'
      }
    ],
    paths: [
      {
        id: 'qa-audit-sprint',
        title: 'AI QA Audit Sprint',
        fit: 'highest',
        speed: 'fastest to cash',
        downside: 'Still requires outreach and sales conversations.',
        nextAction:
          'Package a 1-page fixed-scope offer and send it to warm fintech/product contacts.'
      },
      {
        id: 'part-time-advisory',
        title: 'Part-time QA/AI advisory',
        fit: 'high',
        speed: 'medium',
        downside: 'Can drift into vague consulting unless scope is tight.',
        nextAction: 'Define 1-2 day/week advisory terms with clear deliverables and exit point.'
      },
      {
        id: 'product-revenue',
        title: 'Product revenue push',
        fit: 'strategic',
        speed: 'slower',
        downside: 'Not reliable enough for immediate runway alone.',
        nextAction:
          'Keep Lysande lead research/outreach moving, but cap time until paid signals improve.'
      }
    ],
    nextSevenDays: [
      'Write the AI QA Audit Sprint one-pager: problem, outcome, timeline, price range, proof points.',
      'List 20 warm/relevant leads ranked by speed-to-cash and trust.',
      'Draft two Swedish outreach variants: warm contact and cold fintech/product lead.',
      'Decide the minimum acceptable paid engagement for the next 30 days.',
      'Keep one product-growth block for Lysande, but do not let it consume the whole week.'
    ],
    questions: [
      'What is the minimum monthly cash target that makes the next 60 days feel safe?',
      'Which 5 warm people would not be weird to message this week?',
      'What kind of consulting engagement is explicitly not acceptable?'
    ]
  };
}
