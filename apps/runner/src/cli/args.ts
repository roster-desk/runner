export type CliArgs = {
  help: boolean;
  command: string;
  rest: string[];
  hub?: string;
  ui: boolean;
  yes: boolean;
};

export function parseArgs(argv: string[]): CliArgs {
  const hubIndex = argv.indexOf("--hub");
  const hub = hubIndex >= 0 ? argv[hubIndex + 1] : undefined;
  const rest = argv.filter((arg, index) => keepArg(arg, index, hubIndex));
  return {
    help: argv.includes("--help") || argv.includes("-h"),
    command: rest[0] ?? "start",
    rest: rest.slice(1),
    hub,
    ui: argv.includes("--ui") || argv.includes("--desktop"),
    yes: argv.includes("--yes"),
  };
}

function keepArg(arg: string, index: number, hubIndex: number) {
  if (arg === "--ui" || arg === "--desktop" || arg === "--yes" || arg === "--help" || arg === "-h") return false;
  return index !== hubIndex && index !== hubIndex + 1;
}

export const HELP = `roster-desk <명령>

  start [--hub URL] [--ui]   Hub에 연결합니다. 기본 주소는 운영 Hub입니다.
  pair [--yes]               다시 페어링합니다.
  unpair                     이 PC의 키를 지웁니다.
  agents list                에이전트 목록
  agents add                 템플릿으로 에이전트 추가
  doctor                     Node, 키 저장, SDK 자격 점검
  policy show                정책 파일 출력
  logs                       최근 로그
  service install            로그인 시 자동 시작 (준비 중)

start connects to the Hub. The default address is production.
`;
