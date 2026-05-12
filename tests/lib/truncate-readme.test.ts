import { describe, it, expect } from 'vitest';
import { truncateReadme } from '@/lib/utils/truncate-readme';

describe('truncateReadme', () => {
  it('should return empty string for empty input', () => {
    expect(truncateReadme('')).toBe('');
    expect(truncateReadme('').length).toBe(0);
  });

  it('should return the original string if shorter than maxLength', () => {
    const short = 'Hello, world!';
    expect(truncateReadme(short)).toBe(short);
    expect(truncateReadme(short).length).toBe(short.length);
  });

  it('should return exactly 500 characters for a string of exactly 500 characters', () => {
    const exact = 'a'.repeat(500);
    const result = truncateReadme(exact);
    expect(result).toBe(exact);
    expect(result.length).toBe(500);
  });

  it('should truncate to 500 characters for a string longer than 500', () => {
    const long = 'b'.repeat(1000);
    const result = truncateReadme(long);
    expect(result.length).toBe(500);
    expect(result).toBe('b'.repeat(500));
  });

  it('should return a prefix of the original content', () => {
    const content = 'abcdefghij'.repeat(100); // 1000 chars
    const result = truncateReadme(content);
    expect(content.startsWith(result)).toBe(true);
  });

  it('should respect a custom maxLength parameter', () => {
    const content = 'x'.repeat(200);
    const result = truncateReadme(content, 100);
    expect(result.length).toBe(100);
    expect(result).toBe('x'.repeat(100));
  });

  it('should return full content when maxLength exceeds content length', () => {
    const content = 'short';
    const result = truncateReadme(content, 1000);
    expect(result).toBe(content);
    expect(result.length).toBe(5);
  });
});
