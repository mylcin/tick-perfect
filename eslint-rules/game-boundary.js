import path from 'node:path';

/**
 * Keeps `src/game` framework-free: its modules may only import other modules
 * inside `root` (the absolute path of `src/game`). Packages (React, Three.js,
 * Zustand, …) and the other app layers are reported, so the rules stay
 * testable without a DOM or a renderer.
 *
 * @type {import('eslint').Rule.RuleModule}
 */
export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Restrict src/game imports to modules inside src/game',
    },
    schema: [
      {
        type: 'object',
        properties: {
          root: { type: 'string' },
          allow: {
            type: 'array',
            items: { type: 'string' },
            uniqueItems: true,
          },
        },
        required: ['root'],
        additionalProperties: false,
      },
    ],
    messages: {
      package:
        "src/game must stay framework-free, so it can't import '{{source}}'.",
      outside:
        "src/game can only import modules inside src/game, not '{{source}}'.",
      dynamic:
        'src/game imports must use a static string so they can be checked.',
    },
  },

  create(context) {
    // `root` comes from the config file's location rather than the cwd, so
    // editors and scripts that run ESLint from another folder agree with CI.
    const { root: gameRoot, allow: allowed = [] } = context.options[0];
    const allow = new Set(allowed);
    const fileDir = path.dirname(context.filename);

    function check(node, source) {
      if (allow.has(source)) return;

      const isPath = source.startsWith('.') || path.isAbsolute(source);
      if (!isPath) {
        context.report({ node, messageId: 'package', data: { source } });
        return;
      }

      const relative = path.relative(gameRoot, path.resolve(fileDir, source));
      const escapes =
        relative === '..' ||
        relative.startsWith(`..${path.sep}`) ||
        path.isAbsolute(relative);
      if (escapes) {
        context.report({ node, messageId: 'outside', data: { source } });
      }
    }

    return {
      ImportDeclaration: node => check(node, node.source.value),
      ExportAllDeclaration: node => check(node, node.source.value),
      ExportNamedDeclaration(node) {
        if (node.source) check(node, node.source.value);
      },
      ImportExpression(node) {
        const source = staticString(node.source);
        if (source === undefined) {
          context.report({ node, messageId: 'dynamic' });
        } else {
          check(node, source);
        }
      },
      // `type T = import('three').Vector3` is a TypeScript-only node.
      TSImportType: node => check(node, node.source.value),
    };
  },
};

function staticString(node) {
  if (node.type === 'Literal' && typeof node.value === 'string') {
    return node.value;
  }
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return node.quasis[0].value.cooked;
  }
  return undefined;
}
