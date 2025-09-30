class PlayError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "PlayError";
    this.code = code;
  }
}
