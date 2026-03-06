(function () {
  function slugify(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/[^\w]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function stripFormatting(text) {
    return String(text || '')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[*_~]/g, '')
      .replace(/<[^>]+>/g, '')
      .trim();
  }

  function parseHeadings(markdown, maxLevel) {
    var lines = markdown.split(/\r?\n/);
    var headings = [];
    var inFence = false;

    lines.forEach(function (line) {
      var trimmed = line.trim();

      if (/^```/.test(trimmed)) {
        inFence = !inFence;
        return;
      }

      if (inFence) return;

      var match = trimmed.match(/^(#{2,6})\s+(.*)$/);
      if (!match) return;

      var level = match[1].length;
      if (level > maxLevel) return;

      var text = stripFormatting(match[2]);
      if (!text) return;
      if (/^(table of contents|documentation index)$/i.test(text)) return;

      headings.push({
        level: level,
        text: text,
        id: slugify(text),
      });
    });

    return headings;
  }

  function hasSummaryBlock(lines, scanLines) {
    var max = Math.min(lines.length, scanLines);
    var seenTitle = false;

    for (var i = 0; i < max; i += 1) {
      var line = lines[i];
      var trimmed = line.trim();

      if (!trimmed) continue;

      if (!seenTitle && /^#\s+/.test(trimmed)) {
        seenTitle = true;
        continue;
      }

      if (/^##\s+/.test(trimmed)) return false;

      if (/^>\s+/.test(trimmed)) return true;

      if (
        !/^(#|\*|-|\d+\.|```|<|---|\*\*Navigation:|\*\*Prev:|\*\*Main:|\*\*Next:)/.test(trimmed)
      ) {
        return true;
      }
    }

    return false;
  }

  function hasTableOfContents(markdown) {
    return /^(##|###)\s+(Table of Contents|Documentation Index|Quick Navigation)\b/im.test(markdown);
  }

  function findInsertionIndex(lines) {
    var i = 0;

    if (lines.length && /^#\s+/.test(lines[0].trim())) {
      i = 1;
    }

    while (i < lines.length) {
      var trimmed = lines[i].trim();

      if (!trimmed) {
        i += 1;
        continue;
      }

      if (
        /^>\s+/.test(trimmed) ||
        /^\*\*(Navigation|Prev|Main|Next|Audience|Time to read|Difficulty):/.test(trimmed) ||
        /^<[^>]+>$/.test(trimmed) ||
        /^---$/.test(trimmed)
      ) {
        i += 1;
        continue;
      }

      break;
    }

    return i;
  }

  function buildToc(headings, maxItems) {
    if (!headings.length) return '';

    var tocHeadings = headings;
    if (tocHeadings.length > maxItems) {
      tocHeadings = tocHeadings.filter(function (heading) {
        return heading.level === 2;
      });
    }

    if (!tocHeadings.length) return '';

    var lines = ['## Table of Contents', ''];

    tocHeadings.forEach(function (heading) {
      var indent = heading.level > 2 ? '  '.repeat(heading.level - 2) : '';
      lines.push(indent + '- [' + heading.text + '](#' + heading.id + ')');
    });

    return lines.join('\n');
  }

  function injectLongformStructure(markdown, config) {
    var lines = markdown.split(/\r?\n/);
    if (lines.length <= config.lineThreshold) return markdown;

    var headings = parseHeadings(markdown, config.tocMaxLevel);
    var insertionIndex = findInsertionIndex(lines);
    var blocks = [];

    if (!hasSummaryBlock(lines, config.summaryScanLines)) {
      blocks.push(
        '> **What this guide covers:** This is a long-form document. Use the overview below and the table of contents to jump to the section you need.'
      );
    }

    if (!hasTableOfContents(markdown)) {
      var toc = buildToc(headings, config.tocMaxItems);
      if (toc) {
        if (blocks.length) blocks.push('');
        blocks.push(toc);
      }
    }

    if (!blocks.length) return markdown;

    var before = lines.slice(0, insertionIndex);
    var after = lines.slice(insertionIndex);
    return before.concat([''], blocks, [''], after).join('\n');
  }

  function longformPlugin(hook, vm) {
    hook.beforeEach(function (markdown) {
      var config = Object.assign(
        {
          enabled: true,
          lineThreshold: 500,
          tocMaxLevel: 3,
          tocMaxItems: 40,
          summaryScanLines: 40,
        },
        (vm && vm.config && vm.config.longformDocs) || {}
      );

      if (!config.enabled) return markdown;
      return injectLongformStructure(markdown, config);
    });
  }

  window.$docsify = window.$docsify || {};
  window.$docsify.plugins = [].concat(longformPlugin, window.$docsify.plugins || []);
})();
