import fs from 'fs-extra';
import path from 'path';
import { execSync } from 'child_process';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

type Ticket = {
  id: string; // e.g., M-1
  title: string; // short title
  epic?: string; // optional inferred epic
  rawLines: string[]; // the lines for this ticket block
  checked: boolean;
};

const repoRoot = path.resolve(__dirname, '../../..');
const ticketsPath = path.join(repoRoot, 'docs', 'tickets.md');
const conceptPath = path.join(repoRoot, 'docs', 'concept.md');
const specPath = path.join(repoRoot, 'docs', 'tech-spec.md');
const promptsDir = path.join(repoRoot, 'docs', 'agent-prompts');

function readMarkdown(filePath: string): string {
  if (!fs.existsSync(filePath)) throw new Error(`Missing file: ${filePath}`);
  return fs.readFileSync(filePath, 'utf8');
}

function parseTickets(md: string): Ticket[] {
  const lines = md.split(/\r?\n/);
  const tickets: Ticket[] = [];
  let currentEpic: string | undefined;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const epicMatch = /^#\s+Epic\s+([A-Z])\s+—\s+(.+)/.exec(line);
    if (epicMatch) {
      currentEpic = `Epic ${epicMatch[1]} — ${epicMatch[2]}`;
      continue;
    }
    // Be tolerant of trailing details, Unicode line separators, etc.
    // Only require the checklist, [ID], and the bolded title; ignore the remainder of the line.
    const ticketMatch = /^-\s+\[( |x)\]\s+\*\*\[([^\]]+)\]\s+(.+?)\*\*/.exec(line);
    if (ticketMatch) {
      const checked = ticketMatch[1] === 'x';
      const id = ticketMatch[2].trim();
      const title = ticketMatch[3].trim();
      const rawLines = [line];
      // Include following detail lines until next bullet or header
      let j = i + 1;
      while (j < lines.length && !/^\s*-\s+\[/.test(lines[j]) && !/^#/.test(lines[j])) {
        rawLines.push(lines[j]);
        j++;
      }
      tickets.push({ id, title, epic: currentEpic, rawLines, checked });
    }
  }
  return tickets;
}

function selectNextTicket(tickets: Ticket[], id?: string): Ticket | undefined {
  if (id) return tickets.find(t => t.id === id);
  return tickets.find(t => !t.checked);
}

function ensureDir(dir: string) {
  fs.mkdirpSync(dir);
}

function generatePrompt(ticket: Ticket, concept: string, spec: string): string {
  const header = `You are Codex CLI, acting as an autonomous repo engineer.`;
  const goal = `Goal: Complete ticket ${ticket.id} — ${ticket.title} in this repository with minimal guidance.`;
  const constraints = [
    'Work inside the existing monorepo (pnpm workspaces, TypeScript).',
    'Use focused, minimal changes consistent with current style.',
    'Prefer adding to apps or packages as per architecture.',
    'Ensure build succeeds: pnpm build; add scripts if needed.',
    'If adding runtime endpoints, provide brief usage in code comments or README of the app.',
    'When complete, check off the ticket in docs/tickets.md and prepare a PR on a new branch.',
  ];
  const repoTips = [
    'Root scripts: pnpm dev | pnpm build | pnpm start | pnpm test.',
    'Redis: cd infra && docker compose up -d.',
    'Prisma (runner): pnpm prisma:generate | pnpm prisma:migrate.',
    'Apps: browser-gateway, site-kb, soup-runner. Packages: common, agents.',
  ];
  const ticketBlock = ticket.rawLines.join('\n');
  return [
    `# Autonomous Task Prompt`,
    '',
    header,
    goal,
    '',
    '## Ticket Context (from docs/tickets.md)',
    '```md',
    ticketBlock,
    '```',
    '',
    '## Repository Context',
    `- ${repoTips.join('\n- ')}`,
    '',
    '## Constraints',
    `- ${constraints.join('\n- ')}`,
    '',
    '## Concept (excerpt)',
    '```md',
    concept.slice(0, 2500),
    '```',
    '',
    '## Technical Spec (excerpt)',
    '```md',
    spec.slice(0, 3500),
    '```',
    '',
    '## Output Expectations',
    '- Implement code and update docs as needed.',
    '- Verify with pnpm build and any relevant dev run.',
    '- Create a new branch: feat/' + ticket.id.toLowerCase() + '-auto, commit changes.',
    '- Mark the ticket as done in docs/tickets.md.',
    '- Open a PR with a clear summary and test notes.',
  ].join('\n');
}

function writePrompt(ticket: Ticket, content: string): string {
  ensureDir(promptsDir);
  const file = path.join(promptsDir, `${ticket.id}.md`);
  fs.writeFileSync(file, content);
  return file;
}

function checkOffTicket(md: string, id: string): string {
  // Replace the first occurrence of "- [ ] **[ID]" with "- [x] **[ID]"
  const pattern = new RegExp(`(- \\\[ \\\] \\\*\\\\\\[${id.replace(/[-]/g, '\\$&')}\\\\\\] )`);
  if (pattern.test(md)) return md.replace(pattern, '- [x] **[' + id + '] ');
  // Fallback: direct string replace if regex fails
  return md.replace(`- [ ] **[${id}]`, `- [x] **[${id}]`);
}

function run(cmd: string) {
  return execSync(cmd, { stdio: 'inherit', cwd: repoRoot });
}

function createBranchAndCommit(ticket: Ticket, branch?: string, skipBranch?: boolean) {
  const safeTitle = ticket.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const br = branch || `feat/${ticket.id.toLowerCase()}-${safeTitle}`;
  if (!skipBranch) run(`git checkout -b ${br}`);
  run('git add -A');
  const scope = (ticket.epic?.match(/^Epic\s+([A-Z])/)?.[1] || 'repo').toLowerCase();
  const msg = `feat(${scope}): complete ${ticket.id} - ${ticket.title}`;
  run(`git commit -m ${JSON.stringify(msg)}`);
  return br;
}

function tryCreatePR(branch: string, title: string, bodyPath?: string) {
  try {
    execSync('gh --version', { stdio: 'ignore' });
  } catch {
    console.error('GitHub CLI not found; skipping PR creation.');
    return false;
  }
  const bodyArg = bodyPath ? `-F ${bodyPath}` : '';
  try {
    run(`gh pr create -t ${JSON.stringify(title)} ${bodyArg}`);
    return true;
  } catch (e) {
    console.error('Failed to create PR via gh:', e);
    return false;
  }
}

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .option('id', { type: 'string', describe: 'Ticket id like M-1' })
    .option('generate', { type: 'boolean', default: true, describe: 'Generate Codex prompt' })
    .option('run-codex', { type: 'string', describe: 'Command template to run Codex CLI, e.g., "codex --prompt {file}"' })
    .option('auto', { type: 'boolean', default: true, describe: 'Auto-run Codex if available (use --no-auto to disable)' })
    .option('codex-timeout', { type: 'number', default: 600, describe: 'Timeout for Codex run in seconds' })
    .option('print-prompt', { type: 'boolean', default: true, describe: 'Print generated prompt content to stdout' })
    .option('open-prompt', { type: 'boolean', default: false, describe: 'Open prompt file in default editor (macOS/Linux)' })
    .option('check-off', { type: 'boolean', default: false, describe: 'Mark the ticket as completed in docs/tickets.md' })
    .option('commit', { type: 'boolean', default: false, describe: 'Create branch and commit changes' })
    .option('create-pr', { type: 'boolean', default: false, describe: 'Create PR via GitHub CLI if available' })
    .strict()
    .help()
    .argv;

  const concept = readMarkdown(conceptPath);
  const spec = readMarkdown(specPath);
  const ticketsMd = readMarkdown(ticketsPath);
  const tickets = parseTickets(ticketsMd);
  const ticket = selectNextTicket(tickets, argv.id);
  if (!ticket) {
    console.error('No matching or remaining ticket found.');
    process.exit(1);
  }

  console.log(`Selected ticket: ${ticket.id} — ${ticket.title}`);

  let promptFile: string | undefined;
  if (argv.generate) {
    const prompt = generatePrompt(ticket, concept, spec);
    promptFile = writePrompt(ticket, prompt);
    console.log(`Prompt written to ${path.relative(repoRoot, promptFile)}`);
    if (argv['print-prompt']) {
      try {
        const content = fs.readFileSync(promptFile, 'utf8');
        const divider = '-'.repeat(80);
        console.log(divider);
        console.log(`# Prompt Preview: ${path.relative(repoRoot, promptFile)}`);
        console.log(divider);
        console.log(content);
        console.log(divider);
      } catch (e) {
        console.error('[build-agent] Failed to read prompt for printing:', e instanceof Error ? e.message : e);
      }
    }
    if (argv['open-prompt']) {
      try {
        // macOS: open, Linux: xdg-open; ignore failures if not present
        try { execSync(`open ${JSON.stringify(promptFile)}`, { stdio: 'ignore' }); }
        catch { execSync(`xdg-open ${JSON.stringify(promptFile)}`, { stdio: 'ignore' }); }
      } catch {}
    }
  }

  // Optionally invoke Codex CLI
  if (promptFile) {
    const timeoutMs = Math.max(1, Number(argv['codex-timeout'] || 600)) * 1000;

    const replaceFile = (template: string) => {
      const quoted = JSON.stringify(promptFile);
      return template.includes('{file}') ? template.replace('{file}', quoted) : `${template} ${quoted}`;
    };

    const tryRun = (template: string) => {
      const cmd = replaceFile(template);
      console.log(`[build-agent] Running: ${cmd}`);
      try {
        execSync(cmd, { stdio: 'inherit', cwd: repoRoot, timeout: timeoutMs });
        return true;
      } catch (e) {
        console.error('[build-agent] Codex CLI invocation failed or timed out:', e instanceof Error ? e.message : e);
        return false;
      }
    };

    const detectCodex = (): string | undefined => {
      // Allow override via env
      const envCmd = process.env.CODEX_CLI;
      if (envCmd && envCmd.trim()) return envCmd.trim();
      try {
        execSync('command -v codex', { stdio: 'ignore' });
        // Default to positional prompt argument
        return 'codex {file}';
      } catch {}
      try {
        execSync('codex --version', { stdio: 'ignore' });
        return 'codex {file}';
      } catch {}
      return undefined;
    };

    if (argv['run-codex']) {
      tryRun(String(argv['run-codex']));
    } else if (argv.auto !== false) {
      const auto = detectCodex();
      if (auto) {
        tryRun(auto);
      } else {
        console.log('[build-agent] Codex CLI not found in PATH (or CODEX_CLI not set); skipping auto-run.');
      }
    }
  }

  if (argv["check-off"]) {
    const updated = checkOffTicket(ticketsMd, ticket.id);
    fs.writeFileSync(ticketsPath, updated);
    console.log(`Checked off ${ticket.id} in docs/tickets.md`);
  }

  if (argv.commit) {
    const branch = createBranchAndCommit(ticket);
    console.log(`Committed on branch ${branch}`);
    if (argv["create-pr"]) {
      const title = `Complete ${ticket.id} — ${ticket.title}`;
      const bodyPath = promptFile && fs.existsSync(promptFile) ? promptFile : undefined;
      tryCreatePR(branch, title, bodyPath);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
