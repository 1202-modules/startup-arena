export class ParticipantNameError extends Error {
  constructor() {
    super("Name must contain 2 to 24 characters.");
    this.name = "ParticipantNameError";
  }
}

export interface NormalizedParticipantName {
  name: string;
  nameKey: string;
}

export function normalizeParticipantName(input: unknown): NormalizedParticipantName {
  if (typeof input !== "string") throw new ParticipantNameError();
  const name = input.trim().normalize("NFC");
  const length = [...name].length;
  if (length < 2 || length > 24) throw new ParticipantNameError();

  return {
    name,
    nameKey: name.normalize("NFKC").toLocaleLowerCase("ru-RU"),
  };
}
