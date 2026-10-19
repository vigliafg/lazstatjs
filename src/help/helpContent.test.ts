import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DOCUMENTED_ANALYSES, HELP_TABS, type HelpTab } from './helpContent';

/** Every string reachable from the help data, joined: used for coverage checks. */
const allText = (value: unknown, out: string[] = []): string[] => {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((item) => allText(item, out));
  else if (value && typeof value === 'object') {
    Object.values(value as Record<string, unknown>).forEach((item) => allText(item, out));
  }
  return out;
};

const helpText = allText(HELP_TABS).join('\n');

const analysesTab = (): HelpTab => {
  const tab = HELP_TABS.find((entry) => entry.id === 'analyses');
  assert.ok(tab, 'the Analyses tab must exist');
  return tab;
};

describe('help content', () => {
  it('has unique tab and section ids and non-empty summaries', () => {
    const tabIds = HELP_TABS.map((tab) => tab.id);
    assert.equal(new Set(tabIds).size, tabIds.length, 'tab ids must be unique');
    assert.ok(HELP_TABS.length >= 8, 'the guide covers at least the eight areas');
    HELP_TABS.forEach((tab) => {
      assert.ok(tab.label.trim() !== '', `tab ${tab.id} needs a label`);
      assert.ok(tab.title.trim() !== '', `tab ${tab.id} needs a title`);
      assert.ok(tab.blurb.trim() !== '', `tab ${tab.id} needs a blurb`);
      assert.ok(tab.sections.length > 0, `tab ${tab.id} needs at least one section`);
      const sectionIds = tab.sections.map((section) => section.id);
      assert.equal(new Set(sectionIds).size, sectionIds.length, `duplicate section id in ${tab.id}`);
      tab.sections.forEach((section) => {
        assert.ok(section.summary.trim() !== '', `section ${tab.id}/${section.id} needs a summary`);
        assert.ok(section.blocks.length > 0, `section ${tab.id}/${section.id} needs a block`);
        const titles = section.blocks.map((block) => block.title);
        assert.equal(new Set(titles).size, titles.length, `duplicate block title in ${tab.id}/${section.id}`);
      });
    });
  });

  it('gives every block something to read and every example real steps', () => {
    HELP_TABS.forEach((tab) =>
      tab.sections.forEach((section) =>
        section.blocks.forEach((block) => {
          const hasBody =
            (block.steps && block.steps.length > 0) ||
            block.table !== undefined ||
            (block.intro !== undefined && block.intro.trim() !== '');
          assert.ok(hasBody, `block "${block.title}" has no steps, table or intro`);
          block.steps?.forEach((step) =>
            assert.ok(step.trim() !== '', `empty step in "${block.title}"`)
          );
          if (block.example) {
            assert.ok(block.example.title.trim() !== '', `example in "${block.title}" needs a title`);
            assert.ok(
              block.example.steps.length >= 2,
              `example "${block.example.title}" needs at least two steps`
            );
          }
          if (block.table) {
            assert.ok(block.table.head.length > 0, `table in "${block.title}" needs a header`);
            block.table.rows.forEach((row) =>
              assert.equal(
                row.length,
                block.table?.head.length,
                `table in "${block.title}" has a row with the wrong number of cells`
              )
            );
          }
        })
      )
    );
  });

  it('documents every analysis panel of the application', () => {
    // Mirrors ANALYSIS_TABS in src/App.tsx: adding a panel should fail here
    // until the guide describes it.
    assert.equal(DOCUMENTED_ANALYSES.length, 19);
    const tab = analysesTab();
    DOCUMENTED_ANALYSES.forEach((name) => {
      const section = tab.sections.find((entry) => entry.title === name);
      assert.ok(section, `analysis "${name}" has no section in the Analyses tab`);
      const steps = section.blocks.flatMap((block) => block.steps ?? []);
      assert.ok(steps.length >= 3, `analysis "${name}" needs at least three steps`);
      assert.ok(
        section.blocks.some((block) => block.example),
        `analysis "${name}" needs a worked example`
      );
    });
  });

  it('mentions the main labels of the editor, the group tools and the exports', () => {
    const required = [
      'Run Analysis',
      'Modifica livelli',
      'Recode values',
      'Apply levels',
      'Read data',
      'Validate',
      'Auto-fix',
      'Freeze col',
      'Filter',
      'Clean',
      'Transform',
      'Smart Import',
      'Save project',
      'Open project',
      'Charts PNG',
      'Report HTML',
      'Results XLSX',
      'Ctrl+Z',
    ];
    required.forEach((label) =>
      assert.ok(helpText.includes(label), `the guide never mentions "${label}"`)
    );
  });

  it('keeps the examples concrete about the app behaviour', () => {
    // A few sentences that encode behaviour a user must be able to trust.
    const expectations = [
      'view-only',
      'not in list',
      'reference level',
      'single undo step',
      'labels',
      '90/95/99%',
    ];
    expectations.forEach((fragment) =>
      assert.ok(
        helpText.toLowerCase().includes(fragment.toLowerCase()),
        `the guide should explain "${fragment}"`
      )
    );
  });
});
