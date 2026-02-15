import { describe, it } from 'node:test';
import assert from 'node:assert';
import { extractNewTurnsFromBuffer } from './gemini';

// Mock characters
const characters = [
  { id: 'char1', name: 'Alice' },
  { id: 'char2', name: 'Bob' },
];

describe('extractNewTurnsFromBuffer', () => {
  it('should extract a single turn correctly', () => {
    const buffer = '{"turns": [{"type": "narrator", "content": "Hello", "emotion": "neutral"}]}';
    const result = extractNewTurnsFromBuffer(buffer, 0, characters);
    assert.strictEqual(result.newTurns.length, 1);
    assert.strictEqual(result.newTurns[0].content, "Hello");
    assert.strictEqual(result.totalObjectCount, 1);
  });

  it('should extract multiple turns correctly', () => {
    const buffer = '{"turns": [{"type": "narrator", "content": "1", "emotion": "neutral"}, {"type": "dialogue", "character": "Alice", "content": "2", "emotion": "happy"}]}';
    const result = extractNewTurnsFromBuffer(buffer, 0, characters);
    assert.strictEqual(result.newTurns.length, 2);
    assert.strictEqual(result.newTurns[0].content, "1");
    assert.strictEqual(result.newTurns[1].content, "2");
    assert.strictEqual(result.totalObjectCount, 2);
  });

  it('should handle partial JSON updates (streaming)', () => {
    const part1 = '{"turns": [{"type": "narrator", "content": "1", "emotion": "neutral"}';
    const result1 = extractNewTurnsFromBuffer(part1, 0, characters);
    // The first object is complete `{"type": ... "neutral"}` (wait, it misses closing brace `}`).
    // The string `{"type": ... "neutral"}` is NOT a valid object if `}` is missing.
    // The parser checks for `}`.
    // My manual construction `... "neutral"}` -> if I didn't include `}`, it shouldn't extract.

    // Let's test properly:
    const object1 = '{"type": "narrator", "content": "1", "emotion": "neutral"}';
    const buffer1 = `{"turns": [${object1}`;
    const res1 = extractNewTurnsFromBuffer(buffer1, 0, characters);
    assert.strictEqual(res1.newTurns.length, 1);
    assert.strictEqual(res1.totalObjectCount, 1);

    const object2 = '{"type": "dialogue", "character": "Bob", "content": "2", "emotion": "sad"}';
    const buffer2 = `{"turns": [${object1}, ${object2}]}`;
    const res2 = extractNewTurnsFromBuffer(buffer2, 1, characters);
    assert.strictEqual(res2.newTurns.length, 1);
    assert.strictEqual(res2.newTurns[0].content, "2");
    assert.strictEqual(res2.totalObjectCount, 2);
  });

  it('should handle split tokens inside string', () => {
    const buffer = '{"turns": [{"type": "narrator", "content": "Hello '; // incomplete
    const result = extractNewTurnsFromBuffer(buffer, 0, characters);
    assert.strictEqual(result.newTurns.length, 0);

    const completeBuffer = buffer + 'World", "emotion": "neutral"}]}';
    const result2 = extractNewTurnsFromBuffer(completeBuffer, 0, characters);
    assert.strictEqual(result2.newTurns.length, 1);
    assert.strictEqual(result2.newTurns[0].content, "Hello World");
  });

  it('should handle escaped quotes correctly', () => {
    const buffer = '{"turns": [{"type": "narrator", "content": "She said \\"Hi\\"", "emotion": "neutral"}]}';
    const result = extractNewTurnsFromBuffer(buffer, 0, characters);
    assert.strictEqual(result.newTurns.length, 1);
    assert.strictEqual(result.newTurns[0].content, 'She said "Hi"');
  });

  it('should ignore nested braces inside strings', () => {
    const buffer = '{"turns": [{"type": "narrator", "content": "Use { brackets } inside", "emotion": "neutral"}]}';
    const result = extractNewTurnsFromBuffer(buffer, 0, characters);
    assert.strictEqual(result.newTurns.length, 1);
    assert.strictEqual(result.newTurns[0].content, 'Use { brackets } inside');
  });

  it('should handle character name matching', () => {
    const buffer = '{"turns": [{"type": "dialogue", "character": "alice", "content": "Hi", "emotion": "neutral"}]}';
    const result = extractNewTurnsFromBuffer(buffer, 0, characters);
    assert.strictEqual(result.newTurns.length, 1);
    assert.strictEqual(result.newTurns[0].characterId, 'char1'); // Case insensitive matching
  });

  it('should handle escaped backslashes', () => {
    const buffer = '{"turns": [{"type": "narrator", "content": "Backslash \\\\ test", "emotion": "neutral"}]}';
    const result = extractNewTurnsFromBuffer(buffer, 0, characters);
    assert.strictEqual(result.newTurns.length, 1);
    assert.strictEqual(result.newTurns[0].content, 'Backslash \\ test');
  });
});
