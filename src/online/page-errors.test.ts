import { describe, expect, it } from 'vitest';

import {
  createPageErrors,
  listenForErrors,
  type PageErrorReport,
} from './page-errors';

const ORIGIN = 'https://tick-perfect.test';

function setUp(limit?: number) {
  const sent: PageErrorReport[] = [];
  const errors = createPageErrors({
    send: report => sent.push(report),
    version: '1.2.3',
    origin: ORIGIN,
    path: () => '/',
    ...(limit !== undefined && { limit }),
  });
  return { sent, errors };
}

describe('createPageErrors', () => {
  it('sends an error with where it happened and the version', () => {
    const { sent, errors } = setUp();
    const error = new TypeError('x is undefined');
    errors.report('render', error);
    expect(sent).toEqual([
      {
        kind: 'render',
        message: 'TypeError: x is undefined',
        stack: error.stack,
        where: null,
        path: '/',
        version: '1.2.3',
      },
    ]);
  });

  it('sends each kind of error once', () => {
    const { sent, errors } = setUp();
    errors.report('error', new Error('once'), `${ORIGIN}/a.js:1:2`);
    errors.report('error', new Error('once'), `${ORIGIN}/a.js:1:2`);
    errors.report('rejection', 'once');
    expect(sent.map(report => report.kind)).toEqual(['error', 'rejection']);
  });

  it('sends an error once, however it arrives', () => {
    const { sent, errors } = setUp();
    const error = new Error('from the canvas');
    errors.report('render', error);
    errors.report('error', error, `${ORIGIN}/assets/three.js:1:2`);
    expect(sent.map(report => report.kind)).toEqual(['render']);
  });

  it('sends nothing while a reload is about to fix the error', () => {
    const sent: PageErrorReport[] = [];
    let reloading = true;
    const errors = createPageErrors({
      send: report => sent.push(report),
      version: '1.2.3',
      origin: ORIGIN,
      path: () => '/',
      paused: () => reloading,
    });
    errors.report('render', new Error('Failed to fetch a chunk'));
    expect(sent).toEqual([]);
    reloading = false;
    errors.report('render', new Error('Failed to fetch a chunk'));
    expect(sent).toHaveLength(1);
  });

  it('sends a few at most', () => {
    const { sent, errors } = setUp(2);
    for (const message of ['a', 'b', 'c']) errors.report('error', message);
    expect(sent.map(report => report.message)).toEqual(['a', 'b']);
  });

  it('leaves out what isn’t the game’s', () => {
    const { sent, errors } = setUp();
    errors.report('error', 'Script error.');
    errors.report('error', 'ResizeObserver loop limit exceeded');
    errors.report('error', new Error('theirs'), 'https://other.test/x.js:1:1');
    const injected = new Error('injected');
    injected.stack = 'Error: injected\n    at chrome-extension://abc/x.js:1:1';
    errors.report('error', injected);
    errors.report('error', '');
    expect(sent).toEqual([]);
  });

  it('describes whatever was thrown', () => {
    const { sent, errors } = setUp();
    errors.report('rejection', { code: 42 });
    errors.report('rejection', 7n);
    const nameless = new Error();
    nameless.name = 'AbortError';
    errors.report('rejection', nameless);
    expect(sent.map(report => report.message)).toEqual([
      '{"code":42}',
      '7',
      'AbortError',
    ]);
  });
});

describe('listenForErrors', () => {
  it('reports uncaught errors and rejections', () => {
    const { sent, errors } = setUp();
    const target = new EventTarget();
    listenForErrors(target as unknown as Window, errors);

    const error = Object.assign(new Event('error'), {
      error: new Error('boom'),
      message: 'Uncaught Error: boom',
      filename: `${ORIGIN}/assets/index.js`,
      lineno: 1,
      colno: 99,
    });
    target.dispatchEvent(error);
    const plain = Object.assign(new Event('error'), {
      error: null,
      message: 'Uncaught oops',
      filename: '',
      lineno: 0,
      colno: 0,
    });
    target.dispatchEvent(plain);
    target.dispatchEvent(
      Object.assign(new Event('unhandledrejection'), { reason: 'nope' })
    );

    expect(
      sent.map(report => [report.kind, report.message, report.where])
    ).toEqual([
      ['error', 'Error: boom', `${ORIGIN}/assets/index.js:1:99`],
      ['error', 'Uncaught oops', null],
      ['rejection', 'nope', null],
    ]);
  });
});
