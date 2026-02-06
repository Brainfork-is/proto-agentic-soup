# Mock GitHub MCP Server

Realistic GitHub simulation for testing agents with MCP integration. Provides 20 repositories, 20 issues, 12 pull requests, and 6 tools.

## Features

- **20 repositories** (api-gateway, frontend-app, data-pipeline, mobile-app, auth-service, etc.)
- **20 issues** with realistic bug reports, feature requests, and labels
- **12 pull requests** with reviews and approval states
- **Code snippets** for search functionality
- **Stateful** - created issues, PRs, and branches persist

## Tools

1. **github_list_repos** - List all repositories (filter by public/private)
2. **github_create_issue** - Create new issues with labels
3. **github_list_issues** - List/filter issues by state and labels
4. **github_search_code** - Search code, issues, and PRs
5. **github_get_pull_requests** - List PRs by state
6. **github_create_branch** - Create new branches

## Usage

```bash
pnpm install
pnpm build
pnpm start
```

## Example Tool Calls

```json
{
  "name": "github_list_repos",
  "arguments": { "visibility": "all" }
}

{
  "name": "github_create_issue",
  "arguments": {
    "repository": "api-gateway",
    "title": "Fix memory leak",
    "body": "Description of the issue...",
    "labels": ["bug", "priority:high"]
  }
}

{
  "name": "github_search_code",
  "arguments": {
    "query": "OAuth2",
    "repository": "auth-service"
  }
}
```

## Mock Data

### Repositories (20)
- api-gateway, frontend-app, data-pipeline, mobile-app
- auth-service, payment-service, notification-service
- infrastructure, monitoring, analytics-service
- design-system, api-client-sdk, ml-models
- And more...

### Issues (20)
- Memory leaks, performance problems
- Feature requests (OAuth, dark mode, biometric auth)
- Security issues, accessibility bugs
- Infrastructure and deployment issues

### Pull Requests (12)
- Rate limiting implementation
- Bug fixes with reviews
- OAuth2 integration
- Dark mode feature
- Accessibility improvements

Part of the Agentic Soup project.
