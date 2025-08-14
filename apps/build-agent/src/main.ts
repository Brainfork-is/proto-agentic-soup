import fs from 'fs-extra';
import path from 'path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

type Ticket = {
  id: string;
  title: string;
  epic?: string;
  rawLines: string[];
  checked: boolean;
};

const repoRoot = path.resolve(__dirname, '../../..');
const ticketsPath = path.join(repoRoot, 'docs', 'tickets.md');
const conceptPath = path.join(repoRoot, 'docs', 'concept.md');
const specPath = path.join(repoRoot, 'docs', 'tech-spec.md');
const defaultPromptsDir = path.join(repoRoot, 'docs', 'agent-prompts');

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
    const ticketMatch = /^-\s+\[( |x)\]\s+\*\*\[([^\]]+)\]\s+(.+?)\*\*/.exec(line);
    if (ticketMatch) {
      const checked = ticketMatch[1] === 'x';
      const id = ticketMatch[2].trim();
      const title = ticketMatch[3].trim();
      const rawLines = [line];
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
  if (id) return tickets.find((t) => t.id === id);
  return tickets.find((t) => !t.checked);
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

function writePrompt(outDir: string, ticket: Ticket, content: string): string {
  ensureDir(outDir);
  const file = path.join(outDir, `${ticket.id}.md`);
  fs.writeFileSync(file, content);
  return file;
}

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .option('id', { type: 'string', describe: 'Ticket id like M-1' })
    .option('out-dir', {
      type: 'string',
      default: defaultPromptsDir,
      describe: 'Output directory for prompts',
    })
    .strict()
    .help().argv;

  const concept = readMarkdown(conceptPath);
  const spec = readMarkdown(specPath);
  const ticketsMd = readMarkdown(ticketsPath);
  const tickets = parseTickets(ticketsMd);
  const ticket = selectNextTicket(tickets, (argv as any).id);
  if (!ticket) {
    console.error('No matching or remaining ticket found.');
    process.exit(1);
  }

  console.log(`Selected ticket: ${ticket.id} — ${ticket.title}`);

  const outDir = String((argv as any)['out-dir'] || defaultPromptsDir);
  const prompt = generatePrompt(ticket, concept, spec);
  const promptFile = writePrompt(outDir, ticket, prompt);
  console.log(`Prompt written to ${path.relative(repoRoot, promptFile)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
