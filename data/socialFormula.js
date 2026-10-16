// data/socialFormula.js — the monthly social formula: what goes out, on
// which day, at what time, in which format. services/socialMonth.js expands
// it into a dated calendar for a month; services/socialBatch.js reads the
// video slots so the Tuesday drafts land on the days this file names.
//
// Why this shape, from the account's own numbers (services/socialBatch.js):
// single surprising local facts with a face or motion in frame one clear
// 700 to 900 views, while lists, roundups and text-over-photo posts sit at
// 86 to 245 with zero shares. Instagram has close to no followers, so only
// Reels reach new people there. So the growth work is short video, three a
// week, each built on one fact. Photo posts are kept because they cost
// nothing to make and can be scheduled a month ahead (owned, credited
// Commons photos in assets/photos), not because they reach anyone yet.
//
// Times are starting defaults, Toronto time, chosen around when GTA
// families plan a weekend (the Thursday evening slot is the same reasoning
// as the Thursday weekend brief). They are not research. Tune them from
// the 24 hour view log the posting checklist asks for, then change them
// here: one edit moves the whole calendar.
//
// day: 0 Sun ... 6 Sat (same as Date.getUTCDay).

const CHANNELS = {
  video: ['TikTok @dayhop3', 'Instagram Reel @dayhopofficial'],
  photo: ['Instagram feed @dayhopofficial', 'TikTok photo post @dayhop3']
};

const PILLARS = {
  hidden: {
    name: 'Hidden in plain sight',
    format: 'video',
    brief: 'One surprising fact about one catalog place, said to camera or over moving footage of it. Never a list.'
  },
  weekend: {
    name: 'This weekend',
    format: 'video',
    brief: 'One dated outdoor thing on this weekend, from Talk of the town or the curated events. One event, not a roundup.'
  },
  drive: {
    name: 'Worth the drive',
    format: 'video',
    brief: 'One day trip from the worth the drive band, posted the morning families decide where to go.'
  },
  postcard: {
    name: 'Postcard',
    format: 'photo',
    brief: 'One owned photo of a real place, one line about it, and the photo credit. Scheduled a month ahead.'
  },
  app: {
    name: 'App moment',
    format: 'video',
    brief: 'Screen recording of the planner answering one real request a parent would type. The only slot where DayHop leads.'
  },
  holiday: {
    name: 'Long weekend',
    format: 'video',
    brief: 'One thing worth doing over the coming holiday weekend, posted the Thursday before so it lands while plans are made.'
  }
};

// Every week of the month.
const WEEKLY = [
  { day: 2, time: '19:30', pillar: 'hidden' },
  { day: 3, time: '12:00', pillar: 'postcard' },
  { day: 4, time: '19:30', pillar: 'weekend' },
  { day: 6, time: '08:30', pillar: 'drive' },
  { day: 0, time: '10:00', pillar: 'postcard' }
];

// Once a month. The app moment takes the first Monday. A holiday swaps the
// "This weekend" slot of the week before it for a long weekend post (see
// services/socialMonth.js).
const MONTHLY = [
  { rule: 'first-monday', time: '19:30', pillar: 'app' }
];

// Fixed tags by region, so captions never invent a hashtag. Five to eight
// GTA family tags, no #fyp (same rule as the Tuesday batch).
const HASHTAGS = {
  base: ['#DayHop', '#GTAfamilies', '#OntarioOutdoors', '#TorontoWeekend'],
  toronto: ['#Toronto', '#TorontoParks'],
  markham: ['#Markham', '#YorkRegion'],
  rh: ['#RichmondHill', '#YorkRegion'],
  newmarket: ['#Newmarket', '#YorkRegion'],
  hamilton: ['#Hamilton', '#HamOnt'],
  'lake-simcoe': ['#LakeSimcoe', '#Barrie']
};

module.exports = { CHANNELS, PILLARS, WEEKLY, MONTHLY, HASHTAGS };
