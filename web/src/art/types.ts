/**
 * Progressive-reveal artwork model.
 *
 * The idea: a tossup is a stack of clues read in order, and for visual fine
 * arts those clues are usually an inventory of things visible in the work. If
 * each clue is tied to a region of the painting, then reading the question
 * assembles the painting, and you buzz the moment the accumulating image
 * becomes recognisable. Nothing appears that has not been mentioned.
 */

/** A rectangle in normalized image space: 0..1 on both axes. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ArtElement {
  id: string;
  /** Shown in the study mode and as the reveal caption. */
  label: string;
  /**
   * Lowercase phrases that, appearing in a clue, mean this element was just
   * described. Order does not matter; the longest match wins for captioning.
   */
  keywords: string[];
  box: Box;
  /**
   * Elements that give the whole work away, e.g. a face everyone knows.
   * Revealed last when ordering is up to us, so the drill stays honest.
   */
  giveaway?: boolean;
}

export interface Artwork {
  id: string;
  title: string;
  artist: string;
  year: string;
  /** Served from public/art/<id>.jpg */
  image: string;
  /** Natural size of the shipped file, for aspect ratio without a load wait. */
  width: number;
  height: number;
  /**
   * Phrases that identify this work in a tossup's answer line, lowercased.
   * Used to decide which artwork a live question is about.
   */
  answerKeywords: string[];
  elements: ArtElement[];
}

/** One element revealed, with the clue text that triggered it. */
export interface Reveal {
  element: ArtElement;
  /** Index of the word that triggered it, for ordering and for the rail. */
  wordIndex: number;
  matched: string;
}
