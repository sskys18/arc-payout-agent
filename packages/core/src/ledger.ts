// Append-only event ledger + terminal-marker set.
//
// The single-owner / no-double-run guarantee is built on terminal markers:
// before running a keyed unit of work the owner checks `hasTerminal(key)`; after a
// terminal outcome it calls `markTerminal(key)`. A second trigger that observes the
// durable marker declines to re-run. Events themselves are append-only and never mutated.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

export type LedgerEvent = { ts: string; type: string; key?: string; [k: string]: unknown };

/**
 * Storage abstraction for the append-only ledger and its terminal-marker set.
 *
 * IMPORTANT: `hasTerminal`/`markTerminal` provide DURABLE terminal state — once a
 * key is marked it survives restarts — but they do NOT provide cross-process
 * mutual exclusion. Two processes can both observe `hasTerminal(key) === false`
 * and race into the same work before either calls `markTerminal`. Terminal markers
 * make re-runs idempotent after the fact; they are not a lock.
 *
 * True single-owner execution requires an EXTERNAL lock held by the caller for the
 * duration of the keyed unit of work (see the runner pattern: acquire lock ->
 * check hasTerminal -> do work -> markTerminal -> release lock).
 */
export interface LedgerStore {
  append(e: LedgerEvent): void;
  hasTerminal(key: string): boolean;
  markTerminal(key: string): void;
  all(): LedgerEvent[];
}

/** Volatile ledger for tests and dry runs. */
export class InMemoryLedger implements LedgerStore {
  private readonly events: LedgerEvent[] = [];
  private readonly terminal = new Set<string>();

  append(e: LedgerEvent): void {
    this.events.push(e);
  }

  hasTerminal(key: string): boolean {
    return this.terminal.has(key);
  }

  markTerminal(key: string): void {
    this.terminal.add(key);
  }

  all(): LedgerEvent[] {
    return [...this.events];
  }
}

/**
 * Durable ledger: events appended as JSONL to `path`, terminal markers appended
 * one-per-line to a sidecar file (defaults to `${path}.terminals`). Both files are
 * append-only; the terminal set is loaded into memory on construction.
 */
export class JsonFileLedger implements LedgerStore {
  readonly path: string;
  readonly terminalPath: string;
  private readonly terminal: Set<string>;

  constructor(path: string, terminalPath?: string) {
    this.path = path;
    this.terminalPath = terminalPath ?? `${path}.terminals`;
    mkdirSync(dirname(this.path), { recursive: true });
    this.terminal = new Set(this.#loadTerminals());
  }

  #loadTerminals(): string[] {
    if (!existsSync(this.terminalPath)) return [];
    const raw = readFileSync(this.terminalPath, 'utf8').trim();
    if (!raw) return [];
    return raw.split('\n').map((l) => l.trim()).filter(Boolean);
  }

  append(e: LedgerEvent): void {
    appendFileSync(this.path, `${JSON.stringify(e)}\n`);
  }

  hasTerminal(key: string): boolean {
    return this.terminal.has(key);
  }

  markTerminal(key: string): void {
    if (this.terminal.has(key)) return;
    this.terminal.add(key);
    appendFileSync(this.terminalPath, `${key}\n`);
  }

  all(): LedgerEvent[] {
    if (!existsSync(this.path)) return [];
    const raw = readFileSync(this.path, 'utf8').trim();
    if (!raw) return [];
    return raw
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => JSON.parse(l) as LedgerEvent);
  }
}
