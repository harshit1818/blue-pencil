// Per-app delivery strategy. Keyed by bundle id (stable) with a process-name
// fallback. Three distinct strategies — see docs/phase2/rich-text-format-action.md:
//   mrkdwn → writeText(mdToSlack(md))                  (Slack renders markup on input)
//   rich   → write({ html: mdToHtml(md), text: md })   (default; text fallback covers
//                                                        markdown-as-text textareas too)
//   plain  → writeText(md)                             (markdown-native apps / terminals
//                                                        that would mangle an html flavor)

const BY_BUNDLE_ID = {
  'com.tinyspeck.slackmacgap': 'mrkdwn',
  'com.hnc.Discord': 'mrkdwn',

  'com.apple.mail': 'rich',
  'com.apple.Notes': 'rich',
  'com.apple.TextEdit': 'rich',
  'com.apple.iWork.Pages': 'rich',
  'com.microsoft.Word': 'rich',
  // Browsers can't reveal the focused web app; rich's text:md fallback makes this safe.
  'com.apple.Safari': 'rich',
  'com.google.Chrome': 'rich',
  'com.microsoft.edgemac': 'rich',
  'company.thebrowser.Browser': 'rich',
  'org.mozilla.firefox': 'rich',

  'md.obsidian': 'plain',
  'pro.writer.mac': 'plain',
  'com.apple.Terminal': 'plain',
  'com.googlecode.iterm2': 'plain'
}

// Process-name fallback for when the bundle id wasn't captured.
const BY_NAME = {
  Slack: 'mrkdwn',
  Discord: 'mrkdwn',
  Mail: 'rich',
  Notes: 'rich',
  TextEdit: 'rich',
  Pages: 'rich',
  'Microsoft Word': 'rich',
  Safari: 'rich',
  'Google Chrome': 'rich',
  Obsidian: 'plain',
  Terminal: 'plain',
  iTerm2: 'plain'
}

// Default to rich: its text:md fallback degrades gracefully in unknown apps
// (rich editors take the html, plain textareas read readable Markdown).
export function profileFor(bundleId, name) {
  return BY_BUNDLE_ID[bundleId] || BY_NAME[name] || 'rich'
}
