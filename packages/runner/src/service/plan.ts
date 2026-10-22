import path from "node:path";

export type Step = { cmd: string; args: string[]; optional?: boolean };

export type ServicePlan = {
  file: string;
  body: string;
  logDir: string;
  install: Step[];
  uninstall: Step[];
};

export type ServicePaths = {
  platform: NodeJS.Platform;
  home: string;
  node: string;
  script: string;
  uid: number;
};

export function planService(input: ServicePaths): ServicePlan | { message: string } {
  if (input.platform === "darwin") return macPlan(input);
  if (input.platform === "linux") return linuxPlan(input);
  if (input.platform === "win32") return windowsPlan(input);
  return { message: "이 운영체제에서는 자동 시작을 지원하지 않아요." };
}

function macPlan(input: ServicePaths): ServicePlan {
  const file = path.join(input.home, "Library", "LaunchAgents", "com.rosterdesk.runner.plist");
  const target = `gui/${input.uid}/com.rosterdesk.runner`;
  return {
    file,
    body: macPlist(input),
    logDir: logDir(input.home),
    install: [
      { cmd: "launchctl", args: ["bootout", target], optional: true },
      { cmd: "launchctl", args: ["bootstrap", `gui/${input.uid}`, file] },
    ],
    uninstall: [{ cmd: "launchctl", args: ["bootout", target], optional: true }],
  };
}

function linuxPlan(input: ServicePaths): ServicePlan {
  const file = path.join(input.home, ".config", "systemd", "user", "roster-desk-runner.service");
  return {
    file,
    body: linuxUnit(input),
    logDir: logDir(input.home),
    install: [
      { cmd: "systemctl", args: ["--user", "daemon-reload"] },
      { cmd: "systemctl", args: ["--user", "enable", "--now", "roster-desk-runner.service"] },
    ],
    uninstall: [
      { cmd: "systemctl", args: ["--user", "disable", "--now", "roster-desk-runner.service"], optional: true },
      { cmd: "systemctl", args: ["--user", "daemon-reload"] },
    ],
  };
}

function windowsPlan(input: ServicePaths): ServicePlan {
  const file = path.join(input.home, ".roster-desk", "roster-desk-runner.xml");
  const task = "Roster Desk Runner";
  return {
    file,
    body: windowsTask(input),
    logDir: logDir(input.home),
    install: [{ cmd: "schtasks", args: ["/Create", "/TN", task, "/XML", file, "/F"] }],
    uninstall: [{ cmd: "schtasks", args: ["/Delete", "/TN", task, "/F"], optional: true }],
  };
}

function logDir(home: string) {
  return path.join(home, ".roster-desk", "logs");
}

function macPlist(input: ServicePaths) {
  const log = path.join(logDir(input.home), "runner.log");
  return `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
<key>Label</key><string>com.rosterdesk.runner</string>
<key>ProgramArguments</key><array>
<string>${xml(input.node)}</string><string>${xml(input.script)}</string><string>start</string>
</array>
<key>RunAtLoad</key><true/>
<key>KeepAlive</key><true/>
<key>StandardOutPath</key><string>${xml(log)}</string>
<key>StandardErrorPath</key><string>${xml(log)}</string>
</dict></plist>
`;
}

function linuxUnit(input: ServicePaths) {
  return `[Unit]
Description=Roster Desk Runner
[Service]
ExecStart=${quote(input.node)} ${quote(input.script)} start
Restart=on-failure
[Install]
WantedBy=default.target
`;
}

function windowsTask(input: ServicePaths) {
  return `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
<Triggers><LogonTrigger><Enabled>true</Enabled></LogonTrigger></Triggers>
<Actions><Exec>
<Command>${xml(input.node)}</Command>
<Arguments>${xml(`"${input.script}" start`)}</Arguments>
</Exec></Actions>
</Task>
`;
}

function xml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function quote(value: string) {
  return `"${value.replaceAll('"', '\\"')}"`;
}
