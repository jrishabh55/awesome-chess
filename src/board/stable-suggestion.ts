export interface Suggestion {
  key: string;
  move: string;
}

/** Wait for an unchanged move, rather than waiting for the evaluation stream to stop. */
export class StableSuggestion {
  private key: string | undefined;
  private candidate: string | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(private publish: (suggestion: Suggestion | null) => void) {}
  update(key: string | undefined, move: string | undefined) {
    if (key !== this.key) {
      this.cancel();
      this.key = key;
      this.publish(null);
    }
    if (!key || !move) {
      this.cancel();
      this.key = key;
      this.publish(null);
      return;
    }
    if (move === this.candidate) return;
    clearTimeout(this.timer);
    this.candidate = move;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.publish({ key, move });
    }, 500);
  }
  cancel() {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.candidate = undefined;
    this.key = undefined;
  }
}
