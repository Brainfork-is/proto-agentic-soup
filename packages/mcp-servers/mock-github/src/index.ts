#!/usr/bin/env node
/**
 * Mock GitHub MCP Server
 * Provides realistic GitHub workspace simulation for agent testing
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

interface GitHubUser {
  login: string;
  id: number;
  name: string;
  email: string;
  avatar_url: string;
}

interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  description: string;
  private: boolean;
  language: string;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  created_at: string;
  updated_at: string;
}

interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed';
  labels: string[];
  assignee: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  repository: string;
  comments: Array<{ user: string; body: string; created_at: string }>;
}

interface GitHubPR {
  id: number;
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed' | 'merged';
  head: string;
  base: string;
  created_at: string;
  updated_at: string;
  merged_at: string | null;
  repository: string;
  author: string;
  reviews: Array<{
    user: string;
    state: 'approved' | 'changes_requested' | 'commented';
    body: string;
  }>;
}

interface GitHubBranch {
  name: string;
  commit_sha: string;
  repository: string;
}

// ============================================================================
// Mock Data
// ============================================================================

const MOCK_USERS: GitHubUser[] = [
  {
    login: 'alice-chen',
    id: 1001,
    name: 'Alice Chen',
    email: 'alice@company.com',
    avatar_url: 'https://avatars.github.com/u/1001',
  },
  {
    login: 'bob-martinez',
    id: 1002,
    name: 'Bob Martinez',
    email: 'bob@company.com',
    avatar_url: 'https://avatars.github.com/u/1002',
  },
  {
    login: 'charlie-davis',
    id: 1003,
    name: 'Charlie Davis',
    email: 'charlie@company.com',
    avatar_url: 'https://avatars.github.com/u/1003',
  },
  {
    login: 'diana-wong',
    id: 1004,
    name: 'Diana Wong',
    email: 'diana@company.com',
    avatar_url: 'https://avatars.github.com/u/1004',
  },
  {
    login: 'eric-thompson',
    id: 1005,
    name: 'Eric Thompson',
    email: 'eric@company.com',
    avatar_url: 'https://avatars.github.com/u/1005',
  },
];

const MOCK_REPOS: GitHubRepo[] = [
  {
    id: 2001,
    name: 'api-gateway',
    full_name: 'company/api-gateway',
    description: 'Central API gateway service for microservices architecture',
    private: true,
    language: 'TypeScript',
    stargazers_count: 23,
    forks_count: 5,
    open_issues_count: 8,
    created_at: '2023-01-15T10:00:00Z',
    updated_at: '2024-10-08T14:30:00Z',
  },
  {
    id: 2002,
    name: 'frontend-app',
    full_name: 'company/frontend-app',
    description: 'React-based frontend application',
    private: true,
    language: 'TypeScript',
    stargazers_count: 45,
    forks_count: 12,
    open_issues_count: 15,
    created_at: '2023-02-01T09:00:00Z',
    updated_at: '2024-10-08T16:20:00Z',
  },
  {
    id: 2003,
    name: 'data-pipeline',
    full_name: 'company/data-pipeline',
    description: 'ETL pipeline for data processing and analytics',
    private: true,
    language: 'Python',
    stargazers_count: 18,
    forks_count: 4,
    open_issues_count: 6,
    created_at: '2023-03-10T11:00:00Z',
    updated_at: '2024-10-07T10:15:00Z',
  },
  {
    id: 2004,
    name: 'mobile-app',
    full_name: 'company/mobile-app',
    description: 'React Native mobile application for iOS and Android',
    private: true,
    language: 'TypeScript',
    stargazers_count: 32,
    forks_count: 8,
    open_issues_count: 12,
    created_at: '2023-04-20T08:30:00Z',
    updated_at: '2024-10-08T12:00:00Z',
  },
  {
    id: 2005,
    name: 'auth-service',
    full_name: 'company/auth-service',
    description: 'Authentication and authorization microservice',
    private: true,
    language: 'Go',
    stargazers_count: 27,
    forks_count: 6,
    open_issues_count: 4,
    created_at: '2023-01-20T14:00:00Z',
    updated_at: '2024-10-06T15:45:00Z',
  },
  {
    id: 2006,
    name: 'payment-service',
    full_name: 'company/payment-service',
    description: 'Payment processing service with Stripe integration',
    private: true,
    language: 'Java',
    stargazers_count: 15,
    forks_count: 3,
    open_issues_count: 7,
    created_at: '2023-05-15T10:00:00Z',
    updated_at: '2024-10-08T09:30:00Z',
  },
  {
    id: 2007,
    name: 'notification-service',
    full_name: 'company/notification-service',
    description: 'Multi-channel notification service (email, SMS, push)',
    private: true,
    language: 'Node.js',
    stargazers_count: 21,
    forks_count: 5,
    open_issues_count: 5,
    created_at: '2023-02-28T13:00:00Z',
    updated_at: '2024-10-07T17:00:00Z',
  },
  {
    id: 2008,
    name: 'database-migrations',
    full_name: 'company/database-migrations',
    description: 'Centralized database migration scripts',
    private: true,
    language: 'SQL',
    stargazers_count: 8,
    forks_count: 2,
    open_issues_count: 2,
    created_at: '2023-01-10T09:00:00Z',
    updated_at: '2024-10-05T11:00:00Z',
  },
  {
    id: 2009,
    name: 'infrastructure',
    full_name: 'company/infrastructure',
    description: 'Terraform and Kubernetes infrastructure as code',
    private: true,
    language: 'HCL',
    stargazers_count: 19,
    forks_count: 4,
    open_issues_count: 9,
    created_at: '2023-01-25T10:30:00Z',
    updated_at: '2024-10-08T08:15:00Z',
  },
  {
    id: 2010,
    name: 'monitoring',
    full_name: 'company/monitoring',
    description: 'Grafana dashboards and Prometheus alerts',
    private: true,
    language: 'YAML',
    stargazers_count: 14,
    forks_count: 3,
    open_issues_count: 3,
    created_at: '2023-03-05T12:00:00Z',
    updated_at: '2024-10-07T14:30:00Z',
  },
  {
    id: 2011,
    name: 'docs',
    full_name: 'company/docs',
    description: 'Technical documentation and runbooks',
    private: false,
    language: 'Markdown',
    stargazers_count: 42,
    forks_count: 15,
    open_issues_count: 11,
    created_at: '2023-01-05T08:00:00Z',
    updated_at: '2024-10-08T15:00:00Z',
  },
  {
    id: 2012,
    name: 'design-system',
    full_name: 'company/design-system',
    description: 'Component library and design tokens',
    private: false,
    language: 'TypeScript',
    stargazers_count: 67,
    forks_count: 18,
    open_issues_count: 14,
    created_at: '2023-04-01T10:00:00Z',
    updated_at: '2024-10-08T13:45:00Z',
  },
  {
    id: 2013,
    name: 'analytics-service',
    full_name: 'company/analytics-service',
    description: 'Real-time analytics and metrics aggregation',
    private: true,
    language: 'Python',
    stargazers_count: 25,
    forks_count: 7,
    open_issues_count: 8,
    created_at: '2023-06-10T11:30:00Z',
    updated_at: '2024-10-08T10:20:00Z',
  },
  {
    id: 2014,
    name: 'search-service',
    full_name: 'company/search-service',
    description: 'Elasticsearch-based search microservice',
    private: true,
    language: 'Go',
    stargazers_count: 16,
    forks_count: 4,
    open_issues_count: 6,
    created_at: '2023-07-20T09:00:00Z',
    updated_at: '2024-10-06T16:00:00Z',
  },
  {
    id: 2015,
    name: 'ml-models',
    full_name: 'company/ml-models',
    description: 'Machine learning models and training pipelines',
    private: true,
    language: 'Python',
    stargazers_count: 31,
    forks_count: 9,
    open_issues_count: 10,
    created_at: '2023-08-15T10:00:00Z',
    updated_at: '2024-10-08T11:30:00Z',
  },
  {
    id: 2016,
    name: 'api-client-sdk',
    full_name: 'company/api-client-sdk',
    description: 'TypeScript SDK for API integration',
    private: false,
    language: 'TypeScript',
    stargazers_count: 89,
    forks_count: 22,
    open_issues_count: 13,
    created_at: '2023-03-20T14:00:00Z',
    updated_at: '2024-10-08T14:00:00Z',
  },
  {
    id: 2017,
    name: 'security-tools',
    full_name: 'company/security-tools',
    description: 'Security scanning and vulnerability management tools',
    private: true,
    language: 'Python',
    stargazers_count: 12,
    forks_count: 2,
    open_issues_count: 4,
    created_at: '2023-09-01T08:30:00Z',
    updated_at: '2024-10-07T09:00:00Z',
  },
  {
    id: 2018,
    name: 'ci-cd-pipelines',
    full_name: 'company/ci-cd-pipelines',
    description: 'GitHub Actions and deployment workflows',
    private: true,
    language: 'YAML',
    stargazers_count: 17,
    forks_count: 4,
    open_issues_count: 5,
    created_at: '2023-02-15T11:00:00Z',
    updated_at: '2024-10-08T07:30:00Z',
  },
  {
    id: 2019,
    name: 'backup-service',
    full_name: 'company/backup-service',
    description: 'Automated backup and disaster recovery service',
    private: true,
    language: 'Go',
    stargazers_count: 9,
    forks_count: 2,
    open_issues_count: 3,
    created_at: '2023-10-05T10:00:00Z',
    updated_at: '2024-10-05T15:00:00Z',
  },
  {
    id: 2020,
    name: 'rate-limiter',
    full_name: 'company/rate-limiter',
    description: 'Distributed rate limiting middleware',
    private: true,
    language: 'Rust',
    stargazers_count: 34,
    forks_count: 7,
    open_issues_count: 7,
    created_at: '2023-11-10T09:30:00Z',
    updated_at: '2024-10-08T16:45:00Z',
  },
];

const MOCK_ISSUES: GitHubIssue[] = [
  // api-gateway issues
  {
    id: 3001,
    number: 89,
    title: 'Memory leak in cache invalidation',
    body: 'After prolonged usage, the cache invalidation worker appears to accumulate memory. Heap size grows from 200MB to 2GB over 48 hours.\n\nSteps to reproduce:\n1. Start the gateway\n2. Run load test for 48 hours\n3. Monitor memory usage\n\nExpected: Memory should stabilize\nActual: Continuous growth leading to OOM',
    state: 'open',
    labels: ['bug', 'priority:high', 'performance'],
    assignee: 'alice-chen',
    created_at: '2024-10-06T10:30:00Z',
    updated_at: '2024-10-08T09:15:00Z',
    closed_at: null,
    repository: 'api-gateway',
    comments: [
      {
        user: 'alice-chen',
        body: 'I can reproduce this. Looking at heap dumps now.',
        created_at: '2024-10-06T14:20:00Z',
      },
      {
        user: 'diana-wong',
        body: 'Might be related to the Redis connection pool not releasing connections properly.',
        created_at: '2024-10-07T11:00:00Z',
      },
    ],
  },
  {
    id: 3002,
    number: 142,
    title: 'Add rate limiting to API endpoints',
    body: 'We need to implement rate limiting to prevent abuse. Requirements:\n\n- Per-user rate limits (1000 req/hour)\n- Per-IP rate limits for unauthenticated requests (100 req/hour)\n- Custom limits for enterprise customers\n- Return 429 with Retry-After header\n\nRelated: #89',
    state: 'open',
    labels: ['enhancement', 'priority:medium', 'security'],
    assignee: 'bob-martinez',
    created_at: '2024-10-02T09:00:00Z',
    updated_at: '2024-10-08T11:30:00Z',
    closed_at: null,
    repository: 'api-gateway',
    comments: [
      {
        user: 'charlie-davis',
        body: 'This is critical for our enterprise launch. Can we prioritize?',
        created_at: '2024-10-03T10:15:00Z',
      },
      {
        user: 'bob-martinez',
        body: 'Starting work on this today. ETA: end of week.',
        created_at: '2024-10-07T09:30:00Z',
      },
    ],
  },
  {
    id: 3003,
    number: 156,
    title: 'CORS headers not set for OPTIONS requests',
    body: 'Preflight OPTIONS requests are failing with CORS errors in production.\n\nError:\n```\nAccess-Control-Allow-Origin header is missing\n```\n\nThis is blocking the frontend from making API calls.',
    state: 'closed',
    labels: ['bug', 'priority:critical'],
    assignee: null,
    created_at: '2024-10-01T15:30:00Z',
    updated_at: '2024-10-01T17:00:00Z',
    closed_at: '2024-10-01T17:00:00Z',
    repository: 'api-gateway',
    comments: [
      {
        user: 'alice-chen',
        body: 'Fixed in commit abc123. Deploying now.',
        created_at: '2024-10-01T16:45:00Z',
      },
    ],
  },

  // frontend-app issues
  {
    id: 3004,
    number: 234,
    title: 'Implement dark mode support',
    body: 'Users have requested dark mode. This should:\n\n- Use system preference by default\n- Allow manual toggle\n- Persist user preference\n- Apply to all components\n\nDesign mockups: [link]',
    state: 'open',
    labels: ['enhancement', 'ui/ux', 'priority:low'],
    assignee: 'bob-martinez',
    created_at: '2024-09-20T10:00:00Z',
    updated_at: '2024-10-05T14:30:00Z',
    closed_at: null,
    repository: 'frontend-app',
    comments: [
      {
        user: 'bob-martinez',
        body: 'Working on this using CSS custom properties. Should be straightforward.',
        created_at: '2024-09-21T09:00:00Z',
      },
    ],
  },
  {
    id: 3005,
    number: 267,
    title: 'Form validation errors not displaying',
    body: 'When form submission fails validation, error messages are not shown to the user.\n\nAffected forms:\n- Login form\n- Registration form\n- Profile settings\n\nSteps to reproduce:\n1. Fill form with invalid data\n2. Submit\n3. No errors shown',
    state: 'open',
    labels: ['bug', 'priority:high'],
    assignee: 'bob-martinez',
    created_at: '2024-10-07T13:20:00Z',
    updated_at: '2024-10-08T10:00:00Z',
    closed_at: null,
    repository: 'frontend-app',
    comments: [
      {
        user: 'eric-thompson',
        body: 'I found this during QA testing. Critical for user experience.',
        created_at: '2024-10-07T14:00:00Z',
      },
    ],
  },
  {
    id: 3006,
    number: 289,
    title: 'Bundle size too large - investigate code splitting',
    body: 'Main bundle is 2.3MB gzipped. We need to:\n\n- Implement route-based code splitting\n- Lazy load heavy dependencies\n- Analyze bundle with webpack-bundle-analyzer\n- Target: < 500KB initial bundle',
    state: 'open',
    labels: ['performance', 'priority:medium'],
    assignee: null,
    created_at: '2024-10-05T11:00:00Z',
    updated_at: '2024-10-06T09:30:00Z',
    closed_at: null,
    repository: 'frontend-app',
    comments: [],
  },

  // data-pipeline issues
  {
    id: 3007,
    number: 45,
    title: 'ETL job failing for large datasets',
    body: 'The nightly ETL job is timing out when processing datasets > 100GB.\n\nError:\n```\nTimeout after 4 hours\nProcessed 45% of records\n```\n\nNeed to:\n- Optimize query performance\n- Implement incremental processing\n- Add checkpointing for resume capability',
    state: 'open',
    labels: ['bug', 'priority:high', 'performance'],
    assignee: 'alice-chen',
    created_at: '2024-10-04T08:00:00Z',
    updated_at: '2024-10-08T07:30:00Z',
    closed_at: null,
    repository: 'data-pipeline',
    comments: [
      {
        user: 'alice-chen',
        body: 'Looking into using Spark for parallel processing.',
        created_at: '2024-10-05T10:00:00Z',
      },
    ],
  },

  // mobile-app issues
  {
    id: 3008,
    number: 112,
    title: 'iOS app crashes on startup for iOS 16.x',
    body: 'Users on iOS 16.x are reporting crashes immediately after app launch.\n\nCrash log shows:\n```\nEXC_BAD_ACCESS at AsyncStorage.init()\n```\n\nAffects ~15% of iOS users.',
    state: 'open',
    labels: ['bug', 'priority:critical', 'ios'],
    assignee: 'bob-martinez',
    created_at: '2024-10-07T16:00:00Z',
    updated_at: '2024-10-08T14:00:00Z',
    closed_at: null,
    repository: 'mobile-app',
    comments: [
      {
        user: 'eric-thompson',
        body: 'Can reproduce on iPhone 12 with iOS 16.4.1',
        created_at: '2024-10-07T17:30:00Z',
      },
      {
        user: 'bob-martinez',
        body: 'Downgrading AsyncStorage to previous version fixes it. Will investigate.',
        created_at: '2024-10-08T09:00:00Z',
      },
    ],
  },
  {
    id: 3009,
    number: 134,
    title: 'Add biometric authentication support',
    body: 'Support Face ID / Touch ID for login:\n\n- Store encrypted credentials in keychain\n- Fallback to PIN if biometric fails\n- Allow opt-out in settings\n\nSecurity review required.',
    state: 'open',
    labels: ['enhancement', 'security', 'priority:medium'],
    assignee: null,
    created_at: '2024-09-28T10:30:00Z',
    updated_at: '2024-10-02T11:00:00Z',
    closed_at: null,
    repository: 'mobile-app',
    comments: [],
  },

  // auth-service issues
  {
    id: 3010,
    number: 67,
    title: 'Add OAuth2 provider support (Google, GitHub)',
    body: 'Enable social login with:\n\n- Google OAuth2\n- GitHub OAuth2\n- Microsoft OAuth2\n\nRequirements:\n- Link existing accounts\n- Handle email conflicts\n- Proper error messages',
    state: 'open',
    labels: ['enhancement', 'priority:high'],
    assignee: 'alice-chen',
    created_at: '2024-09-15T09:00:00Z',
    updated_at: '2024-10-08T10:30:00Z',
    closed_at: null,
    repository: 'auth-service',
    comments: [
      {
        user: 'charlie-davis',
        body: 'This is a top customer request. Can we ship in Q4?',
        created_at: '2024-09-20T14:00:00Z',
      },
      {
        user: 'alice-chen',
        body: 'Working on Google OAuth first. GitHub and Microsoft to follow.',
        created_at: '2024-10-01T10:00:00Z',
      },
    ],
  },
  {
    id: 3011,
    number: 78,
    title: 'Session tokens not expiring correctly',
    body: 'Users report staying logged in despite token expiration time.\n\nConfig says 7 days, but tokens work for 30+ days.\n\nSecurity issue - needs immediate fix.',
    state: 'open',
    labels: ['bug', 'priority:critical', 'security'],
    assignee: 'alice-chen',
    created_at: '2024-10-06T15:00:00Z',
    updated_at: '2024-10-08T08:00:00Z',
    closed_at: null,
    repository: 'auth-service',
    comments: [
      {
        user: 'diana-wong',
        body: 'Redis TTL not being set correctly. Investigating.',
        created_at: '2024-10-07T09:00:00Z',
      },
    ],
  },

  // payment-service issues
  {
    id: 3012,
    number: 34,
    title: 'Stripe webhook signature verification failing',
    body: 'Webhook events from Stripe are being rejected due to signature mismatch.\n\nError:\n```\nInvalid signature for webhook payload\n```\n\nPayment confirmations not processing.',
    state: 'open',
    labels: ['bug', 'priority:critical'],
    assignee: 'diana-wong',
    created_at: '2024-10-08T11:00:00Z',
    updated_at: '2024-10-08T15:30:00Z',
    closed_at: null,
    repository: 'payment-service',
    comments: [
      {
        user: 'diana-wong',
        body: 'Environment variable for webhook secret was rotated but not updated. Fixing now.',
        created_at: '2024-10-08T11:45:00Z',
      },
    ],
  },

  // infrastructure issues
  {
    id: 3013,
    number: 56,
    title: 'Kubernetes pods failing readiness checks',
    body: 'Random pods failing readiness checks and being restarted:\n\n```\nReadiness probe failed: Get http://pod:8080/health timeout\n```\n\nHappens 2-3 times per day across different services.',
    state: 'open',
    labels: ['bug', 'devops', 'priority:medium'],
    assignee: 'diana-wong',
    created_at: '2024-10-03T14:00:00Z',
    updated_at: '2024-10-07T16:00:00Z',
    closed_at: null,
    repository: 'infrastructure',
    comments: [
      {
        user: 'diana-wong',
        body: 'Increasing readiness probe timeout from 1s to 5s. Network latency might be the issue.',
        created_at: '2024-10-04T10:00:00Z',
      },
    ],
  },

  // docs issues
  {
    id: 3014,
    number: 89,
    title: 'API documentation out of date',
    body: 'Several endpoints missing from API docs:\n\n- POST /api/v2/users/bulk\n- GET /api/v2/analytics/metrics\n- PUT /api/v2/settings/preferences\n\nNeed to update OpenAPI spec.',
    state: 'open',
    labels: ['documentation', 'priority:medium'],
    assignee: null,
    created_at: '2024-10-01T10:00:00Z',
    updated_at: '2024-10-05T09:00:00Z',
    closed_at: null,
    repository: 'docs',
    comments: [],
  },

  // design-system issues
  {
    id: 3015,
    number: 67,
    title: 'Button component accessibility issues',
    body: 'Buttons fail WCAG 2.1 AA compliance:\n\n- Missing focus indicators\n- Insufficient color contrast (3.2:1, need 4.5:1)\n- No aria-label for icon buttons\n\nSeverity: Blocks enterprise customers.',
    state: 'open',
    labels: ['bug', 'accessibility', 'priority:high'],
    assignee: 'bob-martinez',
    created_at: '2024-10-05T11:30:00Z',
    updated_at: '2024-10-08T13:00:00Z',
    closed_at: null,
    repository: 'design-system',
    comments: [
      {
        user: 'bob-martinez',
        body: 'Working on fixes. Will have PR ready tomorrow.',
        created_at: '2024-10-07T15:00:00Z',
      },
    ],
  },

  // analytics-service issues
  {
    id: 3016,
    number: 23,
    title: 'Dashboard query timeout for large date ranges',
    body: 'Queries for > 90 days of data are timing out.\n\nNeed to:\n- Add query result caching\n- Pre-aggregate daily/weekly metrics\n- Implement pagination',
    state: 'open',
    labels: ['performance', 'priority:medium'],
    assignee: 'alice-chen',
    created_at: '2024-10-02T09:30:00Z',
    updated_at: '2024-10-06T14:00:00Z',
    closed_at: null,
    repository: 'analytics-service',
    comments: [],
  },

  // ml-models issues
  {
    id: 3017,
    number: 45,
    title: 'Model inference latency increased to 2.5s',
    body: 'Recommendation model latency jumped from 300ms to 2.5s after last deployment.\n\nInvestigating:\n- Model size increase?\n- Input preprocessing bottleneck?\n- GPU utilization?\n\nTarget: < 500ms p99',
    state: 'open',
    labels: ['bug', 'performance', 'priority:high'],
    assignee: null,
    created_at: '2024-10-07T10:00:00Z',
    updated_at: '2024-10-08T09:00:00Z',
    closed_at: null,
    repository: 'ml-models',
    comments: [
      {
        user: 'alice-chen',
        body: 'Model was accidentally deployed without quantization. Rolling back.',
        created_at: '2024-10-07T14:30:00Z',
      },
    ],
  },

  // api-client-sdk issues
  {
    id: 3018,
    number: 78,
    title: 'TypeScript types incorrect for paginated responses',
    body: 'The `PaginatedResponse<T>` type is missing `next_page` field.\n\n```typescript\n// Current\ninterface PaginatedResponse<T> {\n  data: T[];\n  total: number;\n}\n\n// Should be\ninterface PaginatedResponse<T> {\n  data: T[];\n  total: number;\n  next_page: string | null;\n  prev_page: string | null;\n}\n```',
    state: 'open',
    labels: ['bug', 'typescript', 'priority:low'],
    assignee: 'bob-martinez',
    created_at: '2024-09-28T11:00:00Z',
    updated_at: '2024-10-03T10:00:00Z',
    closed_at: null,
    repository: 'api-client-sdk',
    comments: [],
  },

  // security-tools issues
  {
    id: 3019,
    number: 12,
    title: 'Add automated dependency scanning',
    body: 'Implement automated scanning for vulnerable dependencies:\n\n- Run daily scans\n- Create issues for critical/high severity\n- Integrate with Dependabot\n- Generate security reports',
    state: 'open',
    labels: ['enhancement', 'security', 'priority:high'],
    assignee: 'diana-wong',
    created_at: '2024-10-01T08:00:00Z',
    updated_at: '2024-10-07T12:00:00Z',
    closed_at: null,
    repository: 'security-tools',
    comments: [],
  },

  // rate-limiter issues
  {
    id: 3020,
    number: 23,
    title: 'Rate limit counters not resetting correctly',
    body: 'Rate limit counters persist beyond the window duration.\n\nExample:\n- User hits rate limit at 10:00\n- Counter should reset at 11:00\n- User still rate limited at 11:05\n\nRedis TTL issue?',
    state: 'open',
    labels: ['bug', 'priority:high'],
    assignee: 'alice-chen',
    created_at: '2024-10-06T13:00:00Z',
    updated_at: '2024-10-08T12:00:00Z',
    closed_at: null,
    repository: 'rate-limiter',
    comments: [
      {
        user: 'alice-chen',
        body: 'Fixed in #24. Using sliding window algorithm now instead of fixed window.',
        created_at: '2024-10-08T10:00:00Z',
      },
    ],
  },
];

const MOCK_PRS: GitHubPR[] = [
  {
    id: 4001,
    number: 142,
    title: 'Add rate limiting to API endpoints',
    body: 'Implements rate limiting using Redis-backed sliding window algorithm.\n\n## Changes\n- Add rate limiter middleware\n- Configure per-user and per-IP limits\n- Add 429 response handling\n- Update API docs\n\n## Testing\n- Unit tests for rate limiter\n- Integration tests with Redis\n- Load testing with 10k req/s\n\nFixes #142',
    state: 'open',
    head: 'feature/rate-limiting',
    base: 'main',
    created_at: '2024-10-07T10:00:00Z',
    updated_at: '2024-10-08T15:00:00Z',
    merged_at: null,
    repository: 'api-gateway',
    author: 'bob-martinez',
    reviews: [
      {
        user: 'alice-chen',
        state: 'approved',
        body: 'LGTM! Nice implementation. Just one minor suggestion about error handling.',
      },
    ],
  },
  {
    id: 4002,
    number: 158,
    title: 'Fix memory leak in cache invalidation',
    body: 'Resolves memory leak caused by event emitter not cleaning up listeners.\n\n## Root Cause\nCache invalidation events were registering listeners but never removing them.\n\n## Fix\n- Use `once()` instead of `on()` for single-use listeners\n- Add cleanup in worker shutdown\n- Add memory usage monitoring\n\n## Results\nMemory stable at 300MB after 72 hours of load testing.\n\nFixes #89',
    state: 'open',
    head: 'fix/cache-memory-leak',
    base: 'main',
    created_at: '2024-10-08T09:00:00Z',
    updated_at: '2024-10-08T14:30:00Z',
    merged_at: null,
    repository: 'api-gateway',
    author: 'alice-chen',
    reviews: [
      {
        user: 'diana-wong',
        state: 'approved',
        body: 'Excellent fix! Memory usage looks much better now.',
      },
      {
        user: 'bob-martinez',
        state: 'approved',
        body: '+1',
      },
    ],
  },
  {
    id: 4003,
    number: 271,
    title: 'Implement dark mode with CSS custom properties',
    body: 'Adds dark mode support across the application.\n\n## Implementation\n- CSS custom properties for theming\n- System preference detection\n- Manual toggle in settings\n- Persistence in localStorage\n\n## Components Updated\n- All 47 components\n- Navigation bar\n- Modals and dialogs\n- Forms and inputs\n\n## Screenshots\n[Dark mode preview]\n\nFixes #234',
    state: 'open',
    head: 'feature/dark-mode',
    base: 'main',
    created_at: '2024-10-05T11:00:00Z',
    updated_at: '2024-10-08T13:00:00Z',
    merged_at: null,
    repository: 'frontend-app',
    author: 'bob-martinez',
    reviews: [
      {
        user: 'charlie-davis',
        state: 'commented',
        body: 'Looks great! Can we also add dark mode to the loading screens?',
      },
    ],
  },
  {
    id: 4004,
    number: 270,
    title: 'Fix form validation error display',
    body: "Fixes bug where validation errors weren't showing.\n\n## Bug\nError state wasn't being passed to FormField components.\n\n## Fix\n- Update FormContext to include error state\n- Fix FormField to display errors\n- Add error styling\n\n## Testing\nManual testing on all forms. Added unit tests.\n\nFixes #267",
    state: 'merged',
    head: 'fix/form-validation-errors',
    base: 'main',
    created_at: '2024-10-07T14:00:00Z',
    updated_at: '2024-10-08T10:00:00Z',
    merged_at: '2024-10-08T10:00:00Z',
    repository: 'frontend-app',
    author: 'bob-martinez',
    reviews: [
      {
        user: 'eric-thompson',
        state: 'approved',
        body: 'Confirmed fixed! Tested on all forms.',
      },
      {
        user: 'alice-chen',
        state: 'approved',
        body: 'Great fix!',
      },
    ],
  },
  {
    id: 4005,
    number: 47,
    title: 'Optimize ETL with incremental processing',
    body: 'Implements incremental ETL processing for large datasets.\n\n## Changes\n- Add checkpointing system\n- Process in 10GB chunks\n- Resume from last checkpoint on failure\n- Parallel processing with Spark\n\n## Performance\n- Before: 4+ hours, often timeout\n- After: 90 minutes for 100GB\n\nFixes #45',
    state: 'open',
    head: 'feature/incremental-etl',
    base: 'main',
    created_at: '2024-10-06T09:00:00Z',
    updated_at: '2024-10-08T08:00:00Z',
    merged_at: null,
    repository: 'data-pipeline',
    author: 'alice-chen',
    reviews: [],
  },
  {
    id: 4006,
    number: 137,
    title: 'Fix iOS 16.x crash on startup',
    body: 'Fixes crash caused by AsyncStorage incompatibility.\n\n## Root Cause\nAsyncStorage 1.19.0 has breaking changes for iOS 16.x\n\n## Fix\n- Downgrade to AsyncStorage 1.18.2\n- Add migration helper for existing data\n- Update CocoaPods\n\n## Testing\nTested on:\n- iPhone 12 (iOS 16.4.1) ✓\n- iPhone 14 (iOS 17.0) ✓\n- iPhone XR (iOS 16.2) ✓\n\nFixes #112',
    state: 'open',
    head: 'fix/ios-16-crash',
    base: 'main',
    created_at: '2024-10-08T10:00:00Z',
    updated_at: '2024-10-08T15:30:00Z',
    merged_at: null,
    repository: 'mobile-app',
    author: 'bob-martinez',
    reviews: [
      {
        user: 'eric-thompson',
        state: 'approved',
        body: 'Tested on my iPhone 12. No longer crashes!',
      },
    ],
  },
  {
    id: 4007,
    number: 81,
    title: 'Implement Google OAuth2 provider',
    body: 'Adds Google OAuth2 as login method.\n\n## Features\n- Google OAuth2 flow\n- Account linking for existing users\n- Email conflict resolution\n- Profile data sync\n\n## Security\n- State parameter for CSRF protection\n- Token encryption at rest\n- Secure cookie handling\n\nPart of #67',
    state: 'open',
    head: 'feature/google-oauth',
    base: 'main',
    created_at: '2024-10-03T10:00:00Z',
    updated_at: '2024-10-08T11:00:00Z',
    merged_at: null,
    repository: 'auth-service',
    author: 'alice-chen',
    reviews: [
      {
        user: 'diana-wong',
        state: 'changes_requested',
        body: 'Security review: Need to add rate limiting to OAuth callback endpoint.',
      },
    ],
  },
  {
    id: 4008,
    number: 82,
    title: 'Fix session token TTL in Redis',
    body: 'Corrects Redis TTL setting for session tokens.\n\n## Bug\nTTL was being set in milliseconds instead of seconds.\n\n## Fix\n```go\n// Before\nredis.Set(key, value, 7*24*60*60*1000) // Wrong!\n\n// After\nredis.Set(key, value, 7*24*60*60) // Correct: 7 days in seconds\n```\n\n## Testing\nConfirmed tokens expire after exactly 7 days.\n\nFixes #78',
    state: 'merged',
    head: 'fix/session-token-expiry',
    base: 'main',
    created_at: '2024-10-07T10:00:00Z',
    updated_at: '2024-10-07T16:00:00Z',
    merged_at: '2024-10-07T16:00:00Z',
    repository: 'auth-service',
    author: 'diana-wong',
    reviews: [
      {
        user: 'alice-chen',
        state: 'approved',
        body: 'Nice catch! This was a critical security issue.',
      },
    ],
  },
  {
    id: 4009,
    number: 71,
    title: 'Fix button accessibility issues',
    body: 'Improves button component WCAG 2.1 compliance.\n\n## Changes\n- Add focus indicators (2px outline)\n- Increase color contrast to 4.5:1\n- Add aria-label to icon buttons\n- Add keyboard navigation tests\n\n## Testing\n- Lighthouse accessibility score: 85 → 98\n- All WCAG 2.1 AA criteria met\n\nFixes #67',
    state: 'open',
    head: 'fix/button-a11y',
    base: 'main',
    created_at: '2024-10-08T09:00:00Z',
    updated_at: '2024-10-08T14:00:00Z',
    merged_at: null,
    repository: 'design-system',
    author: 'bob-martinez',
    reviews: [],
  },
  {
    id: 4010,
    number: 24,
    title: 'Implement sliding window rate limiting',
    body: 'Replaces fixed window with sliding window algorithm.\n\n## Benefits\n- More accurate rate limiting\n- No burst at window boundaries\n- Better user experience\n\n## Implementation\n- Redis sorted sets for timestamps\n- Cleanup of old entries\n- Configurable window size\n\n## Performance\n- < 1ms per check\n- Tested up to 100k req/s\n\nFixes #23',
    state: 'open',
    head: 'feature/sliding-window',
    base: 'main',
    created_at: '2024-10-08T11:00:00Z',
    updated_at: '2024-10-08T16:00:00Z',
    merged_at: null,
    repository: 'rate-limiter',
    author: 'alice-chen',
    reviews: [
      {
        user: 'diana-wong',
        state: 'approved',
        body: 'Excellent implementation! Much better than the old approach.',
      },
    ],
  },
  {
    id: 4011,
    number: 59,
    title: 'Update Kubernetes resource limits',
    body: 'Adjusts resource limits based on production metrics.\n\n## Changes\n- API Gateway: 1GB → 2GB memory\n- Auth Service: 512MB → 1GB memory\n- Increase readiness probe timeout: 1s → 5s\n\n## Rationale\nProduction metrics show frequent OOM kills and timeout failures.\n\nPart of #56',
    state: 'merged',
    head: 'chore/update-k8s-limits',
    base: 'main',
    created_at: '2024-10-05T10:00:00Z',
    updated_at: '2024-10-05T15:00:00Z',
    merged_at: '2024-10-05T15:00:00Z',
    repository: 'infrastructure',
    author: 'diana-wong',
    reviews: [
      {
        user: 'alice-chen',
        state: 'approved',
        body: "Good call. We've seen much fewer restarts since this deployed.",
      },
    ],
  },
  {
    id: 4012,
    number: 13,
    title: 'Add automated dependency scanning with Snyk',
    body: 'Implements automated security scanning for dependencies.\n\n## Features\n- Daily scans across all repos\n- Auto-create issues for critical/high severity\n- Slack notifications\n- Weekly security reports\n\n## Integration\n- GitHub Actions workflow\n- Snyk API integration\n- Custom severity thresholds\n\nFixes #12',
    state: 'open',
    head: 'feature/dependency-scanning',
    base: 'main',
    created_at: '2024-10-06T09:00:00Z',
    updated_at: '2024-10-08T12:00:00Z',
    merged_at: null,
    repository: 'security-tools',
    author: 'diana-wong',
    reviews: [],
  },
];

const MOCK_BRANCHES: GitHubBranch[] = [
  { name: 'main', commit_sha: 'a1b2c3d4', repository: 'api-gateway' },
  { name: 'feature/rate-limiting', commit_sha: 'e5f6g7h8', repository: 'api-gateway' },
  { name: 'fix/cache-memory-leak', commit_sha: 'i9j0k1l2', repository: 'api-gateway' },
  { name: 'main', commit_sha: 'm3n4o5p6', repository: 'frontend-app' },
  { name: 'feature/dark-mode', commit_sha: 'q7r8s9t0', repository: 'frontend-app' },
  { name: 'main', commit_sha: 'u1v2w3x4', repository: 'auth-service' },
  { name: 'feature/google-oauth', commit_sha: 'y5z6a7b8', repository: 'auth-service' },
];

const CODE_SNIPPETS = {
  'api-gateway': `
// src/middleware/rateLimiter.ts
import { RateLimiterRedis } from 'rate-limiter-flexible';

export const rateLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  points: 1000, // requests
  duration: 3600, // per hour
});

export async function rateLimitMiddleware(req, res, next) {
  try {
    const key = req.user?.id || req.ip;
    await rateLimiter.consume(key);
    next();
  } catch (err) {
    res.status(429).json({ error: 'Too many requests' });
  }
}`,
  'frontend-app': `
// src/hooks/useDarkMode.ts
export function useDarkMode() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const saved = localStorage.getItem('theme');
    const preference = saved ||
      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    setTheme(preference);
    document.documentElement.setAttribute('data-theme', preference);
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
  };

  return { theme, toggleTheme };
}`,
  'auth-service': `
// internal/oauth/google.go
func (s *OAuthService) HandleGoogleCallback(code string) (*User, error) {
  token, err := s.googleConfig.Exchange(ctx, code)
  if err != nil {
    return nil, err
  }

  userInfo, err := s.fetchGoogleUserInfo(token)
  if err != nil {
    return nil, err
  }

  // Check if user exists with this email
  user, err := s.userRepo.FindByEmail(userInfo.Email)
  if err == nil {
    // Link Google account to existing user
    return s.linkGoogleAccount(user, userInfo)
  }

  // Create new user
  return s.createUserFromGoogle(userInfo)
}`,
};

// ============================================================================
// Mock GitHub Server
// ============================================================================

class MockGitHubServer {
  private server: Server;
  private repos: GitHubRepo[];
  private issues: GitHubIssue[];
  private prs: GitHubPR[];
  private branches: GitHubBranch[];
  private users: GitHubUser[];
  private issueCounter: number;
  private prCounter: number;

  constructor() {
    this.server = new Server(
      {
        name: 'mock-github',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.repos = [...MOCK_REPOS];
    this.issues = [...MOCK_ISSUES];
    this.prs = [...MOCK_PRS];
    this.branches = [...MOCK_BRANCHES];
    this.users = [...MOCK_USERS];
    this.issueCounter = Math.max(...this.issues.map((i) => i.number)) + 1;
    this.prCounter = Math.max(...this.prs.map((p) => p.number)) + 1;

    this.setupHandlers();
    console.error('[MockGitHub] Server initialized with mock data');
    console.error(
      `[MockGitHub] ${this.repos.length} repos, ${this.issues.length} issues, ${this.prs.length} PRs`
    );
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools: Tool[] = [
        {
          name: 'github_list_repos',
          description: 'List repositories in the organization',
          inputSchema: {
            type: 'object',
            properties: {
              visibility: {
                type: 'string',
                description: 'Filter by visibility: all, public, private. Default: all',
              },
            },
          },
        },
        {
          name: 'github_create_issue',
          description: 'Create a new issue in a repository',
          inputSchema: {
            type: 'object',
            properties: {
              repository: {
                type: 'string',
                description: 'Repository name (e.g., "api-gateway")',
              },
              title: {
                type: 'string',
                description: 'Issue title',
              },
              body: {
                type: 'string',
                description: 'Issue description',
              },
              labels: {
                type: 'array',
                items: { type: 'string' },
                description: 'Labels to apply (e.g., ["bug", "priority:high"])',
              },
            },
            required: ['repository', 'title', 'body'],
          },
        },
        {
          name: 'github_list_issues',
          description: 'List issues in a repository',
          inputSchema: {
            type: 'object',
            properties: {
              repository: {
                type: 'string',
                description: 'Repository name (e.g., "api-gateway")',
              },
              state: {
                type: 'string',
                description: 'Filter by state: open, closed, all. Default: open',
              },
              labels: {
                type: 'array',
                items: { type: 'string' },
                description: 'Filter by labels',
              },
            },
            required: ['repository'],
          },
        },
        {
          name: 'github_search_code',
          description: 'Search for code across repositories',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Search query (e.g., "rateLimiter", "OAuth2")',
              },
              repository: {
                type: 'string',
                description: 'Optional: limit search to specific repository',
              },
            },
            required: ['query'],
          },
        },
        {
          name: 'github_get_pull_requests',
          description: 'List pull requests in a repository',
          inputSchema: {
            type: 'object',
            properties: {
              repository: {
                type: 'string',
                description: 'Repository name',
              },
              state: {
                type: 'string',
                description: 'Filter by state: open, closed, merged, all. Default: open',
              },
            },
            required: ['repository'],
          },
        },
        {
          name: 'github_create_branch',
          description: 'Create a new branch in a repository',
          inputSchema: {
            type: 'object',
            properties: {
              repository: {
                type: 'string',
                description: 'Repository name',
              },
              branch: {
                type: 'string',
                description: 'New branch name (e.g., "feature/new-feature")',
              },
              from_branch: {
                type: 'string',
                description: 'Base branch name. Default: main',
              },
            },
            required: ['repository', 'branch'],
          },
        },
      ];

      return { tools };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      switch (name) {
        case 'github_list_repos':
          return this.listRepos(args);
        case 'github_create_issue':
          return this.createIssue(args);
        case 'github_list_issues':
          return this.listIssues(args);
        case 'github_search_code':
          return this.searchCode(args);
        case 'github_get_pull_requests':
          return this.getPullRequests(args);
        case 'github_create_branch':
          return this.createBranch(args);
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    });
  }

  private listRepos(args: any) {
    const { visibility = 'all' } = args;

    let filtered = this.repos;
    if (visibility === 'public') {
      filtered = this.repos.filter((r) => !r.private);
    } else if (visibility === 'private') {
      filtered = this.repos.filter((r) => r.private);
    }

    console.error(
      `[MockGitHub] Listed ${filtered.length} repositories (visibility: ${visibility})`
    );

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ repositories: filtered }, null, 2),
        },
      ],
    };
  }

  private createIssue(args: any) {
    const { repository, title, body, labels = [] } = args;

    const repo = this.repos.find((r) => r.name === repository);
    if (!repo) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: 'Repository not found' }, null, 2),
          },
        ],
      };
    }

    const newIssue: GitHubIssue = {
      id: 5000 + this.issueCounter,
      number: this.issueCounter++,
      title,
      body,
      state: 'open',
      labels,
      assignee: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      closed_at: null,
      repository,
      comments: [],
    };

    this.issues.push(newIssue);
    repo.open_issues_count++;

    console.error(`[MockGitHub] Created issue #${newIssue.number} in ${repository}`);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              issue: newIssue,
              url: `https://github.com/company/${repository}/issues/${newIssue.number}`,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  private listIssues(args: any) {
    const { repository, state = 'open', labels = [] } = args;

    let filtered = this.issues.filter((i) => i.repository === repository);

    if (state !== 'all') {
      filtered = filtered.filter((i) => i.state === state);
    }

    if (labels.length > 0) {
      filtered = filtered.filter((i) => labels.some((label: string) => i.labels.includes(label)));
    }

    console.error(
      `[MockGitHub] Listed ${filtered.length} issues from ${repository} (state: ${state})`
    );

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ issues: filtered }, null, 2),
        },
      ],
    };
  }

  private searchCode(args: any) {
    const { query, repository } = args;

    const results: any[] = [];

    // Search in code snippets
    for (const [repoName, code] of Object.entries(CODE_SNIPPETS)) {
      if (repository && repository !== repoName) continue;

      if (code.toLowerCase().includes(query.toLowerCase())) {
        results.push({
          repository: repoName,
          file: 'src/...',
          matches: code
            .split('\n')
            .filter((line) => line.toLowerCase().includes(query.toLowerCase()))
            .slice(0, 3),
        });
      }
    }

    // Search in issue/PR titles and descriptions
    const searchableItems = [
      ...this.issues.map((i) => ({ type: 'issue', ...i })),
      ...this.prs.map((p) => ({ type: 'pr', ...p })),
    ];

    for (const item of searchableItems) {
      if (repository && item.repository !== repository) continue;

      if (
        item.title.toLowerCase().includes(query.toLowerCase()) ||
        item.body.toLowerCase().includes(query.toLowerCase())
      ) {
        results.push({
          type: item.type,
          repository: item.repository,
          number: item.number,
          title: item.title,
        });
      }
    }

    console.error(`[MockGitHub] Code search for "${query}" found ${results.length} results`);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ query, results: results.slice(0, 20) }, null, 2),
        },
      ],
    };
  }

  private getPullRequests(args: any) {
    const { repository, state = 'open' } = args;

    let filtered = this.prs.filter((p) => p.repository === repository);

    if (state !== 'all') {
      filtered = filtered.filter((p) => p.state === state);
    }

    console.error(
      `[MockGitHub] Listed ${filtered.length} PRs from ${repository} (state: ${state})`
    );

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ pull_requests: filtered }, null, 2),
        },
      ],
    };
  }

  private createBranch(args: any) {
    const { repository, branch, from_branch = 'main' } = args;

    const repo = this.repos.find((r) => r.name === repository);
    if (!repo) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: 'Repository not found' }, null, 2),
          },
        ],
      };
    }

    const baseBranch = this.branches.find(
      (b) => b.repository === repository && b.name === from_branch
    );
    if (!baseBranch) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: `Base branch '${from_branch}' not found` }, null, 2),
          },
        ],
      };
    }

    const newBranch: GitHubBranch = {
      name: branch,
      commit_sha: baseBranch.commit_sha,
      repository,
    };

    this.branches.push(newBranch);

    console.error(`[MockGitHub] Created branch '${branch}' in ${repository}`);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            { branch: newBranch, message: 'Branch created successfully' },
            null,
            2
          ),
        },
      ],
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('[MockGitHub] Server running on stdio');
  }
}

// ============================================================================
// Main
// ============================================================================

const server = new MockGitHubServer();
server.run().catch(console.error);
