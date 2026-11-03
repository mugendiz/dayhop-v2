// routes/llmsTxt.js — DayHop V2
// /llms.txt (llmstxt.org): what DayHop is and where its citable content
// lives, in plain Markdown for AI crawlers. ChatGPT already sends DayHop
// its best-converting visitors (public.events first touch, 60 days to
// 2026-11-03); this makes the site easier for answer engines to read.

const { ENTRIES, slugOf, splitTitle, undash } = require('./placePages');

module.exports = function llmsTxt(base) {
  const places = ENTRIES.slice()
    .sort((a, b) => a.title.localeCompare(b.title))
    .map(e => {
      const { name } = splitTitle(e.title);
      return `- [${undash(name)}](${base}/places/${slugOf(e)}): ${undash(e.description)}`;
    });
  return [
    '# DayHop',
    '',
    '> DayHop is a day planner for families around Toronto and the Greater Toronto Area (GTA), Ontario, Canada. It recommends real, hand-checked places and events for a day out, with ages, cost, weather and directions.',
    '',
    'Every place below was checked by hand and links to live directions. Facts on each page are kept current; hours and prices change, so each page links to the official source.',
    '',
    '## Main pages',
    `- [Planner](${base}/): describe the day you want in one sentence and get a plan with real venues and today's weather.`,
    `- [All places](${base}/places): ${ENTRIES.length} family outings around the GTA, grouped by area.`,
    `- [Weekend Playbook](${base}/playbook): free guide to 70+ GTA family outings.`,
    `- [City guides](${base}/guides): field-checked PDF nature guides for Ontario cities.`,
    `- [Trip guides](${base}/guides/personal): a custom guide for any Ontario place and dates.`,
    `- [Stories](${base}/blog): new openings, hidden gems and day plans.`,
    '',
    '## Places',
    ...places,
    ''
  ].join('\n');
};
