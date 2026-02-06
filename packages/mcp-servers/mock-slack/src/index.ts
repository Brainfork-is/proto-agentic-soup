#!/usr/bin/env node
/**
 * Mock Slack MCP Server
 * Provides realistic Slack workspace simulation for agent testing
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';

// ============================================================================
// Types
// ============================================================================

interface SlackUser {
  id: string;
  name: string;
  real_name: string;
  title: string;
  status_text: string;
  status_emoji: string;
}

interface SlackChannel {
  id: string;
  name: string;
  is_channel: boolean;
  is_private: boolean;
  topic: string;
  purpose: string;
  member_count: number;
}

interface SlackMessage {
  ts: string;
  user: string;
  text: string;
  channel: string;
  thread_ts?: string;
  reply_count?: number;
  reactions?: Array<{ name: string; count: number; users: string[] }>;
}

// ============================================================================
// Mock Data
// ============================================================================

const MOCK_USERS: SlackUser[] = [
  {
    id: 'U001',
    name: 'alice',
    real_name: 'Alice Chen',
    title: 'Senior Backend Engineer',
    status_text: 'In a meeting',
    status_emoji: ':calendar:',
  },
  {
    id: 'U002',
    name: 'bob',
    real_name: 'Bob Martinez',
    title: 'Frontend Developer',
    status_text: 'Focusing',
    status_emoji: ':headphones:',
  },
  {
    id: 'U003',
    name: 'charlie',
    real_name: 'Charlie Davis',
    title: 'Product Manager',
    status_text: '',
    status_emoji: '',
  },
  {
    id: 'U004',
    name: 'diana',
    real_name: 'Diana Wong',
    title: 'DevOps Engineer',
    status_text: 'Deploying to prod',
    status_emoji: ':rocket:',
  },
  {
    id: 'U005',
    name: 'eric',
    real_name: 'Eric Thompson',
    title: 'QA Engineer',
    status_text: 'Testing',
    status_emoji: ':bug:',
  },
  {
    id: 'U006',
    name: 'fiona',
    real_name: 'Fiona Liu',
    title: 'UX Designer',
    status_text: 'Design review @ 2pm',
    status_emoji: ':art:',
  },
  {
    id: 'U007',
    name: 'greg',
    real_name: 'Greg Anderson',
    title: 'Engineering Manager',
    status_text: 'Available',
    status_emoji: ':white_check_mark:',
  },
  {
    id: 'U008',
    name: 'hannah',
    real_name: 'Hannah Park',
    title: 'Data Scientist',
    status_text: 'Training models',
    status_emoji: ':chart_with_upwards_trend:',
  },
  {
    id: 'U009',
    name: 'ivan',
    real_name: 'Ivan Petrov',
    title: 'Security Engineer',
    status_text: 'Security audit',
    status_emoji: ':lock:',
  },
  {
    id: 'U010',
    name: 'julia',
    real_name: 'Julia Kim',
    title: 'Sales Engineer',
    status_text: 'Customer demo',
    status_emoji: ':computer:',
  },
  {
    id: 'U011',
    name: 'kevin',
    real_name: 'Kevin Brown',
    title: 'Technical Writer',
    status_text: 'Writing docs',
    status_emoji: ':memo:',
  },
  {
    id: 'U012',
    name: 'lisa',
    real_name: 'Lisa Green',
    title: 'Customer Success Manager',
    status_text: 'Helping customers',
    status_emoji: ':handshake:',
  },
];

const MOCK_CHANNELS: SlackChannel[] = [
  {
    id: 'C001',
    name: 'general',
    is_channel: true,
    is_private: false,
    topic: 'Company-wide announcements and discussions',
    purpose: 'This channel is for workspace-wide communication',
    member_count: 12,
  },
  {
    id: 'C002',
    name: 'engineering',
    is_channel: true,
    is_private: false,
    topic: 'Engineering team discussions',
    purpose: 'Technical discussions and engineering updates',
    member_count: 8,
  },
  {
    id: 'C003',
    name: 'random',
    is_channel: true,
    is_private: false,
    topic: 'Non-work banter and water cooler talk',
    purpose: 'A place for non-work-related chat',
    member_count: 12,
  },
  {
    id: 'C004',
    name: 'product',
    is_channel: true,
    is_private: false,
    topic: 'Product planning and roadmap discussions',
    purpose: 'Product team coordination',
    member_count: 6,
  },
  {
    id: 'C005',
    name: 'deployments',
    is_channel: true,
    is_private: false,
    topic: 'Production deployment notifications',
    purpose: 'Track all production deployments',
    member_count: 10,
  },
  {
    id: 'C006',
    name: 'incidents',
    is_channel: true,
    is_private: false,
    topic: 'Production incidents and postmortems',
    purpose: 'Incident response and coordination',
    member_count: 8,
  },
];

// Generate timestamps for the past 2 weeks during work hours
const generateTimestamp = (daysAgo: number, hour: number, minute: number = 0): string => {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setHours(hour, minute, 0, 0);
  return (date.getTime() / 1000).toFixed(6);
};

const MOCK_MESSAGES: SlackMessage[] = [
  // ========== #general channel ==========
  {
    ts: generateTimestamp(0, 9, 15),
    user: 'U007',
    text: 'Good morning team! Quick reminder that our Q4 planning meeting is this Friday at 2pm.',
    channel: 'C001',
  },
  {
    ts: generateTimestamp(0, 9, 18),
    user: 'U003',
    text: "Thanks Greg! I'll send out the agenda by EOD today.",
    channel: 'C001',
  },
  {
    ts: generateTimestamp(0, 10, 30),
    user: 'U012',
    text: 'Hi everyone! We just onboarded 3 new enterprise customers this week :tada:',
    channel: 'C001',
    reactions: [
      {
        name: 'tada',
        count: 8,
        users: ['U001', 'U002', 'U003', 'U004', 'U005', 'U006', 'U007', 'U008'],
      },
      { name: 'heart', count: 5, users: ['U001', 'U003', 'U007', 'U010', 'U011'] },
    ],
  },

  // ========== #engineering channel ==========
  {
    ts: generateTimestamp(1, 14, 0),
    user: 'U001',
    text: "I'm seeing some weird behavior with the auth service. Anyone else experiencing this?",
    channel: 'C002',
    reply_count: 5,
  },
  {
    ts: generateTimestamp(1, 14, 3),
    user: 'U002',
    text: 'Yeah, I noticed that too. Looks like the Redis cache might be stale.',
    channel: 'C002',
    thread_ts: generateTimestamp(1, 14, 0),
  },
  {
    ts: generateTimestamp(1, 14, 5),
    user: 'U004',
    text: 'I can take a look. We had a deployment this morning that might have caused it.',
    channel: 'C002',
    thread_ts: generateTimestamp(1, 14, 0),
  },
  {
    ts: generateTimestamp(1, 14, 10),
    user: 'U001',
    text: "Thanks Diana! I'll file a bug report in GitHub.",
    channel: 'C002',
    thread_ts: generateTimestamp(1, 14, 0),
  },
  {
    ts: generateTimestamp(1, 14, 25),
    user: 'U004',
    text: 'Found it! There was a typo in the Redis connection string. Deploying fix now.',
    channel: 'C002',
    thread_ts: generateTimestamp(1, 14, 0),
    reactions: [{ name: 'white_check_mark', count: 3, users: ['U001', 'U002', 'U007'] }],
  },
  {
    ts: generateTimestamp(1, 14, 35),
    user: 'U001',
    text: "Perfect! Confirmed it's working now. Thanks!",
    channel: 'C002',
    thread_ts: generateTimestamp(1, 14, 0),
  },

  {
    ts: generateTimestamp(0, 11, 30),
    user: 'U002',
    text: 'PR ready for review: https://github.com/company/api/pull/142 - Adds rate limiting to API endpoints',
    channel: 'C002',
    reactions: [{ name: 'eyes', count: 2, users: ['U001', 'U004'] }],
  },
  {
    ts: generateTimestamp(0, 15, 45),
    user: 'U001',
    text: 'Reviewed and approved! Nice work on the rate limiting logic.',
    channel: 'C002',
    reactions: [{ name: 'thumbsup', count: 1, users: ['U002'] }],
  },

  // ========== #random channel ==========
  {
    ts: generateTimestamp(2, 12, 0),
    user: 'U006',
    text: 'Anyone want to grab lunch? Thinking about that new Thai place.',
    channel: 'C003',
  },
  {
    ts: generateTimestamp(2, 12, 5),
    user: 'U002',
    text: "I'm in! Meet at noon?",
    channel: 'C003',
  },
  {
    ts: generateTimestamp(2, 12, 8),
    user: 'U005',
    text: 'Count me in too!',
    channel: 'C003',
  },

  {
    ts: generateTimestamp(0, 16, 0),
    user: 'U003',
    text: 'Happy Friday everyone! :beer:',
    channel: 'C003',
    reactions: [
      { name: 'beer', count: 7, users: ['U001', 'U002', 'U004', 'U005', 'U006', 'U007', 'U008'] },
      { name: 'tada', count: 4, users: ['U001', 'U002', 'U006', 'U010'] },
    ],
  },

  // ========== #product channel ==========
  {
    ts: generateTimestamp(3, 10, 0),
    user: 'U003',
    text: 'New feature request from customer: bulk import for user management',
    channel: 'C004',
    reply_count: 4,
  },
  {
    ts: generateTimestamp(3, 10, 15),
    user: 'U001',
    text: "We can definitely do this. I'd estimate 2 sprints for backend work.",
    channel: 'C004',
    thread_ts: generateTimestamp(3, 10, 0),
  },
  {
    ts: generateTimestamp(3, 10, 20),
    user: 'U002',
    text: 'Frontend should be about 1 sprint. Need to design the UI for bulk operations.',
    channel: 'C004',
    thread_ts: generateTimestamp(3, 10, 0),
  },
  {
    ts: generateTimestamp(3, 10, 30),
    user: 'U006',
    text: 'I can work on mockups this week. Will share in #design channel.',
    channel: 'C004',
    thread_ts: generateTimestamp(3, 10, 0),
  },
  {
    ts: generateTimestamp(3, 10, 45),
    user: 'U003',
    text: "Great! Let's prioritize this for Q4. I'll add to the roadmap.",
    channel: 'C004',
    thread_ts: generateTimestamp(3, 10, 0),
    reactions: [{ name: 'rocket', count: 4, users: ['U001', 'U002', 'U006', 'U007'] }],
  },

  {
    ts: generateTimestamp(1, 14, 30),
    user: 'U003',
    text: 'Weekly product metrics dashboard is live: https://analytics.company.com/dashboard',
    channel: 'C004',
    reactions: [
      {
        name: 'chart_with_upwards_trend',
        count: 5,
        users: ['U001', 'U007', 'U008', 'U010', 'U012'],
      },
    ],
  },

  // ========== #deployments channel ==========
  {
    ts: generateTimestamp(0, 10, 0),
    user: 'U004',
    text: ':rocket: Deploying api-gateway v2.14.0 to production',
    channel: 'C005',
  },
  {
    ts: generateTimestamp(0, 10, 15),
    user: 'U004',
    text: ':white_check_mark: Deployment successful! All health checks passing.',
    channel: 'C005',
    reactions: [{ name: 'rocket', count: 3, users: ['U001', 'U002', 'U007'] }],
  },

  {
    ts: generateTimestamp(1, 9, 30),
    user: 'U004',
    text: ':rocket: Deploying frontend v3.8.1 to production (bug fixes)',
    channel: 'C005',
  },
  {
    ts: generateTimestamp(1, 9, 45),
    user: 'U004',
    text: ':white_check_mark: Frontend deployment complete. Monitoring for errors.',
    channel: 'C005',
  },

  // ========== #incidents channel ==========
  {
    ts: generateTimestamp(4, 15, 0),
    user: 'U004',
    text: ':rotating_light: INCIDENT: API response times spiking to 5s+ on production',
    channel: 'C006',
    reply_count: 8,
  },
  {
    ts: generateTimestamp(4, 15, 2),
    user: 'U007',
    text: 'On it. Looking at the logs now.',
    channel: 'C006',
    thread_ts: generateTimestamp(4, 15, 0),
  },
  {
    ts: generateTimestamp(4, 15, 5),
    user: 'U001',
    text: 'Database queries are timing out. Checking the query logs.',
    channel: 'C006',
    thread_ts: generateTimestamp(4, 15, 0),
  },
  {
    ts: generateTimestamp(4, 15, 10),
    user: 'U008',
    text: "Found it - there's a missing index on the users table causing a full table scan.",
    channel: 'C006',
    thread_ts: generateTimestamp(4, 15, 0),
  },
  {
    ts: generateTimestamp(4, 15, 15),
    user: 'U001',
    text: 'Creating the index now. ETA 5 minutes.',
    channel: 'C006',
    thread_ts: generateTimestamp(4, 15, 0),
  },
  {
    ts: generateTimestamp(4, 15, 22),
    user: 'U001',
    text: 'Index created. Response times back to normal (<200ms).',
    channel: 'C006',
    thread_ts: generateTimestamp(4, 15, 0),
    reactions: [
      { name: 'white_check_mark', count: 5, users: ['U002', 'U004', 'U005', 'U007', 'U008'] },
    ],
  },
  {
    ts: generateTimestamp(4, 15, 30),
    user: 'U007',
    text: 'Incident resolved. Total duration: 22 minutes. Will schedule postmortem.',
    channel: 'C006',
    thread_ts: generateTimestamp(4, 15, 0),
  },
  {
    ts: generateTimestamp(4, 15, 35),
    user: 'U003',
    text: 'Thanks team for the quick response! :pray:',
    channel: 'C006',
    thread_ts: generateTimestamp(4, 15, 0),
  },
  {
    ts: generateTimestamp(4, 15, 40),
    user: 'U007',
    text: 'Postmortem doc: https://docs.company.com/postmortem-2024-10-04',
    channel: 'C006',
    thread_ts: generateTimestamp(4, 15, 0),
  },

  {
    ts: generateTimestamp(7, 11, 0),
    user: 'U005',
    text: ':warning: Elevated error rate in staging environment (15% of requests)',
    channel: 'C006',
    reply_count: 3,
  },
  {
    ts: generateTimestamp(7, 11, 10),
    user: 'U002',
    text: 'I pushed a change this morning. Rolling it back now.',
    channel: 'C006',
    thread_ts: generateTimestamp(7, 11, 0),
  },
  {
    ts: generateTimestamp(7, 11, 20),
    user: 'U002',
    text: 'Rollback complete. Error rate back to 0.1%',
    channel: 'C006',
    thread_ts: generateTimestamp(7, 11, 0),
  },
  {
    ts: generateTimestamp(7, 11, 25),
    user: 'U005',
    text: 'Confirmed. All green now. Thanks!',
    channel: 'C006',
    thread_ts: generateTimestamp(7, 11, 0),
    reactions: [{ name: 'white_check_mark', count: 2, users: ['U002', 'U004'] }],
  },

  // Additional engineering discussions
  {
    ts: generateTimestamp(5, 14, 0),
    user: 'U001',
    text: 'Planning to migrate from PostgreSQL 13 to 15 next sprint. Any concerns?',
    channel: 'C002',
    reply_count: 6,
  },
  {
    ts: generateTimestamp(5, 14, 5),
    user: 'U004',
    text: 'We should test the migration on staging first. I can set that up.',
    channel: 'C002',
    thread_ts: generateTimestamp(5, 14, 0),
  },
  {
    ts: generateTimestamp(5, 14, 10),
    user: 'U008',
    text: 'Good idea. Also need to update our query performance benchmarks.',
    channel: 'C002',
    thread_ts: generateTimestamp(5, 14, 0),
  },
  {
    ts: generateTimestamp(5, 14, 20),
    user: 'U001',
    text: "I'll create a migration checklist and share it in the thread.",
    channel: 'C002',
    thread_ts: generateTimestamp(5, 14, 0),
  },
  {
    ts: generateTimestamp(5, 14, 35),
    user: 'U007',
    text: "Let's schedule a 30min planning meeting to discuss this. Wednesday work?",
    channel: 'C002',
    thread_ts: generateTimestamp(5, 14, 0),
  },
  {
    ts: generateTimestamp(5, 14, 40),
    user: 'U001',
    text: 'Wednesday at 2pm works for me.',
    channel: 'C002',
    thread_ts: generateTimestamp(5, 14, 0),
  },
  {
    ts: generateTimestamp(5, 14, 45),
    user: 'U004',
    text: "👍 I'll be there.",
    channel: 'C002',
    thread_ts: generateTimestamp(5, 14, 0),
  },

  {
    ts: generateTimestamp(6, 10, 30),
    user: 'U009',
    text: 'Security audit completed. Found 3 medium-priority issues. Report here: https://security.company.com/audit-oct-2024',
    channel: 'C002',
    reactions: [{ name: 'lock', count: 4, users: ['U001', 'U004', 'U007', 'U008'] }],
  },

  {
    ts: generateTimestamp(8, 15, 0),
    user: 'U002',
    text: 'New component library v2.0 is ready! Check out the Storybook: https://storybook.company.com',
    channel: 'C002',
    reactions: [
      { name: 'art', count: 5, users: ['U001', 'U003', 'U006', 'U007', 'U010'] },
      { name: 'rocket', count: 3, users: ['U001', 'U004', 'U006'] },
    ],
  },
];

// ============================================================================
// Mock Slack Server
// ============================================================================

class MockSlackServer {
  private server: Server;
  private messages: SlackMessage[];
  private channels: SlackChannel[];
  private users: SlackUser[];
  private messageCounter: number;

  constructor() {
    this.server = new Server(
      {
        name: 'mock-slack',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Initialize mock data
    this.channels = [...MOCK_CHANNELS];
    this.users = [...MOCK_USERS];
    this.messages = [...MOCK_MESSAGES];
    this.messageCounter = this.messages.length + 1;

    this.setupHandlers();
    console.error('[MockSlack] Server initialized with mock data');
    console.error(
      `[MockSlack] ${this.channels.length} channels, ${this.users.length} users, ${this.messages.length} messages`
    );
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools: Tool[] = [
        {
          name: 'slack_list_channels',
          description: 'List all channels in the Slack workspace',
          inputSchema: {
            type: 'object',
            properties: {
              types: {
                type: 'string',
                description:
                  'Filter by channel types (public_channel, private_channel). Default: all',
              },
            },
          },
        },
        {
          name: 'slack_post_message',
          description: 'Post a message to a Slack channel',
          inputSchema: {
            type: 'object',
            properties: {
              channel: {
                type: 'string',
                description: 'Channel ID or name (e.g., "general" or "C001")',
              },
              text: {
                type: 'string',
                description: 'Message text to post',
              },
            },
            required: ['channel', 'text'],
          },
        },
        {
          name: 'slack_get_channel_history',
          description: 'Retrieve recent messages from a channel',
          inputSchema: {
            type: 'object',
            properties: {
              channel: {
                type: 'string',
                description: 'Channel ID or name',
              },
              limit: {
                type: 'number',
                description: 'Number of messages to retrieve (default: 20, max: 100)',
              },
            },
            required: ['channel'],
          },
        },
        {
          name: 'slack_reply_to_thread',
          description: 'Reply to a message thread',
          inputSchema: {
            type: 'object',
            properties: {
              channel: {
                type: 'string',
                description: 'Channel ID or name',
              },
              thread_ts: {
                type: 'string',
                description: 'Timestamp of the parent message',
              },
              text: {
                type: 'string',
                description: 'Reply text',
              },
            },
            required: ['channel', 'thread_ts', 'text'],
          },
        },
        {
          name: 'slack_add_reaction',
          description: 'Add an emoji reaction to a message',
          inputSchema: {
            type: 'object',
            properties: {
              channel: {
                type: 'string',
                description: 'Channel ID or name',
              },
              timestamp: {
                type: 'string',
                description: 'Message timestamp',
              },
              emoji: {
                type: 'string',
                description: 'Emoji name without colons (e.g., "thumbsup", "rocket")',
              },
            },
            required: ['channel', 'timestamp', 'emoji'],
          },
        },
        {
          name: 'slack_get_users',
          description: 'List all users in the workspace',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'slack_search_messages',
          description: 'Search for messages across all channels',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Search query',
              },
              channel: {
                type: 'string',
                description: 'Optional: limit search to specific channel',
              },
            },
            required: ['query'],
          },
        },
        {
          name: 'slack_get_thread_replies',
          description: 'Get all replies in a message thread',
          inputSchema: {
            type: 'object',
            properties: {
              channel: {
                type: 'string',
                description: 'Channel ID or name',
              },
              thread_ts: {
                type: 'string',
                description: 'Thread timestamp',
              },
            },
            required: ['channel', 'thread_ts'],
          },
        },
      ];

      return { tools };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      switch (name) {
        case 'slack_list_channels':
          return this.listChannels(args);
        case 'slack_post_message':
          return this.postMessage(args);
        case 'slack_get_channel_history':
          return this.getChannelHistory(args);
        case 'slack_reply_to_thread':
          return this.replyToThread(args);
        case 'slack_add_reaction':
          return this.addReaction(args);
        case 'slack_get_users':
          return this.getUsers();
        case 'slack_search_messages':
          return this.searchMessages(args);
        case 'slack_get_thread_replies':
          return this.getThreadReplies(args);
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    });
  }

  private resolveChannel(channelIdOrName: string): SlackChannel | null {
    return (
      this.channels.find((c) => c.id === channelIdOrName || c.name === channelIdOrName) || null
    );
  }

  private getUserName(userId: string): string {
    return this.users.find((u) => u.id === userId)?.real_name || userId;
  }

  private listChannels(args: any) {
    console.error('[MockSlack] Listing channels');

    const channelList = this.channels.map((c) => ({
      id: c.id,
      name: c.name,
      is_private: c.is_private,
      topic: c.topic,
      purpose: c.purpose,
      member_count: c.member_count,
    }));

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ ok: true, channels: channelList }, null, 2),
        },
      ],
    };
  }

  private postMessage(args: any) {
    const { channel, text } = args;
    const resolvedChannel = this.resolveChannel(channel);

    if (!resolvedChannel) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ ok: false, error: 'channel_not_found' }, null, 2),
          },
        ],
      };
    }

    const ts = (Date.now() / 1000).toFixed(6);
    const newMessage: SlackMessage = {
      ts,
      user: 'U999', // Mock bot user
      text,
      channel: resolvedChannel.id,
    };

    this.messages.push(newMessage);
    console.error(`[MockSlack] Posted message to #${resolvedChannel.name}: "${text}"`);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            { ok: true, channel: resolvedChannel.id, ts, message: newMessage },
            null,
            2
          ),
        },
      ],
    };
  }

  private getChannelHistory(args: any) {
    const { channel, limit = 20 } = args;
    const resolvedChannel = this.resolveChannel(channel);

    if (!resolvedChannel) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ ok: false, error: 'channel_not_found' }, null, 2),
          },
        ],
      };
    }

    const channelMessages = this.messages
      .filter((m) => m.channel === resolvedChannel.id && !m.thread_ts)
      .sort((a, b) => parseFloat(b.ts) - parseFloat(a.ts))
      .slice(0, Math.min(limit, 100));

    const formattedMessages = channelMessages.map((m) => ({
      ...m,
      user_name: this.getUserName(m.user),
    }));

    console.error(
      `[MockSlack] Retrieved ${formattedMessages.length} messages from #${resolvedChannel.name}`
    );

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            { ok: true, messages: formattedMessages, channel: resolvedChannel.name },
            null,
            2
          ),
        },
      ],
    };
  }

  private replyToThread(args: any) {
    const { channel, thread_ts, text } = args;
    const resolvedChannel = this.resolveChannel(channel);

    if (!resolvedChannel) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ ok: false, error: 'channel_not_found' }, null, 2),
          },
        ],
      };
    }

    const parentMessage = this.messages.find(
      (m) => m.channel === resolvedChannel.id && m.ts === thread_ts
    );

    if (!parentMessage) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ ok: false, error: 'thread_not_found' }, null, 2),
          },
        ],
      };
    }

    const ts = (Date.now() / 1000).toFixed(6);
    const reply: SlackMessage = {
      ts,
      user: 'U999',
      text,
      channel: resolvedChannel.id,
      thread_ts,
    };

    this.messages.push(reply);

    // Update reply count
    if (parentMessage.reply_count !== undefined) {
      parentMessage.reply_count++;
    } else {
      parentMessage.reply_count = 1;
    }

    console.error(`[MockSlack] Posted reply to thread in #${resolvedChannel.name}`);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            { ok: true, channel: resolvedChannel.id, ts, message: reply },
            null,
            2
          ),
        },
      ],
    };
  }

  private addReaction(args: any) {
    const { channel, timestamp, emoji } = args;
    const resolvedChannel = this.resolveChannel(channel);

    if (!resolvedChannel) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ ok: false, error: 'channel_not_found' }, null, 2),
          },
        ],
      };
    }

    const message = this.messages.find(
      (m) => m.channel === resolvedChannel.id && m.ts === timestamp
    );

    if (!message) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ ok: false, error: 'message_not_found' }, null, 2),
          },
        ],
      };
    }

    if (!message.reactions) {
      message.reactions = [];
    }

    const existingReaction = message.reactions.find((r) => r.name === emoji);
    if (existingReaction) {
      existingReaction.count++;
      existingReaction.users.push('U999');
    } else {
      message.reactions.push({ name: emoji, count: 1, users: ['U999'] });
    }

    console.error(`[MockSlack] Added :${emoji}: reaction to message in #${resolvedChannel.name}`);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ ok: true }, null, 2),
        },
      ],
    };
  }

  private getUsers() {
    console.error('[MockSlack] Listing users');

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ ok: true, members: this.users }, null, 2),
        },
      ],
    };
  }

  private searchMessages(args: any) {
    const { query, channel } = args;
    let searchResults = this.messages;

    if (channel) {
      const resolvedChannel = this.resolveChannel(channel);
      if (resolvedChannel) {
        searchResults = searchResults.filter((m) => m.channel === resolvedChannel.id);
      }
    }

    const matches = searchResults
      .filter((m) => m.text.toLowerCase().includes(query.toLowerCase()))
      .sort((a, b) => parseFloat(b.ts) - parseFloat(a.ts))
      .slice(0, 20);

    const formattedMatches = matches.map((m) => {
      const channelName = this.channels.find((c) => c.id === m.channel)?.name || m.channel;
      return {
        ...m,
        user_name: this.getUserName(m.user),
        channel_name: channelName,
      };
    });

    console.error(`[MockSlack] Search for "${query}" found ${formattedMatches.length} results`);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ ok: true, matches: formattedMatches, query }, null, 2),
        },
      ],
    };
  }

  private getThreadReplies(args: any) {
    const { channel, thread_ts } = args;
    const resolvedChannel = this.resolveChannel(channel);

    if (!resolvedChannel) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ ok: false, error: 'channel_not_found' }, null, 2),
          },
        ],
      };
    }

    const parentMessage = this.messages.find(
      (m) => m.channel === resolvedChannel.id && m.ts === thread_ts
    );

    if (!parentMessage) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ ok: false, error: 'thread_not_found' }, null, 2),
          },
        ],
      };
    }

    const replies = this.messages
      .filter((m) => m.channel === resolvedChannel.id && m.thread_ts === thread_ts)
      .sort((a, b) => parseFloat(a.ts) - parseFloat(b.ts));

    const formattedReplies = [
      { ...parentMessage, user_name: this.getUserName(parentMessage.user) },
      ...replies.map((r) => ({ ...r, user_name: this.getUserName(r.user) })),
    ];

    console.error(
      `[MockSlack] Retrieved ${replies.length} replies from thread in #${resolvedChannel.name}`
    );

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ ok: true, messages: formattedReplies }, null, 2),
        },
      ],
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('[MockSlack] Server running on stdio');
  }
}

// ============================================================================
// Main
// ============================================================================

const server = new MockSlackServer();
server.run().catch(console.error);
