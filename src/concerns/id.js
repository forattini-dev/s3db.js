import { customAlphabet, urlAlphabet } from 'nanoid'

export const idGenerator = customAlphabet(urlAlphabet, 22)
