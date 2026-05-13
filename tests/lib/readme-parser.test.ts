import { describe, expect, it } from 'vitest';
import { extractFirstImage, extractSummary } from '@/lib/readme-parser';

describe('readme-parser', () => {
  it('skips badges and HTML wrappers before Hono-style README content', () => {
    const markdown = `
<div align="center">
  <img src="https://example.com/logo.png" alt="Hono"/>
</div>

<hr />

[![GitHub](https://img.shields.io/github/license/honojs/hono)](https://github.com/honojs/hono)
[![npm](https://img.shields.io/npm/v/hono)](https://www.npmjs.com/package/hono)

Hono - _**means flame in Japanese**_ - is a small, simple, and ultrafast web framework built on Web Standards.

## Quick Start

\`\`\`ts
console.log('skip code')
\`\`\`
`;

    const summary = extractSummary(markdown);

    expect(summary).toContain('Hono - means flame in Japanese');
    expect(summary).not.toContain('img.shields.io');
    expect(summary).not.toContain('<hr');
    expect(summary).not.toContain('console.log');
  });

  it('skips reference links and language nav before Biome-style README content', () => {
    const markdown = `
<div align="center">
  <picture>
    <img alt="Biome banner" src="https://example.com/banner.svg">
  </picture>

  [![CI on main][ci-badge]][ci-url]

  [ci-badge]: https://github.com/biomejs/biome/actions/workflows/main.yml/badge.svg
  [ci-url]: https://github.com/biomejs/biome/actions/workflows/main.yml

  [हिन्दी](README.hi.md) | English | [简体中文](README.zh-CN.md) | [日本語](README.ja.md)
</div>

<br>

**Biome** is a performant toolchain for web projects, it aims to provide developer tools to maintain the health of said projects.

**Biome is a fast formatter** for JavaScript, TypeScript, JSX, JSON, CSS and GraphQL.

### Installation
`;

    const summary = extractSummary(markdown);

    expect(summary).toContain('Biome is a performant toolchain');
    expect(summary).toContain('Biome is a fast formatter');
    expect(summary).not.toContain('ci-badge');
    expect(summary).not.toContain('简体中文');
  });

  it('extracts a raw GitHub demo gif from an HTML image tag', () => {
    const markdown = `
## Demos

### GitTok 移动端推荐流

<p align="center">
  <img src="https://raw.githubusercontent.com/Mad12345-qw/gittok/main/docs/images/gittok-mobile-feed.gif" alt="GitTok 移动端推荐流 Demo" width="320">
</p>
`;

    expect(extractFirstImage(markdown)).toBe(
      'https://raw.githubusercontent.com/Mad12345-qw/gittok/main/docs/images/gittok-mobile-feed.gif'
    );
  });
});
