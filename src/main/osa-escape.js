// AppleScript string-literal escaping. Backslash must be escaped before quote,
// or a trailing `\` in the input eats the closing quote and breaks out of the
// string (#40).
export const escapeOsaString = (s) => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
