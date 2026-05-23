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
        nextAction: 'Approve price, availability and 3-5 warm paths before any external outreach.'
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
      'Choose AI QA Audit Sprint price floor and target; draft default is 45k/65k SEK ex VAT.',
      'Pick one concrete 5-working-day availability window plus one backup window.',
      'Name 3-5 warm contacts or referral paths for the first batch.',
      'Match each approved contact to a feedback, referral or discovery-call message variant.',
      'Keep one product-growth block for Lysande, but do not let it consume the whole week.'
    ],
    questions: [
      'Is the 45k SEK floor / 65k SEK target acceptable for the first AI QA Audit Sprint batch?',
      'Which 5-working-day window can Felipe actually sell first?',
      'Which 3-5 warm paths are safe and natural to approach?'
    ]
  };
}
