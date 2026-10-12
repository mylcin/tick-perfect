/**
 * How many frames the game's clock check trails the present. Under heavy
 * load browsers can run two frames before handling a tap that arrived in
 * between, so this many frames of patience lets every queued tap be judged
 * before the hand counts as gone. At 60 fps that is about 33 ms.
 */
const JUDGE_FRAMES_BEHIND = 2;

/**
 * Remembers recent frame times and returns, for each new frame, the time of
 * the frame `framesBehind` before it (or the oldest one seen so far).
 */
export function createFrameLag(framesBehind = JUDGE_FRAMES_BEHIND) {
  const recent: number[] = [];
  return (now: number): number => {
    recent.push(now);
    if (recent.length > framesBehind + 1) recent.shift();
    return recent[0] ?? now;
  };
}
