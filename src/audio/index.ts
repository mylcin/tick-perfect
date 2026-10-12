import { createAudioEngine } from './audio-engine';

export type { SoundName } from './sounds';

/** The app's one audio engine; silent until the first gesture unlocks it. */
export const audio = createAudioEngine();
