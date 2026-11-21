/** Voices the interviewer can use. `name` is how the interviewer introduces itself in that voice. */
export interface Voice {
  id: string;
  label: string;
  name: string;
}

export const VOICES: Voice[] = [
  { id: "MwUMLXurEzSN7bIfIdXF", label: "Tripti: calm and experienced (female)", name: "Tripti" },
  { id: "wlmwDR77ptH6bKHZui0l", label: "Riya: professional and neutral (female)", name: "Riya" },
  { id: "OUBnvvuqEKdDWtapoJFn", label: "Tia: crisp and commanding (female)", name: "Tia" },
  { id: "2iAXJEMO2o0PqUHzvZwQ", label: "Ranbir: neutral and clean (male)", name: "Ranbir" },
  { id: "x3gYeuNB0kLLYxOZsaSh", label: "Shrey: deep and engaging (male)", name: "Shrey" },
  { id: "MXGyTMlsvQgQ4BL0emIa", label: "Aakash: conversational and steady (male)", name: "Aakash" },
  { id: "gYf9sqh3BkV9QqFMN9Hs", label: "Anya: light and friendly (female)", name: "Maya" },
];

export const DEFAULT_VOICE = VOICES[0];

export const voiceById = (id: unknown): Voice => VOICES.find((v) => v.id === id) ?? DEFAULT_VOICE;

export const previewLine = (v: Voice) =>
  `Hi, I'm ${v.name}, and I'll be your interviewer today. To start, tell me about a project you're proud of, and what your own part in it was.`;
