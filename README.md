# GitTok

> A TikTok-style discovery feed for GitHub repositories.

GitTok turns GitHub exploration into a fast vertical feed: swipe through repositories, get concise README summaries, open live discussion panels, star or follow projects, and share repository-specific GitTok links.

<p align="center">
  <a href="https://gittok.onrender.com/"><img alt="Live demo" src="https://img.shields.io/badge/demo-gittok.onrender.com-111827?style=for-the-badge"></a>
  <a href="https://github.com/Mad12345-qw/gittok"><img alt="GitHub repo" src="https://img.shields.io/badge/github-Mad12345--qw%2Fgittok-24292f?style=for-the-badge&logo=github"></a>
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-14-black?style=for-the-badge&logo=nextdotjs">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-Ready-3178c6?style=for-the-badge&logo=typescript&logoColor=white">
</p>

<p align="center">
  <a href="#features">Features</a> ·
  <a href="#architecture">Architecture</a> ·
  <a href="#recommendation-system">Recommendation System</a> ·
  <a href="#local-development">Local Development</a> ·
  <a href="#deployment">Deployment</a>
</p>

## Why GitTok

GitHub search is powerful, but discovery still feels like browsing lists. GitTok is built around a different interaction model:

- repository cards are full-screen and swipeable;
- README content is summarized automatically;
- recommendations adapt to user behavior;
- every repository can have a GitTok-native comment thread;
- official GitHub Discussions can be viewed and used when permissions allow.

The goal is simple: make finding interesting open source projects feel immediate, visual, and addictive without losing the depth of GitHub.

## Features

### Repository Discovery Feed

- TikTok-style vertical scroll with snap navigation.
- Large buffered loading: 100 repositories per feed request.
- Early prefetching before the user reaches the end of the buffer.
- Share links that deep-link back into GitTok for the current repository.
- "Not interested" feedback for tuning future recommendations.

### README Enrichment

- Fetches repository README content from GitHub.
- Generates concise Chinese README summaries.
- Extracts displayable README images while avoiding badges and non-image links.
- Falls back to safe generated copy when GitHub or translation services are unavailable.

### Recommendation System

- Cold-start discovery for anonymous or new users.
- Profile-aware scoring based on languages, topics, stars, forks, and interaction signals.
- Exploration quota so the feed does not become too narrow.
- Session seed rotation to prevent repeated first-page recommendations.

### Comments And Discussions

- GitTok-native comments for every repository.
- Anonymous posting support for GitTok comments.
- Official GitHub Discussions tab when a repository has Discussions enabled.
- GitHub discussion count + GitTok comment count are combined in the comment rail.
- Clear handling for GitHub OAuth organization restrictions.

### GitHub Actions

- Star/unstar repositories.
- Follow/unfollow repository owners.
- OAuth login with GitHub through NextAuth.
- Public GitHub token support for server-side Discussions reads.

### Health Checks

The project includes a dedicated health check script covering the failure cases that matter most:

- site and CSS availability;
- GitHub OAuth callback origin;
- feed API speed and 100-card batches;
- deep paging without terminal "no more" pages;
- tail loading behavior;
- README summary and image extraction;
- discussion and comment APIs;
- numeric comment count rendering.

## Architecture

```mermaid
flowchart TD
  Browser["Browser / Mobile Web"] --> NextApp["Next.js App Router"]
  NextApp --> FeedAPI["/api/feed"]
  NextApp --> EnrichAPI["/api/feed/enrich"]
  NextApp --> GitTokComments["/api/gittok/comments"]
  NextApp --> GitHubDiscussions["/api/github/discussions"]
  NextApp --> Auth["NextAuth GitHub OAuth"]

  FeedAPI --> FeedService["Feed Service"]
  FeedService --> Recommendation["Recommendation Engine"]
  FeedService --> GitHubAPI["GitHub REST API"]
  FeedService --> Prisma["Prisma / PostgreSQL"]

  EnrichAPI --> GitHubReadme["GitHub README API"]
  EnrichAPI --> Translate["Baidu Translate API"]
  EnrichAPI --> Redis["Redis Cache"]

  GitTokComments --> Prisma
  GitHubDiscussions --> GitHubGraphQL["GitHub GraphQL API"]
  Auth --> GitHubOAuth["GitHub OAuth"]
```

## Tech Stack

| Layer | Technology |
| --- | --- |
| Framework | Next.js 14 App Router |
| Language | TypeScript |
| UI | React, Tailwind CSS |
| State | Zustand |
| Auth | NextAuth.js + GitHub OAuth |
| Database | PostgreSQL via Prisma |
| Cache | Redis / Upstash Redis |
| External APIs | GitHub REST, GitHub GraphQL, Baidu Translate |
| Deployment | Render or any Node-compatible host |

## Project Structure

```text
src/
  app/
    api/                  API routes for feed, auth, GitHub, comments, settings
    favorites/            Starred repository view
    follows/              Followed owner view
    login/                GitHub login page
    settings/             User preferences
  components/
    feed/                 Feed UI, cards, interaction rail, discussion drawer
  hooks/                  Client hooks for enrichment and comment counts
  lib/                    Auth, Prisma, GitHub Discussions, parsers, utilities
  services/               Feed generation, scoring, GitHub client, profile updates
  stores/                 Zustand stores
scripts/
  health-check.mjs        End-to-end local health checks
```

## Recommendation System

GitTok uses a practical ranking pipeline rather than a black-box model:

1. Fetch candidate repositories from GitHub search or cold-start pools.
2. Apply repository quality filters and user settings.
3. Score each candidate against the user's profile.
4. Mix high-score items with exploration items.
5. Return a buffered batch to the client.
6. Update profile signals from dwell time, stars, follows, and negative feedback.

The local development feed can run in mock mode with deterministic seed rotation, so testing remains fast even without GitHub rate budget.

## Local Development

### Prerequisites

- Node.js 20+
- npm
- PostgreSQL database
- Redis instance
- GitHub OAuth App

### Install

```bash
npm install
```

### Environment

Copy the example file:

```bash
cp .env.example .env.local
```

Then configure:

```env
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=generate-with-openssl-rand-base64-32

GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
GITHUB_TOKEN=optional_public_repo_token

DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require
REDIS_URL=rediss://default:your_token@your-host.upstash.io:6379

BAIDU_TRANSLATE_APPID=your_appid
BAIDU_TRANSLATE_API_KEY=your_api_key

USE_MOCK_FEED=false
NEXT_PUBLIC_USE_MOCK_FEED=false
```

### Run

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

### Validate

```bash
npm run build
npm run health
```

For LAN testing, set the tested origin before running health checks:

```bash
TEST_BASE_URL=http://192.168.0.111:3000 npm run health
```

## Deployment

GitTok can be deployed on Render, Vercel, or any Node-compatible platform.

Required production settings:

- `NEXTAUTH_URL` must match the public site origin.
- GitHub OAuth callback must match:

```text
https://your-domain.com/api/auth/callback/github
```

- `DATABASE_URL` must point to a reachable PostgreSQL database.
- `REDIS_URL` is recommended for cache stability.
- `GITHUB_TOKEN` is recommended for server-side public Discussions reads.

Build command:

```bash
npm run build
```

Start command:

```bash
npm run start
```

## GitHub OAuth Notes

Some organizations restrict third-party OAuth Apps. When this happens:

- GitTok-native comments still work because they are stored in GitTok's database.
- Official GitHub Discussions may be read-only or require login.
- Writing to official Discussions depends on the repository and organization permissions.

This is why GitTok provides two separate discussion surfaces:

- GitTok comments: always available inside GitTok.
- Official Discussions: synchronized with GitHub when access is allowed.

## Roadmap

- Smarter recommendation profiles.
- Better multilingual README summarization.
- Richer GitTok-native comment reactions.
- Repository collection playlists.
- More deployment presets and diagnostics.

## Contributing

Issues, ideas, and pull requests are welcome. If you are testing locally, run:

```bash
npm run build
npm run health
```

before opening a pull request.

## License

MIT
