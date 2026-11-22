/** Voices the interviewer can use. `name` is how the interviewer introduces itself in that voice. */
export interface Voice {
  id: string;
  label: string;
  name: string;
  gender: "female" | "male";
}

export const VOICES: Voice[] = [
  { id: "MwUMLXurEzSN7bIfIdXF", label: "Tripti: calm and experienced (female)", name: "Tripti", gender: "female" },
  { id: "wlmwDR77ptH6bKHZui0l", label: "Riya: professional and neutral (female)", name: "Riya", gender: "female" },
  { id: "OUBnvvuqEKdDWtapoJFn", label: "Tia: crisp and commanding (female)", name: "Tia", gender: "female" },
  { id: "2iAXJEMO2o0PqUHzvZwQ", label: "Ranbir: neutral and clean (male)", name: "Ranbir", gender: "male" },
  { id: "x3gYeuNB0kLLYxOZsaSh", label: "Shrey: deep and engaging (male)", name: "Shrey", gender: "male" },
  { id: "MXGyTMlsvQgQ4BL0emIa", label: "Aakash: conversational and steady (male)", name: "Aakash", gender: "male" },
  { id: "gYf9sqh3BkV9QqFMN9Hs", label: "Anya: light and friendly (female)", name: "Maya", gender: "female" },
];

export const DEFAULT_VOICE = VOICES[0];

export const voiceById = (id: unknown): Voice => VOICES.find((v) => v.id === id) ?? DEFAULT_VOICE;

export const previewLine = (v: Voice) =>
  `Hi, I'm ${v.name}, and I'll be your interviewer today. To start, tell me about a project you're proud of, and what your own part in it was.`;

export type LanguageCode = "en" | "hi";

export interface Language {
  code: LanguageCode;
  label: string;
  /** How the Interviewer is told to speak. */
  instruction: string;
}

export const LANGUAGES: Language[] = [
  { code: "en", label: "English", instruction: "English" },
  {
    code: "hi",
    label: "Hindi (with English technical terms)",
    instruction:
      "Hindi, the way working professionals in Indian cities actually speak it: natural, conversational Hindi sentences, with technical terms, product names, job titles and numbers kept in English. Write Hindi words in Devanagari and English words in Latin script. Do not use formal or literary Hindi",
  },
];

export const languageByCode = (code: unknown): Language => LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0];
