import React from 'react';
import {
  AbsoluteFill,
  Audio,
  interpolate,
  Sequence,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig
} from 'remotion';

const palette = {
  paper: '#f7f4ee',
  panel: '#fffdf8',
  ink: '#171514',
  muted: '#675f56',
  line: '#ddd5c8',
  dark: '#1f1d1b',
  green: '#2d8759',
  blue: '#315f8f',
  red: '#b7473a',
  yellow: '#d19a2e'
};

const scenes = {
  open: { start: 0, duration: 210 },
  idea: { start: 210, duration: 240 },
  access: { start: 450, duration: 300 },
  context: { start: 750, duration: 300 },
  board: { start: 1050, duration: 270 },
  loop: { start: 1320, duration: 330 },
  qaa: { start: 1650, duration: 270 },
  close: { start: 1920, duration: 180 }
};

function sceneFade(frame: number, duration: number) {
  return interpolate(frame, [0, 18, duration - 24, duration], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
  });
}

function usePop(frame: number, delay = 0) {
  const { fps } = useVideoConfig();
  return spring({
    fps,
    frame: Math.max(0, frame - delay),
    config: { damping: 18, stiffness: 130, mass: 0.9 }
  });
}

const shell: React.CSSProperties = {
  background: palette.paper,
  color: palette.ink,
  fontFamily:
    'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
};

const card: React.CSSProperties = {
  background: palette.panel,
  border: `2px solid ${palette.line}`,
  borderRadius: 8,
  boxShadow: '0 22px 60px rgba(35, 30, 25, 0.13)'
};

function Wordmark() {
  return (
    <div
      style={{
        position: 'absolute',
        left: 72,
        top: 54,
        display: 'flex',
        alignItems: 'center',
        gap: 14
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 8,
          background: palette.dark,
          color: palette.paper,
          display: 'grid',
          placeItems: 'center',
          fontSize: 18,
          fontWeight: 900
        }}
      >
        QA
      </div>
      <div>
        <div style={{ fontSize: 25, fontWeight: 900 }}>QAA</div>
        <div style={{ color: palette.muted, fontSize: 16 }}>QA platform for agent work</div>
      </div>
    </div>
  );
}

function Caption({ left, right }: { left: string; right: string }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: 96,
        right: 96,
        bottom: 62,
        display: 'flex',
        justifyContent: 'space-between',
        color: palette.muted,
        fontSize: 26
      }}
    >
      <span>{left}</span>
      <span>{right}</span>
    </div>
  );
}

function SvgFrame({
  children,
  width = 720,
  height = 520
}: {
  children: React.ReactNode;
  width?: number;
  height?: number;
}) {
  return (
    <div style={{ ...card, width, height, padding: 0, overflow: 'hidden', background: '#fffefa' }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <defs>
          <pattern id='grid' width='32' height='32' patternUnits='userSpaceOnUse'>
            <path d='M 32 0 L 0 0 0 32' fill='none' stroke='#eee7dc' strokeWidth='1' />
          </pattern>
          <filter id='softShadow' x='-20%' y='-20%' width='140%' height='140%'>
            <feDropShadow
              dx='0'
              dy='16'
              stdDeviation='18'
              floodColor='#231e19'
              floodOpacity='0.14'
            />
          </filter>
        </defs>
        <rect width={width} height={height} fill='url(#grid)' />
        {children}
      </svg>
    </div>
  );
}

function PlatformSvg({ frame }: { frame: number }) {
  const pulse = interpolate(frame, [20, 90, 160], [0.75, 1, 0.75], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
  });
  return (
    <SvgFrame width={760} height={560}>
      <rect
        x='270'
        y='178'
        width='220'
        height='160'
        rx='14'
        fill={palette.dark}
        filter='url(#softShadow)'
      />
      <text x='380' y='238' textAnchor='middle' fill={palette.paper} fontSize='42' fontWeight='950'>
        QAA
      </text>
      <text x='380' y='282' textAnchor='middle' fill='#d8d1c8' fontSize='21' fontWeight='800'>
        platform
      </text>
      {(
        [
          ['Human team', 58, 70, palette.blue],
          ['Work Board', 508, 70, palette.yellow],
          ['Sladdis', 58, 388, palette.green],
          ['Evidence', 508, 388, palette.red]
        ] as const
      ).map(([label, x, y, color]) => (
        <g key={label} opacity='0.98'>
          <rect
            x={x}
            y={y}
            width='194'
            height='92'
            rx='12'
            fill='#fffdf8'
            stroke={color}
            strokeWidth='3'
            filter='url(#softShadow)'
          />
          <text
            x={Number(x) + 97}
            y={Number(y) + 55}
            textAnchor='middle'
            fill={palette.ink}
            fontSize='21'
            fontWeight='900'
          >
            {label}
          </text>
        </g>
      ))}
      {(
        [
          ['M252 116 C310 116 310 204 270 224', palette.blue],
          ['M508 116 C450 116 450 204 490 224', palette.yellow],
          ['M252 434 C310 434 310 320 270 292', palette.green],
          ['M508 434 C450 434 450 320 490 292', palette.red]
        ] as const
      ).map(([d, color], index) => (
        <path
          key={d}
          d={d}
          fill='none'
          stroke={color}
          strokeWidth='6'
          strokeLinecap='round'
          strokeDasharray={`${interpolate(frame, [25 + index * 12, 80 + index * 12], [0, 210], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp'
          })} 220`}
        />
      ))}
      <circle
        cx='380'
        cy='258'
        r={70 * pulse}
        fill='none'
        stroke='#b7dfc7'
        strokeWidth='3'
        opacity='0.42'
      />
    </SvgFrame>
  );
}

function TokenSvg({ frame }: { frame: number }) {
  return (
    <SvgFrame width={760} height={480}>
      <rect
        x='78'
        y='82'
        width='180'
        height='260'
        rx='18'
        fill='#e9f1f8'
        stroke='#bcd0e4'
        strokeWidth='3'
      />
      <circle cx='168' cy='158' r='46' fill={palette.blue} />
      <text x='168' y='168' textAnchor='middle' fill='white' fontSize='38' fontWeight='950'>
        H
      </text>
      <rect
        x='502'
        y='82'
        width='180'
        height='260'
        rx='18'
        fill='#e7f5ed'
        stroke='#b7dfc7'
        strokeWidth='3'
      />
      <circle cx='592' cy='158' r='46' fill={palette.green} />
      <text x='592' y='168' textAnchor='middle' fill='white' fontSize='34' fontWeight='950'>
        S
      </text>
      <rect
        x='290'
        y='186'
        width='180'
        height='86'
        rx='43'
        fill={palette.dark}
        filter='url(#softShadow)'
      />
      <text x='380' y='238' textAnchor='middle' fill={palette.paper} fontSize='21' fontWeight='900'>
        qa_agent_...
      </text>
      <path
        d='M258 212 L290 212'
        stroke={palette.blue}
        strokeWidth='8'
        strokeLinecap='round'
        strokeDasharray={`${interpolate(frame, [25, 70], [0, 40], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })} 44`}
      />
      <path
        d='M470 212 L502 212'
        stroke={palette.green}
        strokeWidth='8'
        strokeLinecap='round'
        strokeDasharray={`${interpolate(frame, [70, 115], [0, 40], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })} 44`}
      />
      <text x='168' y='270' textAnchor='middle' fill={palette.ink} fontSize='23' fontWeight='900'>
        approve
      </text>
      <text x='592' y='270' textAnchor='middle' fill={palette.ink} fontSize='23' fontWeight='900'>
        scoped
      </text>
    </SvgFrame>
  );
}

function WorkspaceSvg({ frame }: { frame: number }) {
  const nodes = [
    ['Profile', 98, 92, palette.blue],
    ['Flows', 300, 66, palette.green],
    ['Risk', 515, 104, palette.red],
    ['Rules', 128, 310, palette.yellow],
    ['Test data', 338, 334, palette.blue],
    ['Notes', 540, 304, palette.green]
  ] as const;
  return (
    <SvgFrame width={760} height={510}>
      <rect
        x='286'
        y='188'
        width='190'
        height='100'
        rx='14'
        fill={palette.dark}
        filter='url(#softShadow)'
      />
      <text x='381' y='247' textAnchor='middle' fill={palette.paper} fontSize='29' fontWeight='950'>
        Workspace
      </text>
      {nodes.map(([label, x, y, color], index) => (
        <g
          key={label}
          opacity={interpolate(frame, [20 + index * 12, 44 + index * 12], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp'
          })}
        >
          <path
            d={`M${x + 62} ${y + 31} L381 238`}
            stroke={color}
            strokeWidth='4'
            strokeLinecap='round'
            opacity='0.75'
          />
          <rect
            x={x}
            y={y}
            width='124'
            height='62'
            rx='12'
            fill='#fffdf8'
            stroke={color}
            strokeWidth='3'
          />
          <text
            x={x + 62}
            y={y + 39}
            textAnchor='middle'
            fill={palette.ink}
            fontSize='18'
            fontWeight='900'
          >
            {label}
          </text>
        </g>
      ))}
    </SvgFrame>
  );
}

function TestingToolsSvg({ frame }: { frame: number }) {
  const tools = [
    ['WEB', 96, palette.blue],
    ['API', 286, palette.green],
    ['MOBILE', 476, palette.yellow]
  ] as const;
  return (
    <SvgFrame width={760} height={500}>
      {tools.map(([label, x, color], index) => (
        <g
          key={label}
          opacity={interpolate(frame, [25 + index * 20, 58 + index * 20], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp'
          })}
        >
          <rect
            x={x}
            y='84'
            width='170'
            height='245'
            rx='16'
            fill='#fffdf8'
            stroke={color}
            strokeWidth='4'
            filter='url(#softShadow)'
          />
          <rect x={x + 22} y='122' width='126' height='28' rx='7' fill={color} opacity='0.9' />
          <rect x={x + 22} y='174' width='88' height='16' rx='8' fill='#d8d1c8' />
          <rect x={x + 22} y='214' width='126' height='16' rx='8' fill='#d8d1c8' />
          <rect x={x + 22} y='254' width='104' height='16' rx='8' fill='#d8d1c8' />
          <text
            x={x + 85}
            y='384'
            textAnchor='middle'
            fill={palette.ink}
            fontSize='25'
            fontWeight='950'
          >
            {label}
          </text>
        </g>
      ))}
      <path d='M180 410 L580 410' stroke={palette.dark} strokeWidth='7' strokeLinecap='round' />
      <circle
        cx={interpolate(frame, [80, 210], [180, 580], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp'
        })}
        cy='410'
        r='14'
        fill={palette.green}
      />
    </SvgFrame>
  );
}

function EvidenceSvg({ frame }: { frame: number }) {
  return (
    <SvgFrame width={780} height={520}>
      <rect
        x='78'
        y='84'
        width='265'
        height='310'
        rx='16'
        fill='#fffdf8'
        stroke={palette.line}
        strokeWidth='3'
        filter='url(#softShadow)'
      />
      <rect
        x='108'
        y='126'
        width='205'
        height='138'
        rx='10'
        fill='#e9f1f8'
        stroke='#bcd0e4'
        strokeWidth='3'
      />
      <path
        d='M130 226 L176 184 L214 218 L244 194 L294 244'
        fill='none'
        stroke={palette.blue}
        strokeWidth='5'
        strokeLinecap='round'
      />
      <rect x='108' y='296' width='184' height='18' rx='9' fill='#d8d1c8' />
      <rect x='108' y='334' width='132' height='18' rx='9' fill='#d8d1c8' />
      <rect
        x='438'
        y='120'
        width='250'
        height='236'
        rx='16'
        fill='#fbe8e5'
        stroke='#e5b4ad'
        strokeWidth='3'
        filter='url(#softShadow)'
      />
      <text x='563' y='174' textAnchor='middle' fill={palette.red} fontSize='30' fontWeight='950'>
        RUN-088
      </text>
      <text x='563' y='222' textAnchor='middle' fill={palette.ink} fontSize='24' fontWeight='900'>
        Step 3 failed
      </text>
      <rect x='486' y='264' width='154' height='42' rx='21' fill={palette.red} opacity='0.92' />
      <text x='563' y='292' textAnchor='middle' fill='white' fontSize='18' fontWeight='950'>
        create_defect
      </text>
      <path
        d='M343 240 C390 240 390 238 438 238'
        fill='none'
        stroke={palette.green}
        strokeWidth='7'
        strokeLinecap='round'
        strokeDasharray={`${interpolate(frame, [35, 95], [0, 110], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })} 120`}
      />
    </SvgFrame>
  );
}

function Pill({
  label,
  tone = 'green'
}: {
  label: string;
  tone?: 'green' | 'blue' | 'yellow' | 'red' | 'dark';
}) {
  const color = {
    green: { bg: '#e7f5ed', fg: palette.green, bd: '#b7dfc7' },
    blue: { bg: '#e9f1f8', fg: palette.blue, bd: '#bcd0e4' },
    yellow: { bg: '#fff3cf', fg: '#7b5b12', bd: '#e9ca71' },
    red: { bg: '#fbe8e5', fg: palette.red, bd: '#e5b4ad' },
    dark: { bg: palette.dark, fg: palette.paper, bd: palette.dark }
  }[tone];
  return (
    <span
      style={{
        border: `1px solid ${color.bd}`,
        background: color.bg,
        color: color.fg,
        borderRadius: 999,
        padding: '8px 14px',
        fontSize: 18,
        fontWeight: 800,
        whiteSpace: 'nowrap'
      }}
    >
      {label}
    </span>
  );
}

function SectionTitle({
  title,
  body,
  width = 760
}: {
  title: string;
  body: string;
  width?: number;
}) {
  return (
    <div style={{ width }}>
      <div style={{ fontSize: 76, lineHeight: 0.98, fontWeight: 950, letterSpacing: 0 }}>
        {title}
      </div>
      <div style={{ marginTop: 28, color: palette.muted, fontSize: 31, lineHeight: 1.28 }}>
        {body}
      </div>
    </div>
  );
}

function ChatCard({ text, muted = false }: { text: string; muted?: boolean }) {
  return (
    <div
      style={{
        ...card,
        width: 590,
        padding: '24px 28px',
        fontSize: 28,
        lineHeight: 1.2,
        color: muted ? palette.muted : palette.ink,
        background: muted ? '#fbfaf6' : palette.panel
      }}
    >
      {text}
    </div>
  );
}

function OpenScene() {
  const frame = useCurrentFrame();
  const pop = usePop(frame);
  return (
    <AbsoluteFill style={{ ...shell, opacity: sceneFade(frame, scenes.open.duration) }}>
      <Wordmark />
      <div
        style={{
          position: 'absolute',
          left: 112,
          top: 210,
          transform: `scale(${0.94 + pop * 0.06})`,
          transformOrigin: 'left center'
        }}
      >
        <SectionTitle
          title='A chatbot can say it checked something.'
          body='A QA platform has to prove what was checked, how it was checked, what failed, and what the team should do next.'
          width={870}
        />
      </div>
      <div
        style={{
          position: 'absolute',
          right: 128,
          top: 205,
          display: 'flex',
          flexDirection: 'column',
          gap: 20
        }}
      >
        {['I checked the page.', 'Looks fine.', 'Maybe add a test?'].map((text, index) => (
          <div
            key={text}
            style={{
              opacity: interpolate(frame, [24 + index * 18, 48 + index * 18], [0, 1], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp'
              })
            }}
          >
            <ChatCard text={text} muted />
          </div>
        ))}
        <div
          style={{
            ...card,
            width: 590,
            padding: 28,
            marginTop: 12,
            borderColor: palette.red,
            color: palette.red,
            fontSize: 25,
            fontWeight: 850
          }}
        >
          Not enough for a development flow.
        </div>
      </div>
      <Caption left='Problem' right='chat output is not QA ownership' />
    </AbsoluteFill>
  );
}

function IdeaScene() {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ ...shell, opacity: sceneFade(frame, scenes.idea.duration) }}>
      <Wordmark />
      <div style={{ position: 'absolute', left: 110, top: 190 }}>
        <SectionTitle
          title='QAA turns Sladdis into a QA worker.'
          body='QAA is the QA workspace and system of record for app context, test work, evidence, runs, and retests. Sladdis is the agent that performs the work through QAA.'
          width={790}
        />
      </div>
      <div style={{ position: 'absolute', right: 95, top: 160 }}>
        <PlatformSvg frame={frame} />
      </div>
      <Caption left='Core idea' right='QAA owns the workflow, Sladdis executes it' />
    </AbsoluteFill>
  );
}

function ConnectionDiagram({ frame }: { frame: number }) {
  const labels = [
    ['Human / team', 230, 30, palette.blue],
    ['QAA platform', 230, 205, palette.dark],
    ['Scoped access', 230, 380, palette.green],
    ['Sladdis agent', 230, 555, palette.yellow]
  ] as const;
  const progress = interpolate(frame, [28, 155], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
  });
  return (
    <>
      <svg width='780' height='700' style={{ position: 'absolute', inset: 0 }}>
        {[0, 1, 2].map((index) => (
          <line
            key={index}
            x1={390}
            y1={130 + index * 175}
            x2={390}
            y2={130 + index * 175 + 95 * progress}
            stroke={index === 1 ? palette.green : palette.blue}
            strokeWidth={5}
            strokeLinecap='round'
          />
        ))}
      </svg>
      {labels.map(([label, x, y, color], index) => (
        <div
          key={label}
          style={{
            ...card,
            position: 'absolute',
            left: x,
            top: y,
            width: 320,
            height: 105,
            display: 'grid',
            placeItems: 'center',
            borderColor: color,
            fontSize: 28,
            fontWeight: 900,
            opacity: interpolate(frame, [10 + index * 22, 36 + index * 22], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp'
            })
          }}
        >
          {label}
        </div>
      ))}
    </>
  );
}

function AccessScene() {
  const frame = useCurrentFrame();
  const local = frame;
  const steps = [
    ['1', 'agent-request-access', 'Sladdis asks for QAA access'],
    ['2', 'Human approval', 'Felipe approves in the QAA app'],
    ['3', 'agent-exchange-approval', 'QAA returns a scoped token'],
    ['4', 'qa_agent_...', 'Limited API permissions only']
  ];
  return (
    <AbsoluteFill style={{ ...shell, opacity: sceneFade(frame, scenes.access.duration) }}>
      <Wordmark />
      <div style={{ position: 'absolute', left: 96, top: 180 }}>
        <SectionTitle
          title='Safe access first.'
          body='Sladdis never gets the user session. QAA grants a scoped agent token after human approval.'
          width={680}
        />
      </div>
      <div style={{ position: 'absolute', right: 92, top: 112 }}>
        <TokenSvg frame={frame} />
      </div>
      <div
        style={{
          position: 'absolute',
          left: 98,
          bottom: 142,
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 365px)',
          gap: 14
        }}
      >
        {steps.map(([nr, title, body], index) => (
          <div
            key={title}
            style={{
              ...card,
              width: 365,
              padding: 18,
              display: 'grid',
              gridTemplateColumns: '52px 1fr',
              alignItems: 'center',
              gap: 14,
              opacity: interpolate(local, [20 + index * 28, 42 + index * 28], [0, 1], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp'
              }),
              transform: `translateY(${interpolate(
                local,
                [20 + index * 28, 42 + index * 28],
                [20, 0],
                {
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp'
                }
              )}px)`
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 999,
                background: palette.dark,
                color: palette.paper,
                display: 'grid',
                placeItems: 'center',
                fontWeight: 900,
                fontSize: 20
              }}
            >
              {nr}
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 900 }}>{title}</div>
              <div style={{ marginTop: 4, color: palette.muted, fontSize: 15, lineHeight: 1.2 }}>
                {body}
              </div>
            </div>
          </div>
        ))}
      </div>
      <Caption left='Access' right='claim, approval, scoped agent token' />
    </AbsoluteFill>
  );
}

function ContextScene() {
  const frame = useCurrentFrame();
  const items = [
    'Product profile',
    'Key flows',
    'Risk areas',
    'Testing rules',
    'Safe test data',
    'Retest queue',
    'Agent notes'
  ];
  return (
    <AbsoluteFill style={{ ...shell, opacity: sceneFade(frame, scenes.context.duration) }}>
      <Wordmark />
      <div style={{ position: 'absolute', left: 105, top: 160 }}>
        <SectionTitle
          title='Sladdis starts by reading QAA.'
          body='The platform tells the agent what the product is, what matters, and what rules apply before any test is run.'
          width={730}
        />
      </div>
      <div style={{ position: 'absolute', right: 104, top: 130 }}>
        <WorkspaceSvg frame={frame} />
      </div>
      <div
        style={{ ...card, position: 'absolute', right: 104, bottom: 126, width: 760, padding: 22 }}
      >
        <div style={{ marginTop: 28, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {items.map((item, index) => (
            <div
              key={item}
              style={{
                border: `1px solid ${palette.line}`,
                borderRadius: 8,
                padding: '13px 16px',
                fontSize: 19,
                fontWeight: 820,
                opacity: interpolate(frame, [26 + index * 12, 46 + index * 12], [0, 1], {
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp'
                })
              }}
            >
              {item}
            </div>
          ))}
        </div>
      </div>
      <Caption left='Workspace' right='context before execution' />
    </AbsoluteFill>
  );
}

function BoardScene() {
  const frame = useCurrentFrame();
  const columns = [
    ['ready_for_qa', 'Mobile checkout validation'],
    ['testing', 'Sladdis running checks'],
    ['in_progress', 'BUG-031: CTA overlaps price']
  ] as const;
  return (
    <AbsoluteFill style={{ ...shell, opacity: sceneFade(frame, scenes.board.duration) }}>
      <Wordmark />
      <div style={{ position: 'absolute', left: 100, top: 160 }}>
        <SectionTitle
          title='The Work Board connects people and agent work.'
          body='Humans own scope and acceptance criteria. Sladdis owns the QA execution and writes QA state back.'
          width={740}
        />
      </div>
      <div
        style={{
          position: 'absolute',
          right: 80,
          top: 170,
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 250px)',
          gap: 18
        }}
      >
        {columns.map(([status, task], index) => (
          <div key={status} style={{ ...card, width: 250, height: 500, padding: 18 }}>
            <div style={{ fontSize: 20, fontWeight: 900 }}>{status}</div>
            <div
              style={{
                marginTop: 24,
                borderRadius: 8,
                padding: 18,
                background: index === 2 ? '#fbe8e5' : index === 1 ? '#fff3cf' : '#e9f1f8',
                border: `1px solid ${index === 2 ? '#e5b4ad' : index === 1 ? '#e9ca71' : '#bcd0e4'}`,
                fontSize: 22,
                fontWeight: 850,
                minHeight: 120,
                opacity: interpolate(frame, [30 + index * 45, 58 + index * 45], [0, 1], {
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp'
                })
              }}
            >
              {task}
            </div>
          </div>
        ))}
      </div>
      <Caption left='Work Board' right='ready_for_qa -> testing -> result' />
    </AbsoluteFill>
  );
}

function LoopScene() {
  const frame = useCurrentFrame();
  const steps = [
    'Plan',
    'Create cases',
    'Run checks',
    'Save evidence',
    'Update status',
    'Triage',
    'Learn'
  ];
  const radius = 235;
  const center = { x: 980, y: 505 };
  const progress = interpolate(frame, [30, 245], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
  });
  return (
    <AbsoluteFill style={{ ...shell, opacity: sceneFade(frame, scenes.loop.duration) }}>
      <Wordmark />
      <div style={{ position: 'absolute', left: 96, top: 170 }}>
        <SectionTitle
          title='The product is the QA loop.'
          body='Sladdis does not just generate a test. It creates durable QA state in QAA: cases, runs, evidence, status, triage, and regression coverage.'
          width={720}
        />
      </div>
      <svg width='1920' height='1080' style={{ position: 'absolute', inset: 0 }}>
        <circle
          cx={center.x}
          cy={center.y}
          r={radius}
          fill='none'
          stroke={palette.line}
          strokeWidth={8}
        />
        <circle
          cx={center.x}
          cy={center.y}
          r={radius}
          fill='none'
          stroke={palette.green}
          strokeWidth={8}
          strokeLinecap='round'
          strokeDasharray={`${2 * Math.PI * radius * progress} ${2 * Math.PI * radius}`}
          transform={`rotate(-90 ${center.x} ${center.y})`}
        />
      </svg>
      {steps.map((step, index) => {
        const angle = -Math.PI / 2 + (index / steps.length) * Math.PI * 2;
        const x = center.x + Math.cos(angle) * radius - 88;
        const y = center.y + Math.sin(angle) * radius - 34;
        return (
          <div
            key={step}
            style={{
              ...card,
              position: 'absolute',
              left: x,
              top: y,
              width: 176,
              height: 68,
              display: 'grid',
              placeItems: 'center',
              fontSize: 20,
              fontWeight: 900,
              borderColor: index / steps.length <= progress ? palette.green : palette.line
            }}
          >
            {step}
          </div>
        );
      })}
      <div
        style={{
          position: 'absolute',
          left: center.x - 150,
          top: center.y - 82,
          width: 300,
          textAlign: 'center'
        }}
      >
        <div style={{ fontSize: 42, fontWeight: 950 }}>QAA</div>
        <div style={{ marginTop: 8, color: palette.muted, fontSize: 20 }}>system of record</div>
      </div>
      <div
        style={{
          position: 'absolute',
          right: 90,
          bottom: 120,
          transform: 'scale(0.56)',
          transformOrigin: 'right bottom'
        }}
      >
        <TestingToolsSvg frame={frame} />
      </div>
      <Caption left='QA loop' right='repeatable, visible, auditable' />
    </AbsoluteFill>
  );
}

function QaaScene() {
  const frame = useCurrentFrame();
  const rows = [
    ['Application Map', 'Coverage partial', 'yellow'],
    ['TC-142', 'Checkout validation updated', 'green'],
    ['RUN-088', 'Step 3 failed', 'red'],
    ['Evidence', 'Screenshot attached', 'blue'],
    ['Triage', 'create_defect recommended', 'yellow']
  ] as const;
  return (
    <AbsoluteFill style={{ ...shell, opacity: sceneFade(frame, scenes.qaa.duration) }}>
      <Wordmark />
      <div style={{ position: 'absolute', left: 96, top: 175 }}>
        <SectionTitle
          title='Humans inspect the work in QAA.'
          body='Projects, work items, maps, test cases, runs, screenshots, bugs, triage actions, and history live in the app.'
          width={710}
        />
      </div>
      <div style={{ position: 'absolute', right: 105, top: 116 }}>
        <EvidenceSvg frame={frame} />
      </div>
      <div
        style={{ ...card, position: 'absolute', right: 105, bottom: 112, width: 780, padding: 22 }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 32, fontWeight: 950 }}>QAA Project</div>
            <div style={{ color: palette.muted, fontSize: 17 }}>team-visible QA state</div>
          </div>
          <Pill label='agent-written' tone='blue' />
        </div>
        <div
          style={{ marginTop: 18, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}
        >
          {[
            ['Cases', '48'],
            ['Runs', '19'],
            ['Bugs', '7'],
            ['Evidence', '132']
          ].map(([label, value]) => (
            <div
              key={label}
              style={{ border: `1px solid ${palette.line}`, borderRadius: 8, padding: 12 }}
            >
              <div style={{ color: palette.muted, fontSize: 15 }}>{label}</div>
              <div style={{ fontSize: 30, fontWeight: 950 }}>{value}</div>
            </div>
          ))}
        </div>
        <div
          style={{
            marginTop: 16,
            border: `1px solid ${palette.line}`,
            borderRadius: 8,
            overflow: 'hidden'
          }}
        >
          {rows.map(([left, right, tone], index) => (
            <div
              key={left}
              style={{
                display: 'grid',
                gridTemplateColumns: '210px 1fr 150px',
                gap: 18,
                alignItems: 'center',
                padding: '11px 16px',
                borderTop: index ? `1px solid ${palette.line}` : undefined,
                fontSize: 17
              }}
            >
              <strong>{left}</strong>
              <span>{right}</span>
              <Pill
                label={index === 2 ? 'failed' : 'saved'}
                tone={tone as 'green' | 'blue' | 'yellow' | 'red'}
              />
            </div>
          ))}
        </div>
      </div>
      <Caption left='QAA app' right='where the team follows QA status' />
    </AbsoluteFill>
  );
}

function CloseScene() {
  const frame = useCurrentFrame();
  const pop = usePop(frame);
  return (
    <AbsoluteFill
      style={{
        ...shell,
        background: palette.dark,
        color: palette.paper,
        opacity: sceneFade(frame, scenes.close.duration)
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 118,
          top: 215,
          transform: `scale(${0.95 + pop * 0.05})`,
          transformOrigin: 'left center'
        }}
      >
        <div style={{ fontSize: 82, lineHeight: 1.04, fontWeight: 950, width: 1320 }}>
          QAA owns the QA workflow.
          <br />
          Sladdis performs the work.
          <br />
          The team gets evidence, status, and history.
        </div>
        <div style={{ marginTop: 42, display: 'flex', gap: 16 }}>
          <Pill label='scoped APIs' tone='green' />
          <Pill label='system of record' tone='blue' />
          <Pill label='agent execution' tone='yellow' />
        </div>
      </div>
      <div style={{ position: 'absolute', right: 92, bottom: 62, color: '#d6d0c8', fontSize: 25 }}>
        QA agent work, controlled by QAA.
      </div>
    </AbsoluteFill>
  );
}

function Soundtrack() {
  const sceneStarts = [
    scenes.idea.start,
    scenes.access.start,
    scenes.context.start,
    scenes.board.start,
    scenes.loop.start,
    scenes.qaa.start,
    scenes.close.start
  ];

  return (
    <>
      <Audio src={staticFile('audio/qaa-ambient.wav')} volume={0.12} />
      {sceneStarts.map((start, index) => (
        <Sequence key={start} from={start + 4} durationInFrames={24}>
          <Audio
            src={staticFile(
              index === sceneStarts.length - 1 ? 'audio/qaa-hit.wav' : 'audio/qaa-blip.wav'
            )}
            volume={index === sceneStarts.length - 1 ? 0.18 : 0.1}
          />
        </Sequence>
      ))}
    </>
  );
}

export const QaaSladdisPlatform: React.FC = () => {
  return (
    <AbsoluteFill style={shell}>
      <Soundtrack />
      <Sequence from={scenes.open.start} durationInFrames={scenes.open.duration}>
        <OpenScene />
      </Sequence>
      <Sequence from={scenes.idea.start} durationInFrames={scenes.idea.duration}>
        <IdeaScene />
      </Sequence>
      <Sequence from={scenes.access.start} durationInFrames={scenes.access.duration}>
        <AccessScene />
      </Sequence>
      <Sequence from={scenes.context.start} durationInFrames={scenes.context.duration}>
        <ContextScene />
      </Sequence>
      <Sequence from={scenes.board.start} durationInFrames={scenes.board.duration}>
        <BoardScene />
      </Sequence>
      <Sequence from={scenes.loop.start} durationInFrames={scenes.loop.duration}>
        <LoopScene />
      </Sequence>
      <Sequence from={scenes.qaa.start} durationInFrames={scenes.qaa.duration}>
        <QaaScene />
      </Sequence>
      <Sequence from={scenes.close.start} durationInFrames={scenes.close.duration}>
        <CloseScene />
      </Sequence>
    </AbsoluteFill>
  );
};
