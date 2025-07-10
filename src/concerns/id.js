import { customAlphabet, urlAlphabet } from 'nanoid'

export const idGenerator = customAlphabet(urlAlphabet, 22)

// Password generator using nanoid with custom alphabet for better readability
// Excludes similar characters (0, O, 1, l, I) to avoid confusion
const passwordAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
export const passwordGenerator = customAlphabet(passwordAlphabet, 16)
