// Authored neutral metadata, never harvested member passages or live databases.
export const scopedFixtures = [
  { name: 'sparse', description: 'Community for couples helping couples plan weddings.', sufficient: true },
  { name: 'ordinary-forum', description: 'Planning forum with questions and advice from fellow community members.', sufficient: true },
  { name: 'brides-grooms', description: 'Wedding forum where brides and grooms comment on questions and help other couples plan their weddings.', sufficient: true },
  { name: 'split-brides-grooms', title: 'Wedding planning forum', description: 'Brides and grooms comment on questions and help other couples plan their weddings.', sufficient: true },
  { name: 'partial', description: 'Planning forum where members share event planning advice.', sufficient: true },
  { name: 'mismatch', description: 'Public forum for homeowners discussing house-building and contractors.', sufficient: true },
  { name: 'title-boilerplate', title: 'Wedding planning group', description: 'Discover popular groups on Facebook. Facebook has 3 billion users.', sufficient: false },
  { name: 'city-thread', url: 'https://reddit.com/r/examplecity/comments/abc/wedding_budget', title: 'Wedding budget advice', description: 'One participant asks a wedding planning question.', sufficient: false },
  { name: 'unrelated', description: 'Another community helps couples plan weddings.', sufficient: false },
  { name: 'vendor', description: 'Vendor portfolio: our wedding forum article offers planning advice.', sufficient: false },
  { name: 'directory', description: 'Directory of planning forums where brides find links.', sufficient: false },
  { name: 'name-only', title: 'Wedding planning forum', sufficient: false },
]
export const scopedTarget = 'https://reddit.com/r/examplecity'
